/**
 * Baseline Generator Service
 *
 * Generates synthetic WevalResult files for baseline predictors that
 * can be stored alongside real model results and appear on the leaderboard.
 *
 * Currently supports:
 * - Population Marginal: predicts the overall population distribution
 *   (ignoring demographics) for every segment
 *
 * Generated results flow through the normal aggregation pipeline without
 * any special handling — they're just WevalResults with a special model ID.
 *
 * @module cli/services/baselineGeneratorService
 */

import { DTEFSurveyData, SegmentWithResponses } from '@/types/dtef';
import { WevalResult, WevalConfig, WevalPromptConfig, LLMCoverageScores } from '@/types/shared';
import { jsDivergenceSimilarity, normalize } from '@/point-functions/distribution_metric';

/** Baseline model IDs — used as modelId in generated results */
export const BASELINE_MODEL_IDS = {
    POPULATION_MARGINAL: 'baseline:population-marginal',
    UNIFORM: 'baseline:uniform',
} as const;

export type BaselineType = 'population-marginal' | 'uniform';

/**
 * Compute the population-marginal distribution for each question:
 * weighted average of all segment distributions, weighted by sample size.
 */
function computePopulationMarginals(
    surveyData: DTEFSurveyData,
): Map<string, number[]> {
    const marginals = new Map<string, { weightedSum: number[]; totalWeight: number }>();

    for (const segment of surveyData.segments) {
        for (const resp of segment.responses) {
            let entry = marginals.get(resp.questionId);
            if (!entry) {
                entry = { weightedSum: new Array(resp.distribution.length).fill(0), totalWeight: 0 };
                marginals.set(resp.questionId, entry);
            }
            for (let i = 0; i < resp.distribution.length; i++) {
                entry.weightedSum[i] += resp.distribution[i] * segment.sampleSize;
            }
            entry.totalWeight += segment.sampleSize;
        }
    }

    const result = new Map<string, number[]>();
    for (const [key, entry] of marginals) {
        result.set(key, entry.weightedSum.map(v => v / entry.totalWeight));
    }
    return result;
}

/**
 * Generate a synthetic WevalResult for a baseline predictor on a single segment.
 *
 * The result has the same structure as a real evaluation run:
 * - config with DTEF metadata (surveyId, segmentId, etc.)
 * - evaluationResults with llmCoverageScores containing JSD similarity
 * - allFinalAssistantResponses with the baseline's "prediction" as text
 */
function generateBaselineResult(
    surveyData: DTEFSurveyData,
    segment: SegmentWithResponses,
    baselineType: BaselineType,
    marginals: Map<string, number[]>,
    contextCount: number = 0,
): WevalResult {
    const modelId = baselineType === 'population-marginal'
        ? BASELINE_MODEL_IDS.POPULATION_MARGINAL
        : BASELINE_MODEL_IDS.UNIFORM;

    const ctxSuffix = contextCount > 0 ? `-c${contextCount}` : '';
    const configId = `dtef-${surveyData.surveyId}-${segment.id}${ctxSuffix}`;
    const timestamp = new Date().toISOString();

    // Build prompts, scores, and responses for each question
    const prompts: WevalPromptConfig[] = [];
    const llmCoverageScores: LLMCoverageScores = {};
    const allResponses: Record<string, Record<string, string>> = {};

    for (const resp of segment.responses) {
        const question = surveyData.questions[resp.questionId];
        if (!question) continue;

        const promptId = `${resp.questionId}-${segment.id}`;

        // Compute baseline prediction
        let prediction: number[];
        if (baselineType === 'population-marginal') {
            const marginal = marginals.get(resp.questionId);
            if (!marginal) continue;
            prediction = marginal;
        } else {
            // Uniform baseline
            const k = resp.distribution.length;
            prediction = new Array(k).fill(100 / k);
        }

        // Compute JSD similarity score
        const score = jsDivergenceSimilarity(prediction, resp.distribution);

        // Create prompt config
        prompts.push({
            id: promptId,
            description: `Baseline: ${segment.label} → "${question.text}"`,
            promptText: `[baseline predictor — ${baselineType}]`,
            points: [{
                text: `Distribution Similarity: "${question.text.slice(0, 60)}..."`,
                fn: 'distribution_metric',
                fnArgs: {
                    expected: resp.distribution,
                    metric: 'js-divergence',
                },
            }],
        });

        // Create synthetic coverage score
        llmCoverageScores[promptId] = {
            [modelId]: {
                keyPointsCount: 1,
                avgCoverageExtent: score,
                pointAssessments: [{
                    keyPointText: 'Distribution Similarity',
                    coverageExtent: score,
                    justification: `Baseline ${baselineType} prediction: [${prediction.map(n => n.toFixed(1)).join(', ')}]`,
                    evaluationType: 'computational',
                }],
            },
        };

        // Create synthetic response text
        allResponses[promptId] = {
            [modelId]: `[${prediction.map(n => n.toFixed(1)).join(', ')}]`,
        };
    }

    // Build ground truth distributions map
    const groundTruthDistributions: Record<string, number[]> = {};
    for (const resp of segment.responses) {
        groundTruthDistributions[resp.questionId] = resp.distribution;
    }

    const config: WevalConfig = {
        configId,
        configTitle: `${surveyData.surveyName} - ${segment.label} (${baselineType} baseline)`,
        description: `Baseline: ${baselineType} predictor for ${segment.label}`,
        models: [modelId],
        system: null,
        temperature: 0,
        prompts,
        tags: ['dtef', 'baseline', baselineType, surveyData.surveyId],
        context: {
            dtef: {
                surveyId: surveyData.surveyId,
                segmentId: segment.id,
                segmentLabel: segment.label,
                segmentAttributes: segment.attributes,
                groundTruthDistributions,
                contextQuestionCount: contextCount,
            },
        },
    };

    return {
        configId,
        configTitle: config.configTitle!,
        runLabel: `baseline-${baselineType}`,
        timestamp,
        config,
        evalMethodsUsed: ['llm-coverage'],
        effectiveModels: [modelId],
        promptIds: prompts.map(p => p.id),
        allFinalAssistantResponses: allResponses,
        evaluationResults: {
            llmCoverageScores,
        },
        dtefMetadata: {
            surveyId: surveyData.surveyId,
            segmentIds: [segment.id],
            segmentLabels: [segment.label],
            segmentAttributes: segment.attributes,
        },
    };
}

/**
 * Generate baseline results for all segments in a survey.
 */
export function generateBaselineResults(
    surveyData: DTEFSurveyData,
    baselineType: BaselineType = 'population-marginal',
): WevalResult[] {
    const marginals = computePopulationMarginals(surveyData);
    const results: WevalResult[] = [];

    for (const segment of surveyData.segments) {
        const result = generateBaselineResult(
            surveyData,
            segment,
            baselineType,
            marginals,
        );
        results.push(result);
    }

    return results;
}

/**
 * Get the mean score for a baseline across all segments.
 */
export function getBaselineMeanScore(results: WevalResult[]): number {
    let totalScore = 0;
    let count = 0;

    for (const result of results) {
        const scores = result.evaluationResults?.llmCoverageScores;
        if (!scores) continue;
        for (const promptId of Object.keys(scores)) {
            const promptScores = scores[promptId];
            if (!promptScores) continue;
            for (const modelId of Object.keys(promptScores)) {
                const coverage = promptScores[modelId];
                if (coverage && typeof coverage.avgCoverageExtent === 'number') {
                    totalScore += coverage.avgCoverageExtent;
                    count++;
                }
            }
        }
    }

    return count > 0 ? totalScore / count : 0;
}
