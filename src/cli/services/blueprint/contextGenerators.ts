/**
 * Context Generators for DTEF Blueprint Prompts
 *
 * Generates the context section of prompts based on the configured context format.
 * Each generator produces demographic and survey context in a different style.
 *
 * @module cli/services/blueprint/contextGenerators
 */

import {
    DTEFSurveyData,
    DTEFBlueprintConfig,
    SegmentWithResponses,
    DTEFContextFormat,
} from '@/types/dtef';
import {
    calculateTokenBudget,
    DEFAULT_TOKEN_BUDGET,
} from '@/cli/utils/tokenCounter';
import { DEFAULT_SYSTEM_PROMPT } from './systemPromptGenerators';

export interface ContextResult {
    text: string;
    contextQuestionCount: number;
    contextQuestionIds: string[];
}

/**
 * Format an attribute key for display (e.g., "ageGroup" -> "Age Group").
 */
export function formatAttributeKey(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();
}

/**
 * Build the demographics header describing a segment.
 */
export function buildDemographicsHeader(segment: SegmentWithResponses): string {
    const attributeLines = Object.entries(segment.attributes)
        .map(([key, value]) => `- ${formatAttributeKey(key)}: ${value}`)
        .join('\n');
    return `Consider the following demographic group (sample size: ${segment.sampleSize}):\n${attributeLines}`;
}

/**
 * Attribute-label context: demographics header only (zero-context baseline).
 */
export function buildAttributeLabel(segment: SegmentWithResponses): ContextResult {
    return {
        text: '',
        contextQuestionCount: 0,
        contextQuestionIds: [],
    };
}

/**
 * Distribution-context: demographics + other question distributions.
 * This is the existing full-context format extracted from demographicBlueprintService.
 */
export function buildDistributionContext(
    segment: SegmentWithResponses,
    config: DTEFBlueprintConfig,
    targetQuestionId?: string,
): ContextResult | null {
    const contextQuestionIds = config.contextQuestionIds;
    if (!contextQuestionIds || contextQuestionIds.length === 0) return null;

    const tokenBudget = config.tokenBudget || DEFAULT_TOKEN_BUDGET;
    const systemPrompt = config.blueprintTemplate?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const maxContextQuestions = config.contextQuestionCount;

    const contextTexts: { questionId: string; text: string }[] = [];
    for (const qId of contextQuestionIds) {
        if (qId === targetQuestionId) continue;
        const q = config.surveyData.questions[qId];
        if (!q) continue;
        const resp = segment.responses.find(r => r.questionId === qId);
        if (!resp) continue;

        const optionLines = (q.options || [])
            .map((opt, i) => `${opt}: ${resp.distribution[i]?.toFixed(1) || '?'}%`)
            .join(', ');
        const distStr = resp.distribution.map(n => n.toFixed(1) + '%').join(', ');

        const text = `Q: "${q.text}"\n  Response distribution: ${optionLines || distStr}\n`;
        contextTexts.push({ questionId: qId, text });

        if (maxContextQuestions !== undefined && contextTexts.length >= maxContextQuestions) break;
    }

    if (contextTexts.length === 0) return null;

    const attributeLines = Object.entries(segment.attributes)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n');
    const coreEstimate = `Consider the following demographic group (sample size: ${segment.sampleSize}):\n${attributeLines}\n\nSurvey question:\n"[question text placeholder ~100 chars]"\n\nAnswer options:\n  a. Option 1\n  b. Option 2\n  c. Option 3\n\nPredict the percentage distribution of responses for this demographic group across the answer options.`;

    const budget = calculateTokenBudget(
        systemPrompt,
        coreEstimate,
        contextTexts.map(c => c.text),
        tokenBudget
    );

    const questionsToInclude = contextTexts.slice(0, budget.contextQuestionsFit);
    if (questionsToInclude.length === 0) return null;

    let section = `Known response patterns for this demographic group:\n`;
    for (const ctx of questionsToInclude) {
        section += `${ctx.text}`;
    }
    section += '\n';

    return {
        text: section,
        contextQuestionCount: questionsToInclude.length,
        contextQuestionIds: questionsToInclude.map(q => q.questionId),
    };
}

/**
 * Graduated qualitative descriptor for a distribution.
 */
function describeDistribution(
    distribution: number[],
    options: string[],
    populationDist?: number[],
): string {
    if (distribution.length === 0 || options.length === 0) return '';

    const indexed = distribution.map((pct, i) => ({ option: options[i] || `Option ${i + 1}`, pct, idx: i }));
    const sorted = [...indexed].sort((a, b) => b.pct - a.pct);
    const top = sorted[0];
    const second = sorted[1];

    let desc: string;

    if (top.pct > 70) {
        desc = `Near-unanimous agreement on "${top.option}" (${top.pct.toFixed(0)}%)`;
    } else if (top.pct >= 50) {
        desc = `A clear majority favors "${top.option}" (${top.pct.toFixed(0)}%), with "${second.option}" as a secondary choice (${second.pct.toFixed(0)}%)`;
    } else if (top.pct >= 40) {
        desc = `Tends toward "${top.option}" (${top.pct.toFixed(0)}%) with substantial minority disagreement`;
    } else if (second && Math.abs(top.pct - second.pct) <= 5) {
        desc = `Deeply divided between "${top.option}" (${top.pct.toFixed(0)}%) and "${second.option}" (${second.pct.toFixed(0)}%)`;
    } else {
        desc = `No dominant position — "${top.option}" leads at ${top.pct.toFixed(0)}% with opinion spread across options`;
    }

    // Add relative framing vs population marginal
    if (populationDist) {
        const diffs: string[] = [];
        for (let i = 0; i < Math.min(distribution.length, populationDist.length); i++) {
            const diff = distribution[i] - populationDist[i];
            if (Math.abs(diff) > 5) {
                const direction = diff > 0 ? 'more' : 'less';
                diffs.push(`${Math.abs(diff).toFixed(0)}% ${direction} likely to choose "${options[i]}"`);
            }
        }
        if (diffs.length > 0) {
            desc += `. Compared to the overall population: ${diffs.join('; ')}`;
        }
    }

    return desc;
}

/**
 * Narrative context: qualitative description of response patterns.
 */
export function buildNarrativeContext(
    segment: SegmentWithResponses,
    config: DTEFBlueprintConfig,
    populationMarginals?: Record<string, number[]>,
    targetQuestionId?: string,
): ContextResult | null {
    const contextQuestionIds = config.contextQuestionIds;
    if (!contextQuestionIds || contextQuestionIds.length === 0) return null;

    const maxContextQuestions = config.contextQuestionCount;
    const narratives: { questionId: string; text: string }[] = [];

    for (const qId of contextQuestionIds) {
        if (qId === targetQuestionId) continue;
        const q = config.surveyData.questions[qId];
        if (!q) continue;
        const resp = segment.responses.find(r => r.questionId === qId);
        if (!resp) continue;

        const options = q.options || [];
        const popDist = populationMarginals?.[qId];
        const narrative = describeDistribution(resp.distribution, options, popDist);

        if (narrative) {
            narratives.push({
                questionId: qId,
                text: `On "${q.text}": ${narrative}\n`,
            });
        }

        if (maxContextQuestions !== undefined && narratives.length >= maxContextQuestions) break;
    }

    if (narratives.length === 0) return null;

    let section = `What we know about this group's views:\n`;
    for (const n of narratives) {
        section += `${n.text}`;
    }
    section += '\n';

    return {
        text: section,
        contextQuestionCount: narratives.length,
        contextQuestionIds: narratives.map(n => n.questionId),
    };
}

/**
 * Stub: raw-survey context (individual-level data, Phase 4).
 */
export function buildRawSurveyContext(
    _individual: unknown,
    _config: DTEFBlueprintConfig,
    _targetQuestionId?: string,
): ContextResult | null {
    return null;
}

/**
 * Stub: interview context (Phase 4).
 */
export function buildInterviewContext(
    _individual: unknown,
    _config: DTEFBlueprintConfig,
    _targetQuestionId?: string,
): ContextResult | null {
    return null;
}

/**
 * Stub: first-person context (Phase 4).
 */
export function buildFirstPersonContext(
    _individual: unknown,
    _config: DTEFBlueprintConfig,
    _targetQuestionId?: string,
): ContextResult | null {
    return null;
}

/**
 * Get the appropriate context builder for a given context format.
 */
export function getContextBuilder(
    format: DTEFContextFormat,
    segment: SegmentWithResponses,
    config: DTEFBlueprintConfig,
    targetQuestionId?: string,
    populationMarginals?: Record<string, number[]>,
): ContextResult | null {
    switch (format) {
        case 'attribute-label':
            return buildAttributeLabel(segment);
        case 'distribution-context':
            return buildDistributionContext(segment, config, targetQuestionId);
        case 'narrative':
            return buildNarrativeContext(segment, config, populationMarginals, targetQuestionId);
        case 'raw-survey':
            return buildRawSurveyContext(null, config, targetQuestionId);
        case 'interview':
            return buildInterviewContext(null, config, targetQuestionId);
        case 'first-person':
            return buildFirstPersonContext(null, config, targetQuestionId);
        default:
            return null;
    }
}
