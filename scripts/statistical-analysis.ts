/**
 * DTEF Statistical Validity Analysis
 *
 * Runs four analyses on existing evaluation data (no API calls):
 *   1. Null Model Baselines — uniform, population-marginal, shuffled
 *   2. Analytical Noise Floor — sample-size-based JSD noise estimates
 *   3. Pairwise Model Significance — permutation tests with Holm-Bonferroni
 *   4. Context Responsiveness — does more demographic context improve accuracy?
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
import type { ContextDataPoint } from '../src/cli/services/demographicAggregationService';
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
    contextCount: number;
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

            const contextCount = DemographicAggregationService.extractContextCount(result) ?? 0;

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
                        contextCount,
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

    return { pairwise };
}

// ── Analysis 4: Context Responsiveness ──────────────────────────────────────

interface ContextResponsivenessResult {
    modelId: string;
    observedSlope: number;
    pValue: number;
    adjustedPValue: number;
    significant: boolean;
    contextLevels: number;
    dataPoints: number;
}

interface CategoryContextResult {
    modelId: string;
    category: string;
    observedSlope: number;
    pValue: number;
    adjustedPValue: number;
    significant: boolean;
    dataPoints: number;
}

function computeContextResponsiveness(modelScores: ModelQuestionScore[]): {
    perModel: ContextResponsivenessResult[];
    categoryResults: CategoryContextResult[];
} {
    // Check if we have variation in context counts
    const contextCounts = new Set(modelScores.map(s => s.contextCount));
    if (contextCounts.size < 2) {
        return { perModel: [], categoryResults: [] };
    }

    // Group by model
    const byModel = new Map<string, ModelQuestionScore[]>();
    for (const ms of modelScores) {
        if (!byModel.has(ms.modelId)) byModel.set(ms.modelId, []);
        byModel.get(ms.modelId)!.push(ms);
    }

    const perModel: ContextResponsivenessResult[] = [];

    for (const [modelId, scores] of byModel) {
        // Group by (segmentId, questionId, contextCount) → average score
        const grouped = new Map<string, { sum: number; count: number }>();
        for (const s of scores) {
            const key = `${s.segmentId}::${s.questionId}::${s.contextCount}`;
            if (!grouped.has(key)) grouped.set(key, { sum: 0, count: 0 });
            const entry = grouped.get(key)!;
            entry.sum += s.score;
            entry.count++;
        }

        // For each (segmentId, questionId), collect (contextCount, avgScore) points
        const segmentQuestionPoints = new Map<string, ContextDataPoint[]>();
        for (const [key, entry] of grouped) {
            const parts = key.split('::');
            const sqKey = `${parts[0]}::${parts[1]}`;
            const contextCount = parseInt(parts[2], 10);
            if (!segmentQuestionPoints.has(sqKey)) segmentQuestionPoints.set(sqKey, []);
            segmentQuestionPoints.get(sqKey)!.push({
                contextCount,
                score: entry.sum / entry.count,
            });
        }

        // For each segment-question pair with 2+ context levels, compute regression slope
        const slopes: number[] = [];
        const allPoints: ContextDataPoint[] = [];
        for (const [, points] of segmentQuestionPoints) {
            if (points.length < 2) continue;
            const slope = DemographicAggregationService.linearRegressionSlope(points);
            slopes.push(slope);
            allPoints.push(...points);
        }

        if (slopes.length === 0) continue;

        const observedSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;

        // Permutation test: shuffle contextCount labels across all points, recompute slopes
        let exceedCount = 0;
        const contextLabels = allPoints.map(p => p.contextCount);

        for (let iter = 0; iter < PERMUTATION_ITERATIONS; iter++) {
            // Shuffle context labels
            const shuffled = [...contextLabels];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Reassign and recompute per-segment slopes
            let pointIdx = 0;
            const permSlopes: number[] = [];
            for (const [, points] of segmentQuestionPoints) {
                if (points.length < 2) continue;
                const permPoints: ContextDataPoint[] = points.map((p, pi) => ({
                    contextCount: shuffled[pointIdx + pi],
                    score: p.score,
                }));
                pointIdx += points.length;
                permSlopes.push(DemographicAggregationService.linearRegressionSlope(permPoints));
            }

            const permMeanSlope = permSlopes.reduce((a, b) => a + b, 0) / permSlopes.length;
            if (permMeanSlope >= observedSlope) {
                exceedCount++;
            }
        }

        const pValue = exceedCount / PERMUTATION_ITERATIONS;
        perModel.push({
            modelId,
            observedSlope,
            pValue,
            adjustedPValue: pValue,
            significant: false,
            contextLevels: contextCounts.size,
            dataPoints: allPoints.length,
        });
    }

    // Holm-Bonferroni correction
    perModel.sort((a, b) => a.pValue - b.pValue);
    const m = perModel.length;
    for (let i = 0; i < m; i++) {
        const adjusted = Math.min(1, perModel[i].pValue * (m - i));
        perModel[i].adjustedPValue = adjusted;
        perModel[i].significant = adjusted < SIGNIFICANCE_ALPHA;
    }

    // Category-level significance tests (model × category permutation tests)
    const SEGMENT_CATEGORIES: Record<string, string> = {
        age: 'Age', gender: 'Gender', country: 'Country',
        environment: 'Environment', ai_concern: 'AI Concern', religion: 'Religion',
    };

    const categoryResults: CategoryContextResult[] = [];

    for (const [catPrefix, catLabel] of Object.entries(SEGMENT_CATEGORIES)) {
        const catScores = modelScores.filter(s => s.segmentId.startsWith(catPrefix + ':'));
        if (catScores.length === 0) continue;

        const catByModel = new Map<string, ModelQuestionScore[]>();
        for (const s of catScores) {
            if (!catByModel.has(s.modelId)) catByModel.set(s.modelId, []);
            catByModel.get(s.modelId)!.push(s);
        }

        for (const [modelId, scores] of catByModel) {
            const grouped = new Map<string, { sum: number; count: number }>();
            for (const s of scores) {
                const key = `${s.segmentId}::${s.questionId}::${s.contextCount}`;
                if (!grouped.has(key)) grouped.set(key, { sum: 0, count: 0 });
                const entry = grouped.get(key)!;
                entry.sum += s.score;
                entry.count++;
            }

            const sqPoints = new Map<string, ContextDataPoint[]>();
            for (const [key, entry] of grouped) {
                const parts = key.split('::');
                const sqKey = `${parts[0]}::${parts[1]}`;
                const contextCount = parseInt(parts[2], 10);
                if (!sqPoints.has(sqKey)) sqPoints.set(sqKey, []);
                sqPoints.get(sqKey)!.push({ contextCount, score: entry.sum / entry.count });
            }

            const slopes: number[] = [];
            const allCatPoints: ContextDataPoint[] = [];
            for (const [, points] of sqPoints) {
                if (points.length < 2) continue;
                slopes.push(DemographicAggregationService.linearRegressionSlope(points));
                allCatPoints.push(...points);
            }

            if (slopes.length === 0) continue;

            const observedSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;

            // Permutation test within this model × category
            let exceedCount = 0;
            const contextLabels = allCatPoints.map(p => p.contextCount);

            for (let iter = 0; iter < PERMUTATION_ITERATIONS; iter++) {
                const shuffled = [...contextLabels];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }

                let pointIdx = 0;
                const permSlopes: number[] = [];
                for (const [, points] of sqPoints) {
                    if (points.length < 2) continue;
                    const permPoints: ContextDataPoint[] = points.map((p, pi) => ({
                        contextCount: shuffled[pointIdx + pi],
                        score: p.score,
                    }));
                    pointIdx += points.length;
                    permSlopes.push(DemographicAggregationService.linearRegressionSlope(permPoints));
                }

                const permMeanSlope = permSlopes.reduce((a, b) => a + b, 0) / permSlopes.length;
                if (permMeanSlope >= observedSlope) {
                    exceedCount++;
                }
            }

            categoryResults.push({
                modelId,
                category: catLabel,
                observedSlope,
                pValue: exceedCount / PERMUTATION_ITERATIONS,
                adjustedPValue: 0,
                significant: false,
                dataPoints: allCatPoints.length,
            });
        }
    }

    // Joint Holm-Bonferroni across ALL model × category pairs
    categoryResults.sort((a, b) => a.pValue - b.pValue);
    const mc = categoryResults.length;
    for (let i = 0; i < mc; i++) {
        const adjusted = Math.min(1, categoryResults[i].pValue * (mc - i));
        categoryResults[i].adjustedPValue = adjusted;
        categoryResults[i].significant = adjusted < SIGNIFICANCE_ALPHA;
    }

    return { perModel, categoryResults };
}

// ── Report Generation ──────────────────────────────────────────────────────

function generateReport(
    baselines: BaselineResult[],
    modelOverallScores: Map<string, number>,
    noiseFloor: ReturnType<typeof computeNoiseFloor>,
    pairwiseResults: ReturnType<typeof computePairwiseSignificance>,
    contextResults: ReturnType<typeof computeContextResponsiveness>,
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
    ln('### What This Report Tells You');
    ln();
    ln('This report evaluates how well AI models predict demographic opinion distributions — that is, given a demographic group (e.g., "18-25 year olds in Brazil"), can the model predict how that group would respond to survey questions? We compare model predictions against real survey data from Global Dialogues rounds, testing whether models do better than simple baselines, whether our data quality is sufficient for reliable evaluation, whether any models are statistically distinguishable from each other, and whether giving models more demographic context actually improves their predictions.');
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
    ln(`- **Data quality:** ${((noiseFloor.thresholdAnalysis.find(t => t.threshold === NOISE_THRESHOLD)?.fractionAbove ?? 0) * 100).toFixed(1)}% of segment-question pairs have high enough sample sizes for reliable evaluation (noise floor > ${NOISE_THRESHOLD})`);
    ln(`- **Pairwise significance:** ${sigPairs}/${totalPairs} model pairs significantly different (α = ${SIGNIFICANCE_ALPHA}, Holm-Bonferroni corrected)`);
    if (contextResults.perModel.length > 0) {
        const sigContext = contextResults.perModel.filter(r => r.significant).length;
        ln(`- **Context responsiveness:** ${sigContext}/${contextResults.perModel.length} models show significant improvement with more demographic context`);
    }
    ln();

    // ── Analysis 1: Baselines ──
    ln('## Analysis 1: Null Model Baselines');
    ln();
    ln('> **What this measures:** We compare model predictions against three "dumb" baselines that require no AI. If models can\'t beat these baselines, they aren\'t adding real value. The **Uniform** baseline guesses equal probability for every option. The **Population Marginal** baseline uses the overall population\'s answer distribution (ignoring demographics entirely). The **Shuffled** baseline assigns random demographic segments to each question, measuring how much demographic identity actually matters for each question.');
    ln();
    ln('| Baseline | Mean Score | 95% CI | (Segment, Question) Pairs |');
    ln('|----------|-----------|--------|---------------------------|');
    for (const b of baselines) {
        const ci = b.ci95Low != null ? `[${b.ci95Low.toFixed(3)}, ${b.ci95High!.toFixed(3)}]` : '—';
        ln(`| ${b.name} | ${b.meanScore.toFixed(3)} | ${ci} | ${b.pairCount.toLocaleString()} |`);
    }
    ln();

    if (marginalDiff < 0) {
        ln('> **Interpretation:** The population marginal baseline currently outperforms the models. This means models aren\'t yet adding demographic-specific knowledge beyond what you\'d get from just knowing the overall population distribution. The models know *what people in general think* but haven\'t learned *how specific demographics differ* from the population average.');
        ln();
    }

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
    ln('## Analysis 2: Analytical Noise Floor (Data Quality)');
    ln();
    ln('> **What this measures:** The noise floor tells us how similar two samples drawn from the *same* distribution would look, given the sample size. A **higher noise floor is better** — it means the data has enough samples that random sampling variation is small, and we can reliably distinguish real differences from noise. Pairs *below* the threshold have too few samples for confident evaluation.');
    ln();
    ln(`Formula: \`1 - sqrt((k-1) / (2n × ln2))\` where k = number of options, n = sample size.`);
    ln();
    ln(`Quality threshold: ${NOISE_THRESHOLD} (pairs above this have sufficient data quality for reliable evaluation)`);
    ln();
    ln('### By Segment Category');
    ln();
    ln('| Category | Pairs | Avg Sample Size | Avg Noise Floor | % Reliable (Above Threshold) |');
    ln('|----------|-------|----------------|----------------|------------------------------|');
    for (const cat of noiseFloor.categorySummaries) {
        ln(`| ${cat.category} | ${cat.totalPairs} | ${cat.avgSampleSize.toFixed(0)} | ${cat.avgNoiseFloor.toFixed(3)} | ${cat.percentAbove.toFixed(1)}% |`);
    }
    ln();

    ln('> **Reading this table:** Categories with high "% Reliable" have large sample sizes and clean data — evaluation results for these segments are trustworthy. Categories with low reliability (typically country-level segments with n~33) should be interpreted cautiously, as sampling noise alone could account for apparent model differences.');
    ln();

    ln('### Threshold Sweep');
    ln();
    ln('| Quality Threshold | % of Pairs Meeting Threshold |');
    ln('|-------------------|------------------------------|');
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
    ln('Minimum respondents needed per segment to achieve a given noise floor:');
    ln();
    ln('| Options (k) | n for 0.90 floor | n for 0.80 floor | n for 0.70 floor |');
    ln('|-------------|-----------------|-----------------|-----------------|');
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
    ln('> **What this measures:** For each pair of models, we test whether the difference in their scores is statistically significant or could be explained by chance. A permutation test shuffles which model\'s score is which and checks whether the observed difference is unusually large. Statistical significance does *not* imply practical importance — a highly significant difference might still be too small to matter.');
    ln();
    ln(`Permutation test (${PERMUTATION_ITERATIONS.toLocaleString()} iterations) with Holm-Bonferroni correction at α = ${SIGNIFICANCE_ALPHA}.`);
    ln();

    if (pairwiseResults.pairwise.length === 0) {
        ln('*No model pairs with sufficient shared questions for testing.*');
    } else {
        const sigSummary = pairwiseResults.pairwise.filter(p => p.significant).length;
        ln(`**Summary:** ${sigSummary} of ${pairwiseResults.pairwise.length} model pairs (${(sigSummary / pairwiseResults.pairwise.length * 100).toFixed(1)}%) show statistically significant differences.`);
        ln();
        ln('### Pairwise Comparison Table');
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

    // ── Analysis 4: Context Responsiveness ──
    ln('## Analysis 4: Context Responsiveness');
    ln();
    ln('> **What this measures:** When we give a model more demographic context questions in its prompt (e.g., telling it not just the country but also the age group, gender, and religion of the respondents), does its prediction accuracy improve? A positive slope means more context = better predictions. We test significance via permutation: if randomly reassigning context counts produces slopes as large as the observed one, the relationship is not meaningful.');
    ln();

    if (contextResults.perModel.length === 0) {
        ln('*Insufficient context count variation to test. All evaluations used the same number of context questions, or no evaluation data is available.*');
        ln();
    } else {
        ln('### Per-Model Context Responsiveness');
        ln();
        ln('| Model | Observed Slope | p-value | Adjusted p | Context Levels | Data Points | Significant? |');
        ln('|-------|---------------|---------|------------|----------------|-------------|-------------|');
        const sortedCtx = [...contextResults.perModel].sort((a, b) => b.observedSlope - a.observedSlope);
        for (const r of sortedCtx) {
            const shortName = r.modelId.replace(/^openrouter:/, '');
            const sig = r.significant ? '**Yes**' : 'No';
            ln(`| ${shortName} | ${r.observedSlope >= 0 ? '+' : ''}${r.observedSlope.toFixed(6)} | ${r.pValue.toFixed(4)} | ${r.adjustedPValue.toFixed(4)} | ${r.contextLevels} | ${r.dataPoints} | ${sig} |`);
        }
        ln();

        const sigModels = contextResults.perModel.filter(r => r.significant);
        if (sigModels.length > 0) {
            ln(`> **Interpretation:** ${sigModels.length} model(s) show statistically significant improvement with more demographic context. This suggests these models can meaningfully use additional demographic information to make better predictions about group-specific opinion distributions.`);
        } else {
            ln('> **Interpretation:** No models show statistically significant improvement with more demographic context. This could mean models aren\'t effectively using the additional context, or that the current range of context counts is too narrow to detect an effect.');
        }
        ln();

        if (contextResults.categoryResults.length > 0) {
            ln('### Significance by Model × Category');
            ln();
            ln(`> **Multiple comparisons correction:** Each model × category combination is tested independently, then Holm-Bonferroni is applied jointly across all ${contextResults.categoryResults.length} tests. This controls for the fact that with enough model-category pairs, some would show positive slopes by pure chance. Only combinations that survive this joint correction are marked significant.`);
            ln();

            // Group by category for display
            const categories = [...new Set(contextResults.categoryResults.map(r => r.category))];
            const sigCatResults = contextResults.categoryResults.filter(r => r.significant);
            const totalCatTests = contextResults.categoryResults.length;
            ln(`**Summary:** ${sigCatResults.length} of ${totalCatTests} model×category pairs significant after joint correction.`);
            ln();

            if (sigCatResults.length > 0) {
                ln('#### Significant Model × Category Pairs');
                ln();
                ln('| Category | Model | Slope | Raw p | Adjusted p | Data Points |');
                ln('|----------|-------|-------|-------|------------|-------------|');
                for (const r of sigCatResults.sort((a, b) => a.adjustedPValue - b.adjustedPValue)) {
                    const shortName = r.modelId.replace(/^openrouter:/, '');
                    ln(`| ${r.category} | ${shortName} | ${r.observedSlope >= 0 ? '+' : ''}${r.observedSlope.toFixed(6)} | ${r.pValue.toFixed(4)} | ${r.adjustedPValue.toFixed(4)} | ${r.dataPoints} |`);
                }
                ln();
            }

            for (const cat of categories) {
                const catResults = contextResults.categoryResults
                    .filter(r => r.category === cat)
                    .sort((a, b) => b.observedSlope - a.observedSlope);
                ln(`**${cat}:**`);
                ln();
                ln('| Model | Slope | Raw p | Adjusted p | Data Points | Sig? |');
                ln('|-------|-------|-------|------------|-------------|------|');
                for (const r of catResults) {
                    const shortName = r.modelId.replace(/^openrouter:/, '');
                    const sig = r.significant ? '**Yes**' : 'No';
                    ln(`| ${shortName} | ${r.observedSlope >= 0 ? '+' : ''}${r.observedSlope.toFixed(6)} | ${r.pValue.toFixed(4)} | ${r.adjustedPValue.toFixed(4)} | ${r.dataPoints} | ${sig} |`);
                }
                ln();
            }
        }
    }

    // ── Future Work ──
    ln('---');
    ln();
    ln('## Future Work & Limitations');
    ln();
    ln('### Population Baseline Blueprint Variant');
    ln();
    ln('Currently we cannot directly test whether knowing demographics helps or hurts accuracy, because all evaluation blueprints include demographic context in the prompt. A "no-demographic" blueprint variant would allow a direct comparison: the same model predicting the same segment\'s distribution, with and without knowing which demographic group it\'s predicting for. The population marginal baseline approximates this (it measures how well you can do with zero demographic knowledge), but it isn\'t the same as testing the model\'s own ability to predict without demographics — the model might perform differently than the marginal average.');
    ln();
    ln('### Demographic Combinations');
    ln();
    ln('The current analysis tests single demographic dimensions (age, gender, country, etc.) independently. Real people belong to intersecting groups — a "18-25 year old male in an urban area" may have very different opinions from what you\'d predict by averaging the age, gender, and environment effects separately. Future work should test combinations to understand whether models improve accuracy with intersectional demographic context, and whether certain combinations are particularly well or poorly predicted.');
    ln();
    ln('### Cross-Round Temporal Analysis');
    ln();
    ln('With data spanning GD1 through GD7, future analysis could examine temporal consistency. Do models perform differently on newer vs. older survey rounds? Are opinion shifts over time captured by the models, or do they reflect a static snapshot of the training data? This would help assess whether models are learning genuine cultural patterns or memorizing specific survey results.');
    ln();

    // ── Methodology ──
    ln('---');
    ln();
    ln('## Methodology Notes');
    ln();
    ln('- **JSD Similarity:** Uses `1 - sqrt(JSD)` (Jensen-Shannon Distance) as the similarity metric, matching the evaluation pipeline.');
    ln(`- **Shuffled baseline:** ${SHUFFLE_ITERATIONS} iterations shuffling segment-distribution assignments within each question.`);
    ln(`- **Permutation test:** ${PERMUTATION_ITERATIONS.toLocaleString()} iterations flipping sign of paired differences (Analysis 3) or shuffling context count labels (Analysis 4).`);
    ln('- **Holm-Bonferroni:** Sequential correction that controls family-wise error rate while being less conservative than Bonferroni. Applied separately within each analysis.');
    ln('- **Noise floor formula:** `1 - sqrt((k-1) / (2n × ln2))` — the expected JSD similarity between a true distribution and one drawn from it with n samples and k categories. Higher values indicate better data quality.');
    ln('- **Context responsiveness (overall):** For each model, computes regression slope of score vs. context count across all (segment, question) pairs. Permutation test shuffles context labels to establish the null distribution. Holm-Bonferroni applied across all models.');
    ln('- **Context responsiveness (by category):** Same test run independently for each model × category pair, with Holm-Bonferroni applied jointly across *all* model×category combinations. This controls for the multiple comparisons problem: with enough pairs, some would show positive slopes by chance alone.');
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
    console.log(`  ${aboveThreshold}/${noiseFloor.entries.length} pairs have sufficient data quality (noise floor > ${NOISE_THRESHOLD})`);

    // Analysis 3: Pairwise Significance
    console.log('\n── Analysis 3: Pairwise Model Significance ──');
    if (modelScores.length > 0) {
        console.log(`  Running permutation tests (${PERMUTATION_ITERATIONS.toLocaleString()} iterations)...`);
    }
    const pairwiseResults = computePairwiseSignificance(modelScores);
    const sigCount = pairwiseResults.pairwise.filter(p => p.significant).length;
    console.log(`  ${sigCount}/${pairwiseResults.pairwise.length} pairs significantly different`);

    // Analysis 4: Context Responsiveness
    console.log('\n── Analysis 4: Context Responsiveness ──');
    const contextResults = computeContextResponsiveness(modelScores);
    if (contextResults.perModel.length === 0) {
        console.log('  Insufficient context count variation (all evals used same context count)');
    } else {
        const sigCtx = contextResults.perModel.filter(r => r.significant).length;
        console.log(`  ${sigCtx}/${contextResults.perModel.length} models show significant context responsiveness (overall)`);
        const sigCat = contextResults.categoryResults.filter(r => r.significant).length;
        console.log(`  ${sigCat}/${contextResults.categoryResults.length} model×category pairs significant (joint Holm-Bonferroni)`);
    }

    // Generate report
    console.log('\n── Generating report ──');
    const report = generateReport(
        baselines,
        modelOverallScores,
        noiseFloor,
        pairwiseResults,
        contextResults,
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
