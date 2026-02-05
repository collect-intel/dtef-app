/**
 * Demographic Aggregation Service
 *
 * Aggregates DTEF evaluation results across demographic segments and models.
 * Takes individual per-segment evaluation results and produces:
 *   - Per-model scores across all segments
 *   - Per-segment model rankings
 *   - Fairness/disparity analysis across segments
 *
 * @module cli/services/demographicAggregationService
 */

import { WevalResult, DTEFResultMetadata } from '@/types/shared';
import { DTEFLeaderboardEntry, DemographicSegment } from '@/types/dtef';

/**
 * Per-segment score for a model.
 */
export interface SegmentModelScore {
    segmentId: string;
    segmentLabel: string;
    segmentAttributes: Record<string, string>;
    modelId: string;
    /** Average coverage extent from LLM evaluator (0-1) */
    avgCoverageExtent: number;
    /** Number of prompts evaluated */
    promptCount: number;
}

/**
 * Aggregated model performance across all segments.
 */
export interface AggregatedModelResult {
    modelId: string;
    /** Average score across all segments */
    overallScore: number;
    /** Number of segments evaluated */
    segmentCount: number;
    /** Number of total prompts evaluated */
    totalPrompts: number;
    /** Per-segment breakdown */
    segmentScores: SegmentModelScore[];
    /** Score standard deviation across segments (measures consistency) */
    segmentStdDev: number;
    /** Best performing segment */
    bestSegment?: { id: string; label: string; score: number };
    /** Worst performing segment */
    worstSegment?: { id: string; label: string; score: number };
}

/**
 * Fairness disparity between segments for a model.
 */
export interface DisparityEntry {
    modelId: string;
    /** Ratio of best to worst segment score */
    disparityRatio: number;
    /** Absolute gap between best and worst segment */
    absoluteGap: number;
    bestSegment: { id: string; label: string; score: number };
    worstSegment: { id: string; label: string; score: number };
}

/**
 * Full aggregation output.
 */
export interface DemographicAggregation {
    surveyId: string;
    /** When aggregation was performed */
    aggregatedAt: string;
    /** Number of evaluation results included */
    resultCount: number;
    /** Per-model aggregated results */
    modelResults: AggregatedModelResult[];
    /** Fairness disparity analysis */
    disparities: DisparityEntry[];
    /** Leaderboard entries sorted by overall score */
    leaderboard: DTEFLeaderboardEntry[];
}

/**
 * Aggregates DTEF evaluation results by demographic segment.
 */
export class DemographicAggregationService {
    /**
     * Check if a WevalResult contains DTEF metadata.
     */
    static isDTEFResult(result: WevalResult): boolean {
        return result.config?.tags?.includes('dtef') ||
            !!(result.config?.context as any)?.dtef ||
            !!result.dtefMetadata;
    }

    /**
     * Extract DTEF metadata from a WevalResult.
     * Metadata can be in the config context (from blueprint) or in dtefMetadata (post-processing).
     */
    static extractDTEFContext(result: WevalResult): {
        surveyId: string;
        segmentId: string;
        segmentLabel: string;
        segmentAttributes: Record<string, string>;
    } | null {
        const ctx = (result.config?.context as any)?.dtef;
        if (ctx) {
            return {
                surveyId: ctx.surveyId,
                segmentId: ctx.segmentId,
                segmentLabel: ctx.segmentLabel || ctx.segmentId,
                segmentAttributes: ctx.segmentAttributes || {},
            };
        }

        if (result.dtefMetadata) {
            return {
                surveyId: result.dtefMetadata.surveyId,
                segmentId: result.dtefMetadata.segmentIds[0] || 'unknown',
                segmentLabel: result.dtefMetadata.segmentLabels?.[0] || result.dtefMetadata.segmentIds[0] || 'unknown',
                segmentAttributes: result.dtefMetadata.segmentAttributes || {},
            };
        }

        return null;
    }

    /**
     * Extract per-model coverage scores from a WevalResult.
     * Returns a map of modelId → average coverage score for this result.
     */
    static extractModelScores(result: WevalResult): Record<string, { avgScore: number; promptCount: number }> {
        const scores: Record<string, { totalScore: number; count: number }> = {};

        const coverageScores = result.evaluationResults?.llmCoverageScores;
        if (!coverageScores) return {};

        // llmCoverageScores is [promptId][modelId] → CoverageResult
        for (const promptId of Object.keys(coverageScores)) {
            const promptScores = coverageScores[promptId];
            if (!promptScores) continue;

            for (const modelId of Object.keys(promptScores)) {
                const coverage = promptScores[modelId];
                if (!coverage || typeof coverage.avgCoverageExtent !== 'number') continue;

                if (!scores[modelId]) {
                    scores[modelId] = { totalScore: 0, count: 0 };
                }
                scores[modelId].totalScore += coverage.avgCoverageExtent;
                scores[modelId].count += 1;
            }
        }

        const result2: Record<string, { avgScore: number; promptCount: number }> = {};
        for (const [modelId, data] of Object.entries(scores)) {
            result2[modelId] = {
                avgScore: data.count > 0 ? data.totalScore / data.count : 0,
                promptCount: data.count,
            };
        }
        return result2;
    }

    /**
     * Aggregate DTEF results across all segments for a survey.
     */
    static aggregate(results: WevalResult[]): DemographicAggregation {
        const dtefResults = results.filter(r => this.isDTEFResult(r));

        if (dtefResults.length === 0) {
            return {
                surveyId: 'unknown',
                aggregatedAt: new Date().toISOString(),
                resultCount: 0,
                modelResults: [],
                disparities: [],
                leaderboard: [],
            };
        }

        // Extract survey ID from first result
        const firstCtx = this.extractDTEFContext(dtefResults[0]);
        const surveyId = firstCtx?.surveyId || 'unknown';

        // Collect all segment-model scores
        const allSegmentScores: SegmentModelScore[] = [];

        for (const result of dtefResults) {
            const ctx = this.extractDTEFContext(result);
            if (!ctx) continue;

            const modelScores = this.extractModelScores(result);

            for (const [modelId, data] of Object.entries(modelScores)) {
                allSegmentScores.push({
                    segmentId: ctx.segmentId,
                    segmentLabel: ctx.segmentLabel,
                    segmentAttributes: ctx.segmentAttributes,
                    modelId,
                    avgCoverageExtent: data.avgScore,
                    promptCount: data.promptCount,
                });
            }
        }

        // Group by model
        const modelGroups = new Map<string, SegmentModelScore[]>();
        for (const score of allSegmentScores) {
            if (!modelGroups.has(score.modelId)) {
                modelGroups.set(score.modelId, []);
            }
            modelGroups.get(score.modelId)!.push(score);
        }

        // Build aggregated model results
        const modelResults: AggregatedModelResult[] = [];

        for (const [modelId, segmentScores] of modelGroups) {
            const scores = segmentScores.map(s => s.avgCoverageExtent);
            const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const totalPrompts = segmentScores.reduce((a, s) => a + s.promptCount, 0);

            // Standard deviation
            const variance = scores.reduce((a, s) => a + Math.pow(s - overallScore, 2), 0) / scores.length;
            const stdDev = Math.sqrt(variance);

            // Best/worst segments
            const sorted = [...segmentScores].sort((a, b) => b.avgCoverageExtent - a.avgCoverageExtent);
            const best = sorted[0];
            const worst = sorted[sorted.length - 1];

            modelResults.push({
                modelId,
                overallScore,
                segmentCount: segmentScores.length,
                totalPrompts,
                segmentScores,
                segmentStdDev: stdDev,
                bestSegment: best ? { id: best.segmentId, label: best.segmentLabel, score: best.avgCoverageExtent } : undefined,
                worstSegment: worst ? { id: worst.segmentId, label: worst.segmentLabel, score: worst.avgCoverageExtent } : undefined,
            });
        }

        // Sort by overall score descending
        modelResults.sort((a, b) => b.overallScore - a.overallScore);

        // Compute disparities
        const disparities: DisparityEntry[] = modelResults
            .filter(m => m.bestSegment && m.worstSegment && m.segmentCount > 1)
            .map(m => ({
                modelId: m.modelId,
                disparityRatio: m.worstSegment!.score > 0
                    ? m.bestSegment!.score / m.worstSegment!.score
                    : Infinity,
                absoluteGap: m.bestSegment!.score - m.worstSegment!.score,
                bestSegment: m.bestSegment!,
                worstSegment: m.worstSegment!,
            }))
            .sort((a, b) => b.absoluteGap - a.absoluteGap);

        // Build leaderboard
        const leaderboard: DTEFLeaderboardEntry[] = modelResults.map(m => ({
            modelId: m.modelId,
            modelName: m.modelId.replace(/^openrouter:/, ''),
            overallScore: m.overallScore,
            segmentsEvaluated: m.segmentCount,
            questionsEvaluated: m.totalPrompts,
            lastEvaluatedAt: new Date().toISOString(),
        }));

        return {
            surveyId,
            aggregatedAt: new Date().toISOString(),
            resultCount: dtefResults.length,
            modelResults,
            disparities,
            leaderboard,
        };
    }
}
