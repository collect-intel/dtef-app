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
    DTEFParticipant,
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
    excludeQuestionIds?: string[],
): ContextResult | null {
    const contextQuestionIds = config.contextQuestionIds;
    if (!contextQuestionIds || contextQuestionIds.length === 0) return null;

    const tokenBudget = config.tokenBudget || DEFAULT_TOKEN_BUDGET;
    const systemPrompt = config.blueprintTemplate?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const maxContextQuestions = config.contextQuestionCount;

    const excludeSet = new Set(excludeQuestionIds || (targetQuestionId ? [targetQuestionId] : []));

    const contextTexts: { questionId: string; text: string }[] = [];
    for (const qId of contextQuestionIds) {
        if (excludeSet.has(qId)) continue;
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
    excludeQuestionIds?: string[],
): ContextResult | null {
    const contextQuestionIds = config.contextQuestionIds;
    if (!contextQuestionIds || contextQuestionIds.length === 0) return null;

    const maxContextQuestions = config.contextQuestionCount;
    const narratives: { questionId: string; text: string }[] = [];

    const excludeSet = new Set(excludeQuestionIds || (targetQuestionId ? [targetQuestionId] : []));

    for (const qId of contextQuestionIds) {
        if (excludeSet.has(qId)) continue;
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
 * Raw survey context: shows other Q&A pairs from the same participant.
 * Most data-rich individual context format.
 */
export function buildRawSurveyContext(
    individual: DTEFParticipant | null,
    config: DTEFBlueprintConfig,
    targetQuestionId?: string,
): ContextResult | null {
    if (!individual) return null;

    const contextResponses = individual.responses.filter(r => r.questionId !== targetQuestionId);
    if (contextResponses.length === 0) return null;

    // Use contextQuestionIds ordering if available, otherwise use all
    const orderedIds = config.contextQuestionIds || contextResponses.map(r => r.questionId);
    const maxQuestions = config.contextQuestionCount;

    const lines: string[] = [];
    const includedIds: string[] = [];

    for (const qId of orderedIds) {
        if (qId === targetQuestionId) continue;
        const resp = contextResponses.find(r => r.questionId === qId);
        if (!resp) continue;
        const q = config.surveyData.questions[qId];
        if (!q) continue;

        lines.push(`Q: ${q.text}\nA: ${resp.selectedOption}\n`);
        includedIds.push(qId);

        if (maxQuestions !== undefined && includedIds.length >= maxQuestions) break;
    }

    if (lines.length === 0) return null;

    return {
        text: `This person's other survey responses:\n${lines.join('\n')}\n`,
        contextQuestionCount: includedIds.length,
        contextQuestionIds: includedIds,
    };
}

/**
 * Interview context: wraps participant answers in conversational interview format.
 * Simulates qualitative research context.
 */
export function buildInterviewContext(
    individual: DTEFParticipant | null,
    config: DTEFBlueprintConfig,
    targetQuestionId?: string,
): ContextResult | null {
    if (!individual) return null;

    const contextResponses = individual.responses.filter(r => r.questionId !== targetQuestionId);
    if (contextResponses.length === 0) return null;

    const orderedIds = config.contextQuestionIds || contextResponses.map(r => r.questionId);
    const maxQuestions = config.contextQuestionCount;

    const lines: string[] = [];
    const includedIds: string[] = [];

    for (const qId of orderedIds) {
        if (qId === targetQuestionId) continue;
        const resp = contextResponses.find(r => r.questionId === qId);
        if (!resp) continue;
        const q = config.surveyData.questions[qId];
        if (!q) continue;

        // Convert question text to conversational phrasing
        let interviewerQ = q.text;
        // Strip trailing punctuation and rephrase as conversational
        interviewerQ = interviewerQ.replace(/[?:]$/, '').trim();

        lines.push(`Interviewer: ${interviewerQ}?\nRespondent: ${resp.selectedOption}.\n`);
        includedIds.push(qId);

        if (maxQuestions !== undefined && includedIds.length >= maxQuestions) break;
    }

    if (lines.length === 0) return null;

    return {
        text: `Interview transcript with this person:\n${lines.join('\n')}\n`,
        contextQuestionCount: includedIds.length,
        contextQuestionIds: includedIds,
    };
}

/**
 * First-person context: generates a biographical self-description from
 * demographics and prior answers in narrative form.
 */
export function buildFirstPersonContext(
    individual: DTEFParticipant | null,
    config: DTEFBlueprintConfig,
    targetQuestionId?: string,
): ContextResult | null {
    if (!individual) return null;

    // Build demographic description
    const demoParts: string[] = [];
    const attrs = individual.attributes;
    if (attrs.ageGroup) demoParts.push(`I'm ${attrs.ageGroup} years old`);
    if (attrs.gender) demoParts.push(`${attrs.gender.toLowerCase()}`);
    if (attrs.environment) demoParts.push(`living in ${attrs.environment === 'Urban' ? 'an urban area' : attrs.environment === 'Rural' ? 'a rural area' : `a ${attrs.environment.toLowerCase()} area`}`);
    if (attrs.country) demoParts.push(`from ${attrs.country}`);
    if (attrs.religion) demoParts.push(`${attrs.religion.startsWith('Do not') ? 'not identifying with any religious group' : `identifying with ${attrs.religion}`}`);
    if (attrs.aiConcern) demoParts.push(`${attrs.aiConcern.toLowerCase()} about AI`);

    let narrative = demoParts.length > 0
        ? `${demoParts.join(', ')}.`
        : 'I am a survey participant.';

    // Add prior answer context
    const contextResponses = individual.responses.filter(r => r.questionId !== targetQuestionId);
    const orderedIds = config.contextQuestionIds || contextResponses.map(r => r.questionId);
    const maxQuestions = config.contextQuestionCount;
    const includedIds: string[] = [];

    for (const qId of orderedIds) {
        if (qId === targetQuestionId) continue;
        const resp = contextResponses.find(r => r.questionId === qId);
        if (!resp) continue;
        const q = config.surveyData.questions[qId];
        if (!q) continue;

        // Shorten question text for narrative embedding
        const shortQ = q.text.length > 80 ? q.text.slice(0, 77) + '...' : q.text;
        narrative += ` When asked "${shortQ}", I said "${resp.selectedOption}".`;
        includedIds.push(qId);

        if (maxQuestions !== undefined && includedIds.length >= maxQuestions) break;
    }

    return {
        text: `This person describes themselves:\n"${narrative}"\n\n`,
        contextQuestionCount: includedIds.length,
        contextQuestionIds: includedIds,
    };
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
    excludeQuestionIds?: string[],
    individual?: DTEFParticipant | null,
): ContextResult | null {
    switch (format) {
        case 'attribute-label':
            return buildAttributeLabel(segment);
        case 'distribution-context':
            return buildDistributionContext(segment, config, targetQuestionId, excludeQuestionIds);
        case 'narrative':
            return buildNarrativeContext(segment, config, populationMarginals, targetQuestionId, excludeQuestionIds);
        case 'raw-survey':
            return buildRawSurveyContext(individual ?? null, config, targetQuestionId);
        case 'interview':
            return buildInterviewContext(individual ?? null, config, targetQuestionId);
        case 'first-person':
            return buildFirstPersonContext(individual ?? null, config, targetQuestionId);
        default:
            return null;
    }
}
