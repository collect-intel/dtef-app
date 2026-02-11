/**
 * DTEF Summary Calculation Utilities
 *
 * Produces demographic-specific summary data from DTEF evaluation results.
 * Works alongside the existing summaryCalculationUtils to add demographic
 * leaderboards and segment-level analysis.
 *
 * @module cli/utils/dtefSummaryUtils
 */

import { WevalResult } from '@/types/shared';
import {
    DemographicAggregationService,
    DemographicAggregation,
    AggregatedModelResult,
} from '@/cli/services/demographicAggregationService';

/**
 * DTEF summary data structure stored in S3.
 */
export interface DTEFSummary {
    /** When this summary was generated */
    generatedAt: string;
    /** Survey ID */
    surveyId: string;
    /** Number of results included */
    resultCount: number;
    /** Top models by overall demographic prediction accuracy */
    topModels: {
        modelId: string;
        modelName: string;
        overallScore: number;
        segmentCount: number;
    }[];
    /** Segments where models show biggest accuracy disparities */
    fairnessConcerns: {
        modelId: string;
        bestSegment: string;
        worstSegment: string;
        gap: number;
    }[];
    /** Full aggregation data */
    aggregation: DemographicAggregation;
    /** Context responsiveness (present when multiple context levels evaluated) */
    contextResponsiveness?: {
        models: Array<{ modelId: string; displayName: string; slope: number }>;
        contextLevelsFound: number[];
    };
}

/**
 * Build a DTEF summary from a collection of evaluation results.
 * Filters for DTEF-tagged results and aggregates them.
 */
export function buildDTEFSummary(allResults: WevalResult[]): DTEFSummary | null {
    const dtefResults = allResults.filter(r =>
        DemographicAggregationService.isDTEFResult(r)
    );

    if (dtefResults.length === 0) return null;

    const aggregation = DemographicAggregationService.aggregate(dtefResults);

    // Top 10 models by score
    const topModels = aggregation.modelResults
        .slice(0, 10)
        .map(m => ({
            modelId: m.modelId,
            modelName: m.modelId.replace(/^openrouter:/, ''),
            overallScore: m.overallScore,
            segmentCount: m.segmentCount,
        }));

    // Fairness concerns: models with >15% gap between best/worst segment
    const fairnessConcerns = aggregation.disparities
        .filter(d => d.absoluteGap > 0.15)
        .slice(0, 5)
        .map(d => ({
            modelId: d.modelId,
            bestSegment: d.bestSegment.label,
            worstSegment: d.worstSegment.label,
            gap: d.absoluteGap,
        }));

    // Context responsiveness (if multiple context levels exist)
    const contextResponsiveness = aggregation.contextAnalysis
        ? {
            models: aggregation.contextAnalysis.models.map(m => ({
                modelId: m.modelId,
                displayName: m.modelId.replace(/^openrouter:/, ''),
                slope: m.overallSlope,
            })),
            contextLevelsFound: aggregation.contextAnalysis.contextLevelsFound,
        }
        : undefined;

    return {
        generatedAt: new Date().toISOString(),
        surveyId: aggregation.surveyId,
        resultCount: dtefResults.length,
        topModels,
        fairnessConcerns,
        aggregation,
        contextResponsiveness,
    };
}

/**
 * Get a list of all survey IDs present in the results.
 */
export function extractSurveyIds(results: WevalResult[]): string[] {
    const ids = new Set<string>();
    for (const result of results) {
        const ctx = DemographicAggregationService.extractDTEFContext(result);
        if (ctx) ids.add(ctx.surveyId);
    }
    return Array.from(ids);
}

/**
 * Group DTEF results by survey ID.
 */
export function groupBySurvey(results: WevalResult[]): Map<string, WevalResult[]> {
    const groups = new Map<string, WevalResult[]>();
    for (const result of results) {
        const ctx = DemographicAggregationService.extractDTEFContext(result);
        if (!ctx) continue;
        if (!groups.has(ctx.surveyId)) groups.set(ctx.surveyId, []);
        groups.get(ctx.surveyId)!.push(result);
    }
    return groups;
}

/**
 * Build DTEF summaries for all surveys found in results.
 */
export function buildAllDTEFSummaries(
    allResults: WevalResult[]
): Map<string, DTEFSummary> {
    const summaries = new Map<string, DTEFSummary>();
    const groups = groupBySurvey(allResults);

    for (const [surveyId, results] of groups) {
        const summary = buildDTEFSummary(results);
        if (summary) {
            summaries.set(surveyId, summary);
        }
    }

    return summaries;
}
