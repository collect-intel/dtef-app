/**
 * Question Curation Service
 *
 * Uses multiple frontier LLMs to curate survey questions for evaluation.
 * Each model reviews all questions and recommends:
 * - Exclusions (with reasons)
 * - Subject ranking by informativeness for demographic evaluation
 *
 * Consensus is computed via majority vote (exclusions) and average rank.
 *
 * @module cli/services/questionCurationService
 */

import { DTEFSurveyData } from '@/types/dtef';

export interface QuestionExclusion {
    questionId: string;
    reason: string;
}

export interface ModelCurationResult {
    modelId: string;
    exclusions: QuestionExclusion[];
    subjectRanking: string[];
    rawResponse: string;
}

export interface QuestionCurationResult {
    surveyId: string;
    curatedAt: string;
    models: ModelCurationResult[];
    consensus: {
        exclusions: (QuestionExclusion & { voteCount: number })[];
        subjectRanking: { questionId: string; voteCount: number; avgRank: number }[];
    };
    questionCount: number;
    excludedCount: number;
}

const CURATION_PROMPT_TEMPLATE = `You are an expert survey methodologist reviewing questions for an AI demographic evaluation benchmark.

The benchmark tests whether AI models can predict how different demographic groups (by age, gender, country, religion, etc.) would respond to survey questions. Questions are scored by comparing AI-predicted response distributions to actual survey data.

IMPORTANT: Do NOT favor questions that are easy for AI models to predict. The goal is to select questions that genuinely test whether models understand demographic differences — not questions that inflate AI scores.

Below are all questions from the survey. For each question, you see the question text and answer options.

SURVEY: {surveyName} ({surveyId})
QUESTIONS:
{questionList}

Please analyze these questions and return a JSON object with exactly two fields:

1. "exclusions": Array of objects with "questionId" and "reason" for questions that should be EXCLUDED from the benchmark. Exclude questions that:
   - Are purely demographic/definitional (e.g., "What is your age?")
   - Have trivially predictable answers for all groups
   - Are badly worded or ambiguous
   - Have answer options that don't form a meaningful scale or set

2. "subjectRanking": Array of the TOP {rankLimit} question IDs (out of {totalQuestions} total) ranked from MOST to LEAST informative for demographic evaluation. Return EXACTLY {rankLimit} IDs — no more, no fewer. Prioritize questions that:
   - Have high topic diversity (cover different domains)
   - Show likely inter-segment variance (different demographics would answer differently)
   - Are substantive opinion/value questions (not factual knowledge)
   - Have clear, well-differentiated answer options

Return ONLY valid JSON. No other text.`;

/**
 * Build the curation prompt for a survey.
 */
export function buildCurationPrompt(surveyData: DTEFSurveyData): string {
    const questionList = Object.entries(surveyData.questions)
        .map(([id, q], idx) => {
            const optionsStr = (q.options || [])
                .map((opt, i) => `${String.fromCharCode(97 + i)}. ${opt}`)
                .join(', ');
            return `  ${idx + 1}. [${id}] "${q.text}"${optionsStr ? `\n     Options: ${optionsStr}` : ''}`;
        })
        .join('\n');

    const totalQuestions = Object.keys(surveyData.questions).length;
    const rankLimit = Math.max(20, Math.round(totalQuestions * 0.3));

    return CURATION_PROMPT_TEMPLATE
        .replace('{surveyName}', surveyData.surveyName)
        .replace('{surveyId}', surveyData.surveyId)
        .replace('{questionList}', questionList)
        .replace(/\{rankLimit\}/g, String(rankLimit))
        .replace('{totalQuestions}', String(totalQuestions));
}

/**
 * Parse a model's curation response into structured results.
 * Handles JSON in code blocks and partial responses.
 */
export function parseCurationResponse(response: string, modelId: string): ModelCurationResult {
    const result: ModelCurationResult = {
        modelId,
        exclusions: [],
        subjectRanking: [],
        rawResponse: response,
    };

    // Extract JSON from response (handle code blocks)
    let jsonStr = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
    }

    // Try to find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return result;

    try {
        const parsed = JSON.parse(jsonMatch[0]);

        if (Array.isArray(parsed.exclusions)) {
            result.exclusions = parsed.exclusions
                .filter((e: any) => e && typeof e.questionId === 'string')
                .map((e: any) => ({
                    questionId: String(e.questionId),
                    reason: String(e.reason || 'No reason given'),
                }));
        }

        if (Array.isArray(parsed.subjectRanking)) {
            result.subjectRanking = parsed.subjectRanking
                .filter((id: any) => typeof id === 'string')
                .map((id: any) => String(id));
        }
    } catch {
        // JSON parse failed — return empty result with raw response
    }

    return result;
}

/**
 * Compute consensus across multiple model curation results.
 * Exclusions: majority vote (appears in 2+ of 3 models).
 * Rankings: sort by vote count, break ties by average rank.
 */
export function computeConsensus(
    results: ModelCurationResult[],
    allQuestionIds: string[],
): QuestionCurationResult['consensus'] {
    const modelCount = results.length;
    const majorityThreshold = Math.ceil(modelCount / 2);

    // Exclusion consensus
    const exclusionVotes = new Map<string, { reasons: string[]; count: number }>();
    for (const result of results) {
        for (const excl of result.exclusions) {
            const entry = exclusionVotes.get(excl.questionId) || { reasons: [], count: 0 };
            entry.reasons.push(`[${result.modelId}] ${excl.reason}`);
            entry.count++;
            exclusionVotes.set(excl.questionId, entry);
        }
    }

    const consensusExclusions = Array.from(exclusionVotes.entries())
        .filter(([_, v]) => v.count >= majorityThreshold)
        .map(([qId, v]) => ({
            questionId: qId,
            reason: v.reasons.join('; '),
            voteCount: v.count,
        }))
        .sort((a, b) => b.voteCount - a.voteCount);

    // Ranking consensus
    const rankData = new Map<string, { ranks: number[]; voteCount: number }>();
    for (const qId of allQuestionIds) {
        rankData.set(qId, { ranks: [], voteCount: 0 });
    }

    for (const result of results) {
        for (let i = 0; i < result.subjectRanking.length; i++) {
            const qId = result.subjectRanking[i];
            const entry = rankData.get(qId);
            if (entry) {
                entry.ranks.push(i);
                entry.voteCount++;
            }
        }
    }

    const consensusRanking = Array.from(rankData.entries())
        .map(([qId, data]) => ({
            questionId: qId,
            voteCount: data.voteCount,
            avgRank: data.ranks.length > 0
                ? data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length
                : allQuestionIds.length, // Unranked questions get worst rank
        }))
        .sort((a, b) => {
            if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
            return a.avgRank - b.avgRank;
        });

    return {
        exclusions: consensusExclusions,
        subjectRanking: consensusRanking,
    };
}

/**
 * Run the full curation pipeline.
 * Note: actual LLM calls are left to the CLI command since they require
 * model-specific API clients (OpenRouter, Anthropic, etc.).
 * This function processes the results.
 */
export function buildCurationResult(
    surveyData: DTEFSurveyData,
    modelResults: ModelCurationResult[],
): QuestionCurationResult {
    const allQuestionIds = Object.keys(surveyData.questions);
    const consensus = computeConsensus(modelResults, allQuestionIds);

    return {
        surveyId: surveyData.surveyId,
        curatedAt: new Date().toISOString(),
        models: modelResults,
        consensus,
        questionCount: allQuestionIds.length,
        excludedCount: consensus.exclusions.length,
    };
}
