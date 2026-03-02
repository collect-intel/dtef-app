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

import { WevalResult } from '@/types/shared';
import { DTEFLeaderboardEntry } from '@/types/dtef';
import { getSegmentPrefix, getCategoryLabel, SEGMENT_TYPE_LABELS } from '@/lib/segmentUtils';

/**
 * Individual evaluation run score for a (model, segment) pair.
 */
export interface RunScore {
    score: number;
    promptCount: number;
    contextCount: number;
    configId?: string;
    runLabel?: string;
    timestamp?: string;
}

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
    /** Individual evaluation runs for this (model, segment) pair */
    runs?: RunScore[];
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
    /** Overall DPD (max gap between best and worst segment across all dimensions) */
    overallDPD?: number;
}

/**
 * Per-category fairness disparity for a model.
 * Compares segments WITHIN a single category (e.g. "Male" vs "Female").
 */
export interface StrataDisparityEntry {
    modelId: string;
    /** Category key, e.g. 'ageGroup', 'gender', 'country' */
    category: string;
    /** Human-readable category label, e.g. 'Age', 'Gender', 'Country' */
    categoryLabel: string;
    /** Number of segments in this category for this model */
    segmentCount: number;
    /** Absolute gap between best and worst segment within the category */
    absoluteGap: number;
    bestSegment: { id: string; label: string; score: number };
    worstSegment: { id: string; label: string; score: number };
}

/**
 * @deprecated Use StrataDisparityEntry instead. Kept for backward compatibility.
 */
export type DisparityEntry = StrataDisparityEntry;

/**
 * A single (contextCount, score) data point for context responsiveness analysis.
 */
export interface ContextDataPoint {
    contextCount: number;
    score: number;
    /** Config ID for linking to evaluation run detail page */
    configId?: string;
    /** Run label for linking to evaluation run detail page */
    runLabel?: string;
    /** Timestamp for linking to evaluation run detail page */
    timestamp?: string;
}

/**
 * Context responsiveness for a single segment.
 */
export interface SegmentResponsiveness {
    segmentId: string;
    dataPoints: ContextDataPoint[];
    slope: number;
}

/**
 * Context responsiveness for a single model across segments.
 */
export interface ModelResponsiveness {
    modelId: string;
    overallSlope: number;
    segmentResponsiveness: SegmentResponsiveness[];
}

/**
 * Context analysis across all models.
 */
export interface ContextAnalysis {
    models: ModelResponsiveness[];
    contextLevelsFound: number[];
}

/**
 * Per-dimension DPD (Demographic Parity Difference) for a model.
 * Aggregates within-category gaps into overall fairness metrics.
 */
export interface ModelDPD {
    modelId: string;
    /** Overall DPD: max gap across all dimensions */
    overallDPD: number;
    /** Per-dimension DPD */
    dimensionDPD: { dimension: string; dimensionLabel: string; dpd: number }[];
}

/**
 * Per-question DPD analysis — identifies questions with highest bias.
 */
export interface QuestionDPD {
    questionId: string;
    modelId: string;
    dpd: number;
    bestSegment: { id: string; score: number };
    worstSegment: { id: string; score: number };
}

/**
 * Stereotype score: compares zero-context vs full-context performance.
 * High zero-context accuracy + low improvement = possible stereotype application.
 */
export interface StereotypeScore {
    modelId: string;
    zeroContextScore: number;
    fullContextScore: number;
    /** (full - zero) / full. Low or negative = likely stereotyping. */
    improvementRatio: number;
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
    /** Context responsiveness analysis (present when multiple context levels exist) */
    contextAnalysis?: ContextAnalysis;
    /** Per-model DPD analysis */
    modelDPDs?: ModelDPD[];
    /** Stereotype scores (present when multi-context results exist) */
    stereotypeScores?: StereotypeScore[];
    /** Per-question DPD analysis (questions with highest demographic bias) */
    questionDPDs?: QuestionDPD[];
}

/**
 * Normalize segment IDs and labels that vary across data sources.
 * E.g. GD1-2 use "Turkey" while GD3+ use "Türkiye" — standardize to US English.
 */
const SEGMENT_LABEL_ALIASES: Record<string, string> = {
    'Türkiye': 'Turkey',
};

const SEGMENT_ID_ALIASES: Record<string, string> = {
    'country:t-rkiye': 'country:turkey',
};

function normalizeSegmentId(id: string): string {
    return SEGMENT_ID_ALIASES[id] ?? id;
}

function normalizeSegmentLabel(label: string): string {
    return SEGMENT_LABEL_ALIASES[label] ?? label;
}

function normalizeSegmentAttributes(attrs: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
        result[k] = SEGMENT_LABEL_ALIASES[v] ?? v;
    }
    return result;
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
     * Check if a WevalResult is tagged as part of an experiment.
     * Experimental results should be excluded from production leaderboard/demographics.
     */
    static isExperimentalResult(result: WevalResult): boolean {
        const ctx = (result.config?.context as any)?.dtef;
        if (ctx?.experimentId) return true;
        if (result.dtefMetadata?.experimentId) return true;
        if (result.config?.tags?.some((t: string) => t.startsWith('experiment:'))) return true;
        return false;
    }

    /**
     * Extract DTEF metadata from a WevalResult.
     * Metadata can be in the config context (from blueprint) or in dtefMetadata (post-processing).
     * Normalizes segment IDs/labels to handle cross-round inconsistencies.
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
                segmentId: normalizeSegmentId(ctx.segmentId),
                segmentLabel: normalizeSegmentLabel(ctx.segmentLabel || ctx.segmentId),
                segmentAttributes: normalizeSegmentAttributes(ctx.segmentAttributes || {}),
            };
        }

        if (result.dtefMetadata) {
            const rawId = result.dtefMetadata.segmentIds[0] || 'unknown';
            const rawLabel = result.dtefMetadata.segmentLabels?.[0] || rawId;
            return {
                surveyId: result.dtefMetadata.surveyId,
                segmentId: normalizeSegmentId(rawId),
                segmentLabel: normalizeSegmentLabel(rawLabel),
                segmentAttributes: normalizeSegmentAttributes(result.dtefMetadata.segmentAttributes || {}),
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
     * Extract the context question count from a result.
     * Reads context.dtef.contextQuestionCount, falling back to legacy detection:
     *   - configId matches '-c{N}' → N
     *   - configId contains '-ctx' → estimate from metadata or prompt count
     *   - otherwise → 0
     *
     * Returns null when context count cannot be determined (excluded from analysis).
     */
    static extractContextCount(result: WevalResult): number | null {
        const ctx = (result.config?.context as any)?.dtef;
        if (typeof ctx?.contextQuestionCount === 'number' && ctx.contextQuestionCount >= 0) {
            return ctx.contextQuestionCount;
        }

        const configId = result.config?.configId || '';
        // Match -c{N} suffix (new format)
        const cMatch = configId.match(/-c(\d+)$/);
        if (cMatch) return parseInt(cMatch[1], 10);

        // Legacy: -ctx suffix means "full context"
        if (configId.includes('-ctx')) {
            // Try contextQuestionIds from metadata
            const ids = ctx?.contextQuestionIds;
            if (Array.isArray(ids) && ids.length > 0) return ids.length;

            // Count context questions embedded in prompt text as Q: "..." patterns
            // (buildContextSection renders each as `Q: "question text"\n  Response distribution: ...`)
            const prompts = result.config?.prompts;
            if (Array.isArray(prompts) && prompts.length > 0) {
                const text = prompts[0].promptText || '';
                const matches = text.match(/Q:\s*"/g);
                if (matches && matches.length > 0) return matches.length;
            }

            // Cannot determine — return null to exclude from context analysis
            return null;
        }

        return 0;
    }

    /**
     * Simple least-squares linear regression slope for (x, y) points.
     * Returns the slope of the best-fit line. Works with 2+ points.
     */
    static linearRegressionSlope(points: ContextDataPoint[]): number {
        if (points.length < 2) return 0;

        const n = points.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (const p of points) {
            sumX += p.contextCount;
            sumY += p.score;
            sumXY += p.contextCount * p.score;
            sumXX += p.contextCount * p.contextCount;
        }

        const denominator = n * sumXX - sumX * sumX;
        if (denominator === 0) return 0;

        const slope = (n * sumXY - sumX * sumY) / denominator;
        return isFinite(slope) ? slope : 0;
    }

    /**
     * Compute context responsiveness analysis from results with varying context levels.
     * Groups results by model → segment → context level, then computes regression slopes.
     */
    static computeContextAnalysis(results: WevalResult[]): ContextAnalysis | undefined {
        // Collect all (model, segment, contextCount, score, run metadata) tuples
        const tuples: {
            modelId: string; segmentId: string; contextCount: number; score: number;
            configId?: string; runLabel?: string; timestamp?: string;
        }[] = [];
        const contextLevels = new Set<number>();

        for (const result of results) {
            const ctx = this.extractDTEFContext(result);
            if (!ctx) continue;

            const contextCount = this.extractContextCount(result);
            // Skip results where context count cannot be determined
            if (contextCount === null) continue;

            contextLevels.add(contextCount);
            const modelScores = this.extractModelScores(result);

            for (const [modelId, data] of Object.entries(modelScores)) {
                tuples.push({
                    modelId,
                    segmentId: ctx.segmentId,
                    contextCount,
                    score: data.avgScore,
                    configId: result.configId,
                    runLabel: result.runLabel,
                    timestamp: result.timestamp,
                });
            }
        }

        // Need at least 2 different context levels to compute responsiveness
        if (contextLevels.size < 2) return undefined;

        // Group by model → segment
        const modelMap = new Map<string, Map<string, ContextDataPoint[]>>();
        for (const t of tuples) {
            if (!modelMap.has(t.modelId)) modelMap.set(t.modelId, new Map());
            const segMap = modelMap.get(t.modelId)!;
            if (!segMap.has(t.segmentId)) segMap.set(t.segmentId, []);
            segMap.get(t.segmentId)!.push({
                contextCount: t.contextCount, score: t.score,
                configId: t.configId, runLabel: t.runLabel, timestamp: t.timestamp,
            });
        }

        const models: ModelResponsiveness[] = [];
        for (const [modelId, segMap] of modelMap) {
            const segmentResponsiveness: SegmentResponsiveness[] = [];
            const allSlopes: number[] = [];

            for (const [segmentId, dataPoints] of segMap) {
                if (dataPoints.length < 2) continue;
                const slope = this.linearRegressionSlope(dataPoints);
                segmentResponsiveness.push({ segmentId, dataPoints, slope });
                allSlopes.push(slope);
            }

            const overallSlope = allSlopes.length > 0
                ? allSlopes.reduce((a, b) => a + b, 0) / allSlopes.length
                : 0;

            models.push({ modelId, overallSlope, segmentResponsiveness });
        }

        // Sort by slope descending (most context-responsive first)
        models.sort((a, b) => b.overallSlope - a.overallSlope);

        return {
            models,
            contextLevelsFound: Array.from(contextLevels).sort((a, b) => a - b),
        };
    }

    /**
     * Aggregate DTEF results across all segments for a survey.
     * By default, experimental results are excluded from aggregation.
     */
    static aggregate(
        results: WevalResult[],
        options?: { includeExperimental?: boolean },
    ): DemographicAggregation {
        let dtefResults = results.filter(r => this.isDTEFResult(r));

        if (!options?.includeExperimental) {
            dtefResults = dtefResults.filter(r => !this.isExperimentalResult(r));
        }

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

        // Collect all segment-model scores, deduplicating multi-level context results.
        // When the same (model, segment) pair has results at multiple context levels,
        // use only the highest-context result for the main leaderboard/disparity analysis.
        // This prevents multi-level evaluations from inflating segment counts.
        // Also collect ALL runs per (model, segment) for per-run drill-downs.
        const scoreMap = new Map<string, { score: SegmentModelScore; contextCount: number }>();
        const allRunsMap = new Map<string, RunScore[]>();

        for (const result of dtefResults) {
            const ctx = this.extractDTEFContext(result);
            if (!ctx) continue;

            const contextCount = this.extractContextCount(result) ?? 0;
            const modelScores = this.extractModelScores(result);

            for (const [modelId, data] of Object.entries(modelScores)) {
                const key = `${modelId}::${ctx.segmentId}`;

                // Collect ALL runs for drill-down
                if (!allRunsMap.has(key)) allRunsMap.set(key, []);
                allRunsMap.get(key)!.push({
                    score: data.avgScore,
                    promptCount: data.promptCount,
                    contextCount,
                    configId: result.configId,
                    runLabel: result.runLabel,
                    timestamp: result.timestamp,
                });

                const existing = scoreMap.get(key);

                const score: SegmentModelScore = {
                    segmentId: ctx.segmentId,
                    segmentLabel: ctx.segmentLabel,
                    segmentAttributes: ctx.segmentAttributes,
                    modelId,
                    avgCoverageExtent: data.avgScore,
                    promptCount: data.promptCount,
                };

                // Keep the highest-context result for each (model, segment) pair
                if (!existing || contextCount > existing.contextCount) {
                    scoreMap.set(key, { score, contextCount });
                }
            }
        }

        // Attach per-run data to each segment score
        const allSegmentScores: SegmentModelScore[] = Array.from(scoreMap.entries()).map(([key, e]) => ({
            ...e.score,
            runs: (allRunsMap.get(key) || []).sort((a, b) => b.score - a.score),
        }));

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

            // Overall DPD = max_segment - min_segment score
            const overallDPD = (best && worst) ? best.avgCoverageExtent - worst.avgCoverageExtent : 0;

            modelResults.push({
                modelId,
                overallScore,
                segmentCount: segmentScores.length,
                totalPrompts,
                segmentScores,
                segmentStdDev: stdDev,
                bestSegment: best ? { id: best.segmentId, label: best.segmentLabel, score: best.avgCoverageExtent } : undefined,
                worstSegment: worst ? { id: worst.segmentId, label: worst.segmentLabel, score: worst.avgCoverageExtent } : undefined,
                overallDPD,
            });
        }

        // Sort by overall score descending
        modelResults.sort((a, b) => b.overallScore - a.overallScore);

        // Compute per-category disparities (within-category, not cross-category)
        const disparities: StrataDisparityEntry[] = [];
        for (const model of modelResults) {
            // Group this model's segment scores by category prefix
            const byCategory = new Map<string, { id: string; label: string; score: number }[]>();
            for (const seg of model.segmentScores) {
                const prefix = getSegmentPrefix(seg.segmentId);
                if (!SEGMENT_TYPE_LABELS[prefix]) continue;
                if (!byCategory.has(prefix)) byCategory.set(prefix, []);
                byCategory.get(prefix)!.push({
                    id: seg.segmentId,
                    label: seg.segmentLabel,
                    score: seg.avgCoverageExtent,
                });
            }
            // For each category with 2+ segments, compute the within-category gap
            for (const [prefix, segments] of byCategory) {
                if (segments.length < 2) continue;
                segments.sort((a, b) => b.score - a.score);
                const best = segments[0];
                const worst = segments[segments.length - 1];
                disparities.push({
                    modelId: model.modelId,
                    category: prefix,
                    categoryLabel: getCategoryLabel(prefix),
                    segmentCount: segments.length,
                    absoluteGap: best.score - worst.score,
                    bestSegment: best,
                    worstSegment: worst,
                });
            }
        }
        disparities.sort((a, b) => b.absoluteGap - a.absoluteGap);

        // Build leaderboard
        const leaderboard: DTEFLeaderboardEntry[] = modelResults.map(m => ({
            modelId: m.modelId,
            modelName: m.modelId.replace(/^openrouter:/, ''),
            overallScore: m.overallScore,
            segmentsEvaluated: m.segmentCount,
            questionsEvaluated: m.totalPrompts,
            lastEvaluatedAt: new Date().toISOString(),
        }));

        // Compute context responsiveness analysis
        const contextAnalysis = this.computeContextAnalysis(dtefResults);

        // Compute per-model DPD (aggregate per-dimension disparities)
        const modelDPDs: ModelDPD[] = [];
        const disparitiesByModel = new Map<string, StrataDisparityEntry[]>();
        for (const d of disparities) {
            if (!disparitiesByModel.has(d.modelId)) disparitiesByModel.set(d.modelId, []);
            disparitiesByModel.get(d.modelId)!.push(d);
        }
        for (const [modelId, modelDisparities] of disparitiesByModel) {
            const dimensionDPD = modelDisparities.map(d => ({
                dimension: d.category,
                dimensionLabel: d.categoryLabel,
                dpd: d.absoluteGap,
            }));
            const overallDPD = dimensionDPD.length > 0
                ? Math.max(...dimensionDPD.map(d => d.dpd))
                : 0;
            modelDPDs.push({ modelId, overallDPD, dimensionDPD });
        }
        modelDPDs.sort((a, b) => a.overallDPD - b.overallDPD);

        // Compute stereotype scores from context analysis
        const stereotypeScores = this.computeStereotypeScores(contextAnalysis);

        // Compute per-question DPD
        const questionDPDs = this.computeQuestionDPD(dtefResults);

        return {
            surveyId,
            aggregatedAt: new Date().toISOString(),
            resultCount: dtefResults.length,
            modelResults,
            disparities,
            leaderboard,
            contextAnalysis,
            modelDPDs,
            stereotypeScores,
            questionDPDs: questionDPDs.length > 0 ? questionDPDs : undefined,
        };
    }

    /**
     * Compute per-question DPD: for each question × model, find the max and min
     * segment scores. dpd = max - min. Identifies questions with highest bias.
     */
    static computeQuestionDPD(results: WevalResult[]): QuestionDPD[] {
        // Collect (modelId, segmentId, questionId) → score
        type QKey = string; // `${modelId}::${questionId}`
        const questionScores = new Map<QKey, Array<{ segmentId: string; score: number }>>();

        for (const result of results) {
            if (!this.isDTEFResult(result) || this.isExperimentalResult(result)) continue;

            const ctx = this.extractDTEFContext(result);
            if (!ctx) continue;

            const coverageScores = result.evaluationResults?.llmCoverageScores;
            if (!coverageScores) continue;

            // Each promptId encodes the questionId as `{questionId}-{segmentId}`.
            // Batched prompts use `batch-{N}-{segmentId}` — skip these since they
            // don't map to individual questions.
            for (const [promptId, promptScores] of Object.entries(coverageScores)) {
                if (!promptScores) continue;

                // Skip batched prompt IDs (they don't map to individual questions)
                if (promptId.startsWith('batch-')) continue;

                // Extract question ID from the suffix `-{segmentId}`
                const suffix = `-${ctx.segmentId}`;
                const suffixIdx = promptId.lastIndexOf(suffix);
                if (suffixIdx <= 0) continue; // can't determine question ID
                const questionId = promptId.slice(0, suffixIdx);

                for (const [modelId, coverage] of Object.entries(promptScores)) {
                    if (!coverage || typeof coverage.avgCoverageExtent !== 'number') continue;

                    const key = `${modelId}::${questionId}`;
                    if (!questionScores.has(key)) questionScores.set(key, []);
                    questionScores.get(key)!.push({
                        segmentId: ctx.segmentId,
                        score: coverage.avgCoverageExtent,
                    });
                }
            }
        }

        // Compute DPD for each model×question
        const dpds: QuestionDPD[] = [];

        for (const [key, segments] of questionScores) {
            if (segments.length < 2) continue;

            const sepIdx = key.indexOf('::');
            const modelId = key.slice(0, sepIdx);
            const questionId = key.slice(sepIdx + 2);
            const sorted = [...segments].sort((a, b) => b.score - a.score);
            const best = sorted[0];
            const worst = sorted[sorted.length - 1];
            const dpd = best.score - worst.score;

            dpds.push({
                questionId,
                modelId,
                dpd,
                bestSegment: { id: best.segmentId, score: best.score },
                worstSegment: { id: worst.segmentId, score: worst.score },
            });
        }

        // Sort by DPD descending (most biased questions first)
        dpds.sort((a, b) => b.dpd - a.dpd);

        return dpds;
    }

    /**
     * Compute stereotype scores from context analysis.
     * Compares zero-context vs highest-context performance.
     * A model with high zero-context accuracy that doesn't improve with context
     * may be applying stereotypes rather than using evidence.
     */
    static computeStereotypeScores(
        contextAnalysis?: ContextAnalysis,
    ): StereotypeScore[] | undefined {
        if (!contextAnalysis || contextAnalysis.contextLevelsFound.length < 2) return undefined;

        const minLevel = Math.min(...contextAnalysis.contextLevelsFound);
        const maxLevel = Math.max(...contextAnalysis.contextLevelsFound);
        if (minLevel === maxLevel) return undefined;

        const scores: StereotypeScore[] = [];

        for (const model of contextAnalysis.models) {
            let zeroContextScores: number[] = [];
            let fullContextScores: number[] = [];

            for (const seg of model.segmentResponsiveness) {
                for (const dp of seg.dataPoints) {
                    if (dp.contextCount === minLevel) zeroContextScores.push(dp.score);
                    if (dp.contextCount === maxLevel) fullContextScores.push(dp.score);
                }
            }

            if (zeroContextScores.length === 0 || fullContextScores.length === 0) continue;

            const zeroAvg = zeroContextScores.reduce((a, b) => a + b, 0) / zeroContextScores.length;
            const fullAvg = fullContextScores.reduce((a, b) => a + b, 0) / fullContextScores.length;

            const improvementRatio = fullAvg > 0
                ? (fullAvg - zeroAvg) / fullAvg
                : 0;

            scores.push({
                modelId: model.modelId,
                zeroContextScore: zeroAvg,
                fullContextScore: fullAvg,
                improvementRatio,
            });
        }

        // Sort by improvement ratio ascending (most stereotyping first)
        scores.sort((a, b) => a.improvementRatio - b.improvementRatio);

        return scores.length > 0 ? scores : undefined;
    }
}
