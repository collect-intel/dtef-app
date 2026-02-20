/**
 * DTEF Statistical Validity Analysis
 *
 * Runs three analyses on existing evaluation data (no API calls):
 *   1. Null Model Baselines — uniform, population-marginal, shuffled
 *   2. Analytical Noise Floor — sample-size-based JSD noise estimates
 *   3. Pairwise Model Significance — permutation tests with Holm-Bonferroni
 *
 * Usage: pnpm analyze:stats
 */

import * as fs from 'fs';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { jsDivergenceSimilarity, normalize } from '../src/point-functions/distribution_metric';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
} from '../src/lib/storageService';
import { DemographicAggregationService } from '../src/cli/services/demographicAggregationService';
import type { DTEFSurveyData } from '../src/types/dtef';
import type { CoverageResult } from '../src/types/shared';

// ── Configuration ──────────────────────────────────────────────────────────
const SHUFFLE_ITERATIONS = 1000;
const PERMUTATION_ITERATIONS = 10_000;
const NOISE_THRESHOLD = 0.70;
const SIGNIFICANCE_ALPHA = 0.05;
const SURVEYS_DIR = path.resolve(__dirname, '..', 'data', 'surveys');
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

// ── Types ──────────────────────────────────────────────────────────────────

interface GroundTruth {
    segmentId: string;
    questionId: string;
    distribution: number[];
    sampleSize: number;
    k: number; // number of options
}

interface ModelQuestionScore {
    modelId: string;
    segmentId: string;
    questionId: string;
    score: number;
}

// ── Data Loading ───────────────────────────────────────────────────────────

async function loadSurveys(): Promise<DTEFSurveyData[]> {
    const files = fs.readdirSync(SURVEYS_DIR).filter(f => f.startsWith('gd') && f.endsWith('.json'));
    const surveys: DTEFSurveyData[] = [];
    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(SURVEYS_DIR, file), 'utf-8'));
        surveys.push(data);
    }
    console.log(`Loaded ${surveys.length} survey files: ${files.join(', ')}`);
    return surveys;
}

/**
 * Stream evaluation results one at a time, extracting only scores.
 * Only loads the latest run per config to reduce memory usage.
 * Each result is parsed, scores extracted, then GC'd.
 */
async function loadModelScoresFromS3(): Promise<{ scores: ModelQuestionScore[]; resultCount: number }> {
    const configIds = await listConfigIds();
    console.log(`Found ${configIds.length} config IDs in storage`);

    const scores: ModelQuestionScore[] = [];
    let resultCount = 0;

    for (const configId of configIds) {
        const runs = await listRunsForConfig(configId);
        // Only load the latest run per config (runs are sorted newest-first)
        const latestRun = runs[0];
        if (!latestRun) continue;

        try {
            const result = await getResultByFileName(configId, latestRun.fileName);
            if (!result || !DemographicAggregationService.isDTEFResult(result)) continue;

            resultCount++;

            // Extract scores immediately
            const ctx = DemographicAggregationService.extractDTEFContext(result);
            if (!ctx) continue;

            const coverageScores = result.evaluationResults?.llmCoverageScores;
            if (!coverageScores) continue;

            // Map promptIds to questionIds via config prompts
            const promptToQuestion = new Map<string, string>();
            if (result.config?.prompts) {
                for (const p of result.config.prompts) {
                    const dtefCtx = (p as any).dtefContext;
                    if (dtefCtx?.questionId) {
                        promptToQuestion.set(p.id, dtefCtx.questionId);
                    }
                }
            }

            for (const promptId of Object.keys(coverageScores)) {
                const promptScores = coverageScores[promptId];
                if (!promptScores) continue;

                let questionId = promptToQuestion.get(promptId) || promptId;

                for (const modelId of Object.keys(promptScores)) {
                    const coverage = promptScores[modelId] as CoverageResult;
                    if (!coverage || typeof coverage.avgCoverageExtent !== 'number') continue;

                    scores.push({
                        modelId,
                        segmentId: ctx.segmentId,
                        questionId,
                        score: coverage.avgCoverageExtent,
                    });
                }
            }
            // Result is now out of scope and eligible for GC
        } catch {
            // skip unreadable results
        }
    }

    console.log(`Processed ${resultCount} DTEF results, extracted ${scores.length} scores`);
    return { scores, resultCount };
}

function buildGroundTruthMap(surveys: DTEFSurveyData[]): Map<string, GroundTruth> {
    const map = new Map<string, GroundTruth>();
    for (const survey of surveys) {
        for (const segment of survey.segments) {
            for (const resp of segment.responses) {
                const key = `${segment.id}::${resp.questionId}`;
                const q = survey.questions[resp.questionId];
                map.set(key, {
                    segmentId: segment.id,
                    questionId: resp.questionId,
                    distribution: resp.distribution,
                    sampleSize: segment.sampleSize,
                    k: q?.options?.length ?? resp.distribution.length,
                });
            }
        }
    }
    return map;
}

/**
 * Compute the population-marginal distribution for each question:
 * weighted average of all segment distributions, weighted by sample size.
 */
function buildPopulationMarginals(surveys: DTEFSurveyData[]): Map<string, number[]> {
    const marginals = new Map<string, { weightedSum: number[]; totalWeight: number }>();

    for (const survey of surveys) {
        for (const segment of survey.segments) {
            for (const resp of segment.responses) {
                const key = `${survey.surveyId}::${resp.questionId}`;
                let entry = marginals.get(key);
                if (!entry) {
                    entry = { weightedSum: new Array(resp.distribution.length).fill(0), totalWeight: 0 };
                    marginals.set(key, entry);
                }
                for (let i = 0; i < resp.distribution.length; i++) {
                    entry.weightedSum[i] += resp.distribution[i] * segment.sampleSize;
                }
                entry.totalWeight += segment.sampleSize;
            }
        }
    }

    const result = new Map<string, number[]>();
    for (const [key, entry] of marginals) {
        result.set(key, entry.weightedSum.map(v => v / entry.totalWeight));
    }
    return result;
}

// extractModelScores is now inlined into loadModelScoresFromS3 to avoid holding full results

// ── Analysis 1: Null Model Baselines ───────────────────────────────────────

interface BaselineResult {
    name: string;
    meanScore: number;
    ci95Low?: number;
    ci95High?: number;
    pairCount: number;
}

function computeUniformBaseline(groundTruths: GroundTruth[]): BaselineResult {
    let totalScore = 0;
    for (const gt of groundTruths) {
        const uniform = new Array(gt.k).fill(100 / gt.k);
        totalScore += jsDivergenceSimilarity(uniform, gt.distribution);
    }
    return {
        name: 'Uniform',
        meanScore: groundTruths.length > 0 ? totalScore / groundTruths.length : 0,
        pairCount: groundTruths.length,
    };
}

function computePopulationMarginalBaseline(
    surveys: DTEFSurveyData[],
    populationMarginals: Map<string, number[]>,
): BaselineResult {
    let totalScore = 0;
    let count = 0;

    for (const survey of surveys) {
        for (const segment of survey.segments) {
            for (const resp of segment.responses) {
                const marginalKey = `${survey.surveyId}::${resp.questionId}`;
                const marginal = populationMarginals.get(marginalKey);
                if (!marginal) continue;

                totalScore += jsDivergenceSimilarity(marginal, resp.distribution);
                count++;
            }
        }
    }

    return {
        name: 'Population Marginal',
        meanScore: count > 0 ? totalScore / count : 0,
        pairCount: count,
    };
}

function computeShuffledBaseline(surveys: DTEFSurveyData[]): BaselineResult {
    // For each question, collect all segment distributions, then shuffle segment assignments
    const questionDistributions = new Map<string, { surveyId: string; distributions: number[][] }>();

    for (const survey of surveys) {
        for (const segment of survey.segments) {
            for (const resp of segment.responses) {
                const key = `${survey.surveyId}::${resp.questionId}`;
                let entry = questionDistributions.get(key);
                if (!entry) {
                    entry = { surveyId: survey.surveyId, distributions: [] };
                    questionDistributions.set(key, entry);
                }
                entry.distributions.push(resp.distribution);
            }
        }
    }

    const nullScores: number[] = [];

    for (let iter = 0; iter < SHUFFLE_ITERATIONS; iter++) {
        let iterScore = 0;
        let iterCount = 0;

        for (const [, entry] of questionDistributions) {
            const dists = entry.distributions;
            if (dists.length < 2) continue;

            // Create shuffled assignment: compare dist[i] against shuffled dist[sigma(i)]
            const shuffled = [...dists];
            // Fisher-Yates shuffle
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            for (let i = 0; i < dists.length; i++) {
                iterScore += jsDivergenceSimilarity(shuffled[i], dists[i]);
                iterCount++;
            }
        }

        if (iterCount > 0) {
            nullScores.push(iterScore / iterCount);
        }
    }

    nullScores.sort((a, b) => a - b);
    const mean = nullScores.reduce((a, b) => a + b, 0) / nullScores.length;
    const ci95Low = nullScores[Math.floor(nullScores.length * 0.025)];
    const ci95High = nullScores[Math.floor(nullScores.length * 0.975)];

    return {
        name: 'Shuffled (Permutation Null)',
        meanScore: mean,
        ci95Low,
        ci95High,
        pairCount: nullScores.length,
    };
}

// ── Analysis 2: Analytical Noise Floor ─────────────────────────────────────

interface NoiseFloorEntry {
    segmentId: string;
    questionId: string;
    k: number;
    n: number;
    expectedNoiseSimilarity: number;
    aboveThreshold: boolean;
}

interface NoiseCategorySummary {
    category: string;
    totalPairs: number;
    aboveThreshold: number;
    percentAbove: number;
    avgSampleSize: number;
    avgNoiseFloor: number;
}

function computeNoiseFloor(groundTruths: GroundTruth[], threshold: number): {
    entries: NoiseFloorEntry[];
    categorySummaries: NoiseCategorySummary[];
    thresholdAnalysis: { threshold: number; fractionAbove: number }[];
} {
    const entries: NoiseFloorEntry[] = [];

    for (const gt of groundTruths) {
        // Analytical noise floor: expected JSD similarity for pure sampling noise
        // with k options and n samples. Derived from expected chi-squared divergence.
        const expectedNoiseSimilarity = 1 - Math.sqrt((gt.k - 1) / (2 * gt.sampleSize * Math.LN2));
        entries.push({
            segmentId: gt.segmentId,
            questionId: gt.questionId,
            k: gt.k,
            n: gt.sampleSize,
            expectedNoiseSimilarity,
            aboveThreshold: expectedNoiseSimilarity > threshold,
        });
    }

    // Category summaries
    const byCategory = new Map<string, NoiseFloorEntry[]>();
    for (const entry of entries) {
        const category = entry.segmentId.split(':')[0] || 'unknown';
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category)!.push(entry);
    }

    const categorySummaries: NoiseCategorySummary[] = [];
    for (const [category, catEntries] of byCategory) {
        const aboveCount = catEntries.filter(e => e.aboveThreshold).length;
        categorySummaries.push({
            category,
            totalPairs: catEntries.length,
            aboveThreshold: aboveCount,
            percentAbove: (aboveCount / catEntries.length) * 100,
            avgSampleSize: catEntries.reduce((a, e) => a + e.n, 0) / catEntries.length,
            avgNoiseFloor: catEntries.reduce((a, e) => a + e.expectedNoiseSimilarity, 0) / catEntries.length,
        });
    }
    categorySummaries.sort((a, b) => b.percentAbove - a.percentAbove);

    // Threshold sweep
    const thresholdAnalysis: { threshold: number; fractionAbove: number }[] = [];
    for (const t of [0.50, 0.60, 0.70, 0.80, 0.90, 0.95]) {
        const above = entries.filter(e => e.expectedNoiseSimilarity > t).length;
        thresholdAnalysis.push({ threshold: t, fractionAbove: above / entries.length });
    }

    return { entries, categorySummaries, thresholdAnalysis };
}

// ── Analysis 3: Pairwise Model Significance ────────────────────────────────

interface PairwiseResult {
    modelA: string;
    modelB: string;
    meanDiff: number;
    pValue: number;
    adjustedPValue: number;
    significant: boolean;
    sharedQuestions: number;
}

function computePairwiseSignificance(modelScores: ModelQuestionScore[]): {
    pairwise: PairwiseResult[];
    tiers: string[][];
} {
    // Group scores by model → (segmentId::questionId) → score
    const modelMap = new Map<string, Map<string, number[]>>();
    for (const ms of modelScores) {
        if (!modelMap.has(ms.modelId)) modelMap.set(ms.modelId, new Map());
        const qMap = modelMap.get(ms.modelId)!;
        const key = `${ms.segmentId}::${ms.questionId}`;
        if (!qMap.has(key)) qMap.set(key, []);
        qMap.get(key)!.push(ms.score);
    }

    // Average duplicates (same model+segment+question from multiple runs)
    const modelAvg = new Map<string, Map<string, number>>();
    for (const [modelId, qMap] of modelMap) {
        const avgMap = new Map<string, number>();
        for (const [key, scores] of qMap) {
            avgMap.set(key, scores.reduce((a, b) => a + b, 0) / scores.length);
        }
        modelAvg.set(modelId, avgMap);
    }

    const modelIds = Array.from(modelAvg.keys()).sort();
    const pairwise: PairwiseResult[] = [];

    for (let i = 0; i < modelIds.length; i++) {
        for (let j = i + 1; j < modelIds.length; j++) {
            const mA = modelIds[i];
            const mB = modelIds[j];
            const scoresA = modelAvg.get(mA)!;
            const scoresB = modelAvg.get(mB)!;

            // Find shared questions
            const shared: string[] = [];
            for (const key of scoresA.keys()) {
                if (scoresB.has(key)) shared.push(key);
            }

            if (shared.length < 3) continue; // too few to test

            const diffs = shared.map(key => scoresA.get(key)! - scoresB.get(key)!);
            const observedMeanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            const absDiffObs = Math.abs(observedMeanDiff);

            // Permutation test: randomly flip signs of differences
            let exceedCount = 0;
            for (let p = 0; p < PERMUTATION_ITERATIONS; p++) {
                let permSum = 0;
                for (const d of diffs) {
                    permSum += Math.random() < 0.5 ? d : -d;
                }
                if (Math.abs(permSum / diffs.length) >= absDiffObs) {
                    exceedCount++;
                }
            }
            const pValue = exceedCount / PERMUTATION_ITERATIONS;

            pairwise.push({
                modelA: mA,
                modelB: mB,
                meanDiff: observedMeanDiff,
                pValue,
                adjustedPValue: pValue, // will be adjusted below
                significant: false,
                sharedQuestions: shared.length,
            });
        }
    }

    // Holm-Bonferroni correction
    pairwise.sort((a, b) => a.pValue - b.pValue);
    const m = pairwise.length;
    for (let i = 0; i < m; i++) {
        const adjusted = Math.min(1, pairwise[i].pValue * (m - i));
        pairwise[i].adjustedPValue = adjusted;
        pairwise[i].significant = adjusted < SIGNIFICANCE_ALPHA;
    }

    // Build tiers: group models that are NOT significantly different
    const tiers = buildTiers(modelIds, pairwise);

    return { pairwise, tiers };
}

/**
 * Group models into tiers of statistically indistinguishable performance.
 * Two models are in the same tier if they are not significantly different.
 * Uses union-find to group connected components.
 */
function buildTiers(modelIds: string[], pairwise: PairwiseResult[]): string[][] {
    const parent = new Map<string, string>();
    for (const id of modelIds) parent.set(id, id);

    function find(x: string): string {
        while (parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)!)!);
            x = parent.get(x)!;
        }
        return x;
    }

    function union(a: string, b: string) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    // Merge models that are NOT significantly different
    for (const p of pairwise) {
        if (!p.significant) {
            union(p.modelA, p.modelB);
        }
    }

    const groups = new Map<string, string[]>();
    for (const id of modelIds) {
        const root = find(id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(id);
    }

    return Array.from(groups.values());
}

// ── Report Generation ──────────────────────────────────────────────────────

function generateReport(
    baselines: BaselineResult[],
    modelOverallScores: Map<string, number>,
    noiseFloor: ReturnType<typeof computeNoiseFloor>,
    pairwiseResults: ReturnType<typeof computePairwiseSignificance>,
    surveyCount: number,
    resultCount: number,
): string {
    const lines: string[] = [];
    const ln = (s = '') => lines.push(s);

    ln('# DTEF Statistical Validity Report');
    ln();
    ln(`*Generated: ${new Date().toISOString()}*`);
    ln();
    ln(`**Data:** ${surveyCount} surveys, ${resultCount} evaluation results`);
    ln();

    // ── Executive Summary ──
    ln('## Executive Summary');
    ln();

    const uniformBaseline = baselines.find(b => b.name === 'Uniform')!;
    const marginalBaseline = baselines.find(b => b.name === 'Population Marginal')!;
    const shuffledBaseline = baselines.find(b => b.name.startsWith('Shuffled'))!;

    const modelScoreValues = Array.from(modelOverallScores.values());
    const avgModelScore = modelScoreValues.length > 0
        ? modelScoreValues.reduce((a, b) => a + b, 0) / modelScoreValues.length
        : 0;
    const bestModelScore = modelScoreValues.length > 0 ? Math.max(...modelScoreValues) : 0;

    const sigPairs = pairwiseResults.pairwise.filter(p => p.significant).length;
    const totalPairs = pairwiseResults.pairwise.length;

    ln('### Key Findings');
    ln();
    ln(`- **Models vs. Uniform baseline:** Average model score (${avgModelScore.toFixed(3)}) vs uniform (${uniformBaseline.meanScore.toFixed(3)}), effect size = **+${(avgModelScore - uniformBaseline.meanScore).toFixed(3)}**`);
    const marginalDiff = avgModelScore - marginalBaseline.meanScore;
    ln(`- **Models vs. Population Marginal:** Effect size = **${marginalDiff >= 0 ? '+' : ''}${marginalDiff.toFixed(3)}** (${marginalDiff >= 0 ? 'models add value beyond' : 'models do not yet exceed'} just knowing the overall population distribution)`);
    ln(`- **Models vs. Shuffled Null:** Shuffled mean = ${shuffledBaseline.meanScore.toFixed(3)} [${shuffledBaseline.ci95Low?.toFixed(3)}, ${shuffledBaseline.ci95High?.toFixed(3)}], best model = ${bestModelScore.toFixed(3)}`);
    ln(`- **Noise floor:** ${((noiseFloor.thresholdAnalysis.find(t => t.threshold === NOISE_THRESHOLD)?.fractionAbove ?? 0) * 100).toFixed(1)}% of segment-question pairs have noise floor > ${NOISE_THRESHOLD}`);
    ln(`- **Pairwise significance:** ${sigPairs}/${totalPairs} model pairs significantly different (α = ${SIGNIFICANCE_ALPHA}, Holm-Bonferroni corrected)`);
    ln(`- **Model tiers:** ${pairwiseResults.tiers.length} statistically distinguishable tier(s)`);
    ln();

    // ── Analysis 1: Baselines ──
    ln('## Analysis 1: Null Model Baselines');
    ln();
    ln('Comparison of actual model scores against naive predictors that use no model intelligence.');
    ln();
    ln('| Baseline | Mean Score | 95% CI | (Segment, Question) Pairs |');
    ln('|----------|-----------|--------|---------------------------|');
    for (const b of baselines) {
        const ci = b.ci95Low != null ? `[${b.ci95Low.toFixed(3)}, ${b.ci95High!.toFixed(3)}]` : '—';
        ln(`| ${b.name} | ${b.meanScore.toFixed(3)} | ${ci} | ${b.pairCount.toLocaleString()} |`);
    }
    ln();

    ln('### Model Scores vs. Baselines');
    ln();
    ln('| Model | Overall Score | vs. Uniform | vs. Marginal | vs. Shuffled |');
    ln('|-------|-------------|-------------|--------------|--------------|');

    const fmtDiff = (v: number) => v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3);
    const sortedModels = Array.from(modelOverallScores.entries()).sort((a, b) => b[1] - a[1]);
    for (const [modelId, score] of sortedModels) {
        const shortName = modelId.replace(/^openrouter:/, '');
        ln(`| ${shortName} | ${score.toFixed(3)} | ${fmtDiff(score - uniformBaseline.meanScore)} | ${fmtDiff(score - marginalBaseline.meanScore)} | ${fmtDiff(score - shuffledBaseline.meanScore)} |`);
    }
    ln();

    // ── Analysis 2: Noise Floor ──
    ln('## Analysis 2: Analytical Noise Floor');
    ln();
    ln(`Expected JSD similarity from sampling noise alone: \`1 - sqrt((k-1) / (2n × ln2))\``);
    ln();
    ln(`Threshold for flagging: ${NOISE_THRESHOLD}`);
    ln();
    ln('### By Segment Category');
    ln();
    ln('| Category | Pairs | Avg Sample Size | Avg Noise Floor | % Above Threshold |');
    ln('|----------|-------|----------------|----------------|-------------------|');
    for (const cat of noiseFloor.categorySummaries) {
        ln(`| ${cat.category} | ${cat.totalPairs} | ${cat.avgSampleSize.toFixed(0)} | ${cat.avgNoiseFloor.toFixed(3)} | ${cat.percentAbove.toFixed(1)}% |`);
    }
    ln();

    ln('### Threshold Sweep');
    ln();
    ln('| Noise Floor Threshold | % of Pairs Above |');
    ln('|----------------------|------------------|');
    for (const t of noiseFloor.thresholdAnalysis) {
        ln(`| ${t.threshold.toFixed(2)} | ${(t.fractionAbove * 100).toFixed(1)}% |`);
    }
    ln();

    // Distribution of noise floors
    const noiseBins = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    ln('### Noise Floor Distribution');
    ln();
    ln('| Range | Count | % |');
    ln('|-------|-------|---|');
    for (let i = 0; i < noiseBins.length - 1; i++) {
        const low = noiseBins[i];
        const high = noiseBins[i + 1];
        const count = noiseFloor.entries.filter(e =>
            e.expectedNoiseSimilarity >= low && e.expectedNoiseSimilarity < high
        ).length;
        ln(`| [${low.toFixed(1)}, ${high.toFixed(1)}) | ${count} | ${(count / noiseFloor.entries.length * 100).toFixed(1)}% |`);
    }
    ln();

    ln('### Minimum Sample Size Recommendations');
    ln();
    ln('For noise floor below 0.90 (where model differentiation is feasible):');
    ln();
    ln('| Options (k) | Min n for noise < 0.90 | Min n for noise < 0.80 | Min n for noise < 0.70 |');
    ln('|-------------|----------------------|----------------------|----------------------|');
    for (const k of [3, 4, 5, 6, 7]) {
        const nFor90 = Math.ceil((k - 1) / (2 * Math.pow(1 - 0.90, 2) * Math.LN2));
        const nFor80 = Math.ceil((k - 1) / (2 * Math.pow(1 - 0.80, 2) * Math.LN2));
        const nFor70 = Math.ceil((k - 1) / (2 * Math.pow(1 - 0.70, 2) * Math.LN2));
        ln(`| ${k} | ${nFor90} | ${nFor80} | ${nFor70} |`);
    }
    ln();

    // ── Analysis 3: Pairwise ──
    ln('## Analysis 3: Pairwise Model Significance');
    ln();
    ln(`Permutation test (${PERMUTATION_ITERATIONS.toLocaleString()} iterations) with Holm-Bonferroni correction at α = ${SIGNIFICANCE_ALPHA}.`);
    ln();

    if (pairwiseResults.pairwise.length === 0) {
        ln('*No model pairs with sufficient shared questions for testing.*');
    } else {
        ln('### Significant Differences');
        ln();
        ln('| Model A | Model B | Mean Diff | Raw p | Adjusted p | Shared Qs | Sig? |');
        ln('|---------|---------|-----------|-------|------------|-----------|------|');

        const sorted = [...pairwiseResults.pairwise].sort((a, b) => a.adjustedPValue - b.adjustedPValue);
        for (const p of sorted) {
            const shortA = p.modelA.replace(/^openrouter:/, '');
            const shortB = p.modelB.replace(/^openrouter:/, '');
            const sig = p.significant ? '**Yes**' : 'No';
            ln(`| ${shortA} | ${shortB} | ${p.meanDiff > 0 ? '+' : ''}${p.meanDiff.toFixed(4)} | ${p.pValue.toFixed(4)} | ${p.adjustedPValue.toFixed(4)} | ${p.sharedQuestions} | ${sig} |`);
        }
        ln();
    }

    ln('### Model Tiers');
    ln();
    ln('Models within the same tier are not statistically distinguishable at the given significance level.');
    ln();
    for (let i = 0; i < pairwiseResults.tiers.length; i++) {
        const tier = pairwiseResults.tiers[i];
        // Sort tier by overall score
        const sorted = tier
            .map(id => ({ id, score: modelOverallScores.get(id) ?? 0 }))
            .sort((a, b) => b.score - a.score);
        const avgTierScore = sorted.reduce((a, m) => a + m.score, 0) / sorted.length;
        ln(`**Tier ${i + 1}** (avg: ${avgTierScore.toFixed(3)}):`);
        for (const m of sorted) {
            const shortName = m.id.replace(/^openrouter:/, '');
            ln(`  - ${shortName} (${m.score.toFixed(3)})`);
        }
        ln();
    }

    // ── Methodology ──
    ln('---');
    ln();
    ln('## Methodology Notes');
    ln();
    ln('- **JSD Similarity:** Uses `1 - sqrt(JSD)` (Jensen-Shannon Distance) as the similarity metric, matching the evaluation pipeline.');
    ln(`- **Shuffled baseline:** ${SHUFFLE_ITERATIONS} iterations shuffling segment-distribution assignments within each question.`);
    ln(`- **Permutation test:** ${PERMUTATION_ITERATIONS.toLocaleString()} iterations flipping sign of paired differences.`);
    ln('- **Holm-Bonferroni:** Sequential correction that controls family-wise error rate while being less conservative than Bonferroni.');
    ln('- **Noise floor formula:** `1 - sqrt((k-1) / (2n × ln2))` — the expected JSD similarity between a true distribution and one drawn from it with n samples and k categories.');
    ln('- **Tier construction:** Union-find grouping models that are NOT significantly different. Transitive grouping may produce larger tiers.');
    ln();

    return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  DTEF Statistical Validity Analysis');
    console.log('═══════════════════════════════════════════════════════');
    console.log();

    // Load data
    console.log('── Loading survey data ──');
    const surveys = await loadSurveys();

    // Build ground truth and marginals (from local survey files — small)
    const groundTruthMap = buildGroundTruthMap(surveys);
    const groundTruths = Array.from(groundTruthMap.values());
    console.log(`Ground truth: ${groundTruths.length} (segment, question) pairs across ${surveys.length} surveys`);

    const populationMarginals = buildPopulationMarginals(surveys);

    // Stream evaluation results from S3, extracting only scores (avoids OOM)
    console.log('── Loading evaluation results from S3 (streaming) ──');
    const { scores: modelScores, resultCount } = await loadModelScoresFromS3();

    if (resultCount === 0) {
        console.log('\n⚠ No DTEF evaluation results found. Running survey-only analyses.\n');
    }

    // Compute model overall scores for the report
    const modelTotals = new Map<string, { sum: number; count: number }>();
    for (const ms of modelScores) {
        if (!modelTotals.has(ms.modelId)) modelTotals.set(ms.modelId, { sum: 0, count: 0 });
        const entry = modelTotals.get(ms.modelId)!;
        entry.sum += ms.score;
        entry.count++;
    }
    const modelOverallScores = new Map<string, number>();
    for (const [id, data] of modelTotals) {
        modelOverallScores.set(id, data.sum / data.count);
    }
    console.log(`Models found: ${modelOverallScores.size}`);

    // Analysis 1: Null Model Baselines
    console.log('\n── Analysis 1: Null Model Baselines ──');
    const uniformBaseline = computeUniformBaseline(groundTruths);
    console.log(`  Uniform baseline: ${uniformBaseline.meanScore.toFixed(3)}`);

    const marginalBaseline = computePopulationMarginalBaseline(surveys, populationMarginals);
    console.log(`  Population marginal: ${marginalBaseline.meanScore.toFixed(3)}`);

    console.log(`  Computing shuffled baseline (${SHUFFLE_ITERATIONS} iterations)...`);
    const shuffledBaseline = computeShuffledBaseline(surveys);
    console.log(`  Shuffled baseline: ${shuffledBaseline.meanScore.toFixed(3)} [${shuffledBaseline.ci95Low?.toFixed(3)}, ${shuffledBaseline.ci95High?.toFixed(3)}]`);

    const baselines = [uniformBaseline, marginalBaseline, shuffledBaseline];

    // Analysis 2: Noise Floor
    console.log('\n── Analysis 2: Analytical Noise Floor ──');
    const noiseFloor = computeNoiseFloor(groundTruths, NOISE_THRESHOLD);
    const aboveThreshold = noiseFloor.entries.filter(e => e.aboveThreshold).length;
    console.log(`  ${aboveThreshold}/${noiseFloor.entries.length} pairs have noise floor > ${NOISE_THRESHOLD}`);

    // Analysis 3: Pairwise Significance
    console.log('\n── Analysis 3: Pairwise Model Significance ──');
    if (modelScores.length > 0) {
        console.log(`  Running permutation tests (${PERMUTATION_ITERATIONS.toLocaleString()} iterations)...`);
    }
    const pairwiseResults = computePairwiseSignificance(modelScores);
    const sigCount = pairwiseResults.pairwise.filter(p => p.significant).length;
    console.log(`  ${sigCount}/${pairwiseResults.pairwise.length} pairs significantly different`);
    console.log(`  ${pairwiseResults.tiers.length} tier(s) identified`);

    // Generate report
    console.log('\n── Generating report ──');
    const report = generateReport(
        baselines,
        modelOverallScores,
        noiseFloor,
        pairwiseResults,
        surveys.length,
        resultCount,
    );

    await fsPromises.mkdir(REPORTS_DIR, { recursive: true });
    const reportPath = path.join(REPORTS_DIR, 'statistical-validity-report.md');
    await fsPromises.writeFile(reportPath, report, 'utf-8');
    console.log(`\nReport written to: ${reportPath}`);
    console.log('Done.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
