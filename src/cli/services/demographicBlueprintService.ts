/**
 * Demographic Blueprint Service
 *
 * Generates evaluation blueprints from demographic aggregate survey data.
 * Instead of predicting individual responses, these blueprints test whether
 * AI models can predict the distribution of responses across a demographic segment.
 *
 * @module cli/services/demographicBlueprintService
 */

import {
    DTEFSurveyData,
    DTEFBlueprintConfig,
    DTEFPrompt,
    DTEFGeneratedBlueprint,
    SegmentWithResponses,
    DemographicResponse,
} from '@/types/dtef';
import { WevalConfig, WevalPromptConfig } from '@/types/shared';
import {
    calculateTokenBudget,
    DEFAULT_TOKEN_BUDGET,
    estimateTokens,
} from '@/cli/utils/tokenCounter';

/**
 * Default system prompt for demographic distribution prediction.
 * Instructs the model to predict survey response distributions.
 */
const DEFAULT_SYSTEM_PROMPT = `You are a demographic survey analyst. When given a demographic group and a survey question, predict how that group would respond by providing a percentage distribution across the answer options.

Respond ONLY with the distribution in this exact format:
[percentage1, percentage2, percentage3, ...]

The percentages must sum to 100. Use one decimal place. Do not include any other text.

Example for a 4-option question:
[35.2, 28.1, 22.4, 14.3]`;

/**
 * System prompt for batched multi-question mode.
 * The model returns a JSON object keyed by question label.
 */
const BATCHED_SYSTEM_PROMPT = `You are a demographic survey analyst. When given a demographic group and multiple survey questions, predict how that group would respond to each question by providing percentage distributions across the answer options.

Respond ONLY with a JSON object. Keys are question labels (Q1, Q2, etc.). Values are arrays of percentages summing to 100. Use one decimal place. Do not include any other text.

Example:
{"Q1": [35.2, 28.1, 22.4, 14.3], "Q2": [45.0, 35.0, 20.0]}`;

/**
 * Generates DTEF blueprints from demographic survey data.
 */
export class DemographicBlueprintService {
    /**
     * Generate WevalConfig blueprints from demographic survey data.
     * Produces one blueprint per demographic segment containing prompts
     * for each target question.
     */
    static generateBlueprints(config: DTEFBlueprintConfig): WevalConfig[] {
        const segments = this.selectSegments(config);
        const blueprints: WevalConfig[] = [];

        for (const segment of segments) {
            const blueprint = this.generateBlueprintForSegment(config, segment);
            blueprints.push(blueprint);
        }

        return blueprints;
    }

    /**
     * Generate a single WevalConfig for a demographic segment.
     */
    private static generateBlueprintForSegment(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses
    ): WevalConfig {
        const batchSize = config.batchSize || 1;

        // Use batched generation if batchSize > 1
        if (batchSize > 1) {
            return this.generateBatchedBlueprintForSegment(config, segment, batchSize);
        }

        const prompts: WevalPromptConfig[] = [];
        let blueprintContextCount = 0;
        let blueprintContextIds: string[] = [];

        for (const questionId of config.targetQuestionIds) {
            const question = config.surveyData.questions[questionId];
            if (!question) continue;

            const response = segment.responses.find(r => r.questionId === questionId);
            if (!response) continue;

            const { prompt, contextQuestionCount, contextQuestionIds } = this.generatePromptForQuestion(
                config,
                segment,
                questionId,
                question,
                response
            );
            prompts.push(prompt);

            // Track the maximum context count across all prompts.
            // Different prompts may get different counts due to token budget constraints
            // (longer target questions leave less room for context), so we use the max
            // as the representative value for this blueprint.
            if (contextQuestionCount > blueprintContextCount) {
                blueprintContextCount = contextQuestionCount;
                blueprintContextIds = contextQuestionIds;
            }
        }

        // ConfigId: no suffix for 0 context, -c{N} for N context questions
        const ctxSuffix = blueprintContextCount > 0 ? `-c${blueprintContextCount}` : '';
        const blueprintId = `dtef-${config.surveyData.surveyId}-${segment.id}${ctxSuffix}`;
        const ctxLabel = blueprintContextCount > 0 ? ` (${blueprintContextCount} context Qs)` : '';
        const blueprintTitle = `${config.surveyData.surveyName} - ${segment.label}${ctxLabel}`;

        // Build ground truth distributions map for DTEF metadata
        const groundTruthDistributions: Record<string, number[]> = {};
        for (const prompt of prompts) {
            const response = segment.responses.find(r => r.questionId === prompt.id.split('-')[0]);
            if (prompt.idealResponse) {
                try {
                    const dist = JSON.parse(prompt.idealResponse);
                    if (Array.isArray(dist)) {
                        groundTruthDistributions[prompt.id] = dist;
                    }
                } catch { /* ignore parse errors */ }
            }
        }

        return {
            configId: blueprintId,
            configTitle: blueprintTitle,
            description: `DTEF: Predict response distributions for ${segment.label}. Source: ${config.surveyData.source || config.surveyData.surveyName}`,
            models: config.modelConfig?.models || ['CORE'],
            system: config.blueprintTemplate?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
            temperature: config.modelConfig?.temperature || 0.3,
            prompts,
            tags: ['_periodic', 'dtef', 'demographic', config.surveyData.surveyId],
            context: {
                dtef: {
                    surveyId: config.surveyData.surveyId,
                    segmentId: segment.id,
                    segmentLabel: segment.label,
                    segmentAttributes: segment.attributes,
                    groundTruthDistributions,
                    contextQuestionCount: blueprintContextCount,
                    contextQuestionIds: blueprintContextIds,
                },
            },
        };
    }

    /**
     * Generate a batched blueprint where multiple questions are asked per prompt.
     * Each prompt contains up to batchSize questions and evaluates each with
     * its own distribution_metric point (keyed by questionKey).
     */
    private static generateBatchedBlueprintForSegment(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        batchSize: number
    ): WevalConfig {
        const prompts: WevalPromptConfig[] = [];

        // Collect valid question/response pairs
        const questionPairs: { questionId: string; question: { text: string; type: string; options?: string[] }; response: DemographicResponse }[] = [];
        for (const questionId of config.targetQuestionIds) {
            const question = config.surveyData.questions[questionId];
            if (!question) continue;
            const response = segment.responses.find(r => r.questionId === questionId);
            if (!response) continue;
            questionPairs.push({ questionId, question, response });
        }

        // Split into batches
        for (let batchIdx = 0; batchIdx < questionPairs.length; batchIdx += batchSize) {
            const batch = questionPairs.slice(batchIdx, batchIdx + batchSize);
            const promptId = `batch-${Math.floor(batchIdx / batchSize)}-${segment.id}`;

            // Build batched prompt text
            const attributeLines = Object.entries(segment.attributes)
                .map(([key, value]) => `- ${this.formatAttributeKey(key)}: ${value}`)
                .join('\n');

            let promptText = `Consider the following demographic group (sample size: ${segment.sampleSize}):\n`;
            promptText += `${attributeLines}\n\n`;
            promptText += `For each of the following survey questions, predict the percentage distribution of responses for this demographic group.\n\n`;

            batch.forEach((item, idx) => {
                const label = `Q${idx + 1}`;
                promptText += `${label}: "${item.question.text}"\n`;
                if (item.question.options && item.question.options.length > 0) {
                    promptText += `  Options: ${item.question.options.map((opt, i) => `${String.fromCharCode(97 + i)}. ${opt}`).join(', ')}\n`;
                }
                promptText += '\n';
            });

            // Build ideal response as JSON object
            const idealObj: Record<string, string> = {};
            batch.forEach((item, idx) => {
                const label = `Q${idx + 1}`;
                idealObj[label] = `[${item.response.distribution.map(n => n.toFixed(1)).join(', ')}]`;
            });
            const idealResponse = JSON.stringify(
                Object.fromEntries(batch.map((item, idx) => [`Q${idx + 1}`, item.response.distribution.map(n => parseFloat(n.toFixed(1)))]))
            );

            // Build points array — one distribution_metric per question in the batch
            const points: WevalPromptConfig['points'] = batch.map((item, idx) => ({
                text: `Distribution Similarity Q${idx + 1}: "${item.question.text.slice(0, 60)}..."`,
                fn: 'distribution_metric',
                fnArgs: {
                    expected: item.response.distribution,
                    metric: 'js-divergence',
                    questionKey: `Q${idx + 1}`,
                },
            }));

            prompts.push({
                id: promptId,
                description: `Batched prediction (${batch.length} Qs): ${segment.label}`,
                promptText,
                points,
                idealResponse,
                temperature: config.modelConfig?.temperature,
            });
        }

        const blueprintId = `dtef-${config.surveyData.surveyId}-${segment.id}-b${batchSize}`;
        const blueprintTitle = `${config.surveyData.surveyName} - ${segment.label} (batch ${batchSize})`;

        // Build ground truth distributions
        const groundTruthDistributions: Record<string, number[]> = {};
        for (const pair of questionPairs) {
            groundTruthDistributions[pair.questionId] = pair.response.distribution;
        }

        return {
            configId: blueprintId,
            configTitle: blueprintTitle,
            description: `DTEF: Batched distribution predictions (${batchSize} Qs/prompt) for ${segment.label}. Source: ${config.surveyData.source || config.surveyData.surveyName}`,
            models: config.modelConfig?.models || ['CORE_CHEAP'],
            system: BATCHED_SYSTEM_PROMPT,
            temperature: config.modelConfig?.temperature || 0.3,
            prompts,
            tags: ['_periodic', 'dtef', 'demographic', 'batched', config.surveyData.surveyId],
            context: {
                dtef: {
                    surveyId: config.surveyData.surveyId,
                    segmentId: segment.id,
                    segmentLabel: segment.label,
                    segmentAttributes: segment.attributes,
                    groundTruthDistributions,
                    batchSize,
                },
            },
        };
    }

    /**
     * Generate a prompt that asks the model to predict a demographic
     * segment's response distribution for a specific question.
     */
    private static generatePromptForQuestion(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        questionId: string,
        question: { text: string; type: string; options?: string[] },
        response: DemographicResponse
    ): { prompt: WevalPromptConfig; contextQuestionCount: number; contextQuestionIds: string[] } {
        const options = question.options || [];
        const { text: promptText, contextQuestionCount, contextQuestionIds } = this.buildPromptText(config, segment, question, options, questionId);

        // Build the ideal response as the distribution string
        const idealDistribution = response.distribution
            .map(n => n.toFixed(1))
            .join(', ');
        const idealResponse = `[${idealDistribution}]`;

        // Build evaluation points using the distribution_metric point function
        const points = this.generateDistributionPoints(response.distribution, options);

        return {
            prompt: {
                id: `${questionId}-${segment.id}`,
                description: `Predict: ${segment.label} → "${question.text}"`,
                promptText,
                points,
                idealResponse,
                temperature: config.modelConfig?.temperature,
            },
            contextQuestionCount,
            contextQuestionIds,
        };
    }

    /**
     * Build the prompt text for a demographic prediction question.
     * Optionally includes context questions (other questions' distributions
     * for the same segment) if token budget allows.
     * Returns text and context metadata.
     */
    private static buildPromptText(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        question: { text: string; type: string; options?: string[] },
        options: string[],
        targetQuestionId?: string
    ): { text: string; contextQuestionCount: number; contextQuestionIds: string[] } {
        const prefix = config.blueprintTemplate?.promptPrefix || '';
        const suffix = config.blueprintTemplate?.promptSuffix || '';

        // Describe the demographic segment
        const attributeLines = Object.entries(segment.attributes)
            .map(([key, value]) => `- ${this.formatAttributeKey(key)}: ${value}`)
            .join('\n');

        // Build the core prompt first (without context questions)
        let corePrompt = '';

        if (prefix) {
            corePrompt += `${prefix}\n\n`;
        }

        corePrompt += `Consider the following demographic group (sample size: ${segment.sampleSize}):\n`;
        corePrompt += `${attributeLines}\n\n`;

        // Build context questions section if configured and budget allows
        const contextResult = this.buildContextSection(
            config,
            segment,
            targetQuestionId
        );

        let contextQuestionCount = 0;
        let contextQuestionIds: string[] = [];

        if (contextResult) {
            corePrompt += contextResult.text;
            contextQuestionCount = contextResult.questionCount;
            contextQuestionIds = contextResult.questionIds;
        }

        corePrompt += `Survey question:\n"${question.text}"\n\n`;

        if (options.length > 0) {
            corePrompt += `Answer options:\n`;
            options.forEach((option, idx) => {
                const letter = String.fromCharCode(97 + idx);
                corePrompt += `  ${letter}. ${option}\n`;
            });
            corePrompt += '\n';
        }

        corePrompt += `Predict the percentage distribution of responses for this demographic group across the answer options.`;

        if (suffix) {
            corePrompt += `\n\n${suffix}`;
        }

        return { text: corePrompt, contextQuestionCount, contextQuestionIds };
    }

    /**
     * Build context section with other question distributions for the segment.
     * Uses token budget to decide how many context questions to include.
     * Returns structured result with text, count, and IDs for metadata.
     */
    private static buildContextSection(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        targetQuestionId?: string
    ): { text: string; questionCount: number; questionIds: string[] } | null {
        const contextQuestionIds = config.contextQuestionIds;
        if (!contextQuestionIds || contextQuestionIds.length === 0) return null;

        const tokenBudget = config.tokenBudget || DEFAULT_TOKEN_BUDGET;
        const systemPrompt = config.blueprintTemplate?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

        // If contextQuestionCount is set, limit pool to that many questions
        const maxContextQuestions = config.contextQuestionCount;

        // Build context question texts
        const contextTexts: { questionId: string; text: string }[] = [];
        for (const qId of contextQuestionIds) {
            if (qId === targetQuestionId) continue; // Skip the target question
            const q = config.surveyData.questions[qId];
            if (!q) continue;
            const resp = segment.responses.find(r => r.questionId === qId);
            if (!resp) continue;

            const distStr = resp.distribution.map(n => n.toFixed(1) + '%').join(', ');
            const optionLines = (q.options || [])
                .map((opt, i) => `${opt}: ${resp.distribution[i]?.toFixed(1) || '?'}%`)
                .join(', ');

            const text = `Q: "${q.text}"\n  Response distribution: ${optionLines || distStr}\n`;
            contextTexts.push({ questionId: qId, text });

            // Stop early if we've hit the explicit context count limit
            if (maxContextQuestions !== undefined && contextTexts.length >= maxContextQuestions) break;
        }

        if (contextTexts.length === 0) return null;

        // Estimate core prompt size (demographics + target question + formatting)
        // to get a more accurate token budget for context questions
        const attributeLines = Object.entries(segment.attributes)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');
        const coreEstimate = `Consider the following demographic group (sample size: ${segment.sampleSize}):\n${attributeLines}\n\nSurvey question:\n"[question text placeholder ~100 chars]"\n\nAnswer options:\n  a. Option 1\n  b. Option 2\n  c. Option 3\n\nPredict the percentage distribution of responses for this demographic group across the answer options.`;

        // Check token budget - estimate how many context questions fit
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
            questionCount: questionsToInclude.length,
            questionIds: questionsToInclude.map(q => q.questionId),
        };
    }

    /**
     * Generate evaluation points for distribution comparison.
     * Uses a single computational point function (no LLM judges needed).
     * JS-divergence captures overall distribution similarity in one score,
     * avoiding the double-counting that per-option scoring introduces
     * (distribution options are constrained to sum to ~100%).
     */
    private static generateDistributionPoints(
        expectedDistribution: number[],
        _options: string[]
    ): WevalPromptConfig['points'] {
        return [{
            text: 'Distribution Similarity (Jensen-Shannon Distance)',
            fn: 'distribution_metric',
            fnArgs: {
                expected: expectedDistribution,
                metric: 'js-divergence',
            },
        }];
    }

    /**
     * Select segments based on configuration.
     */
    private static selectSegments(config: DTEFBlueprintConfig): SegmentWithResponses[] {
        const allSegments = config.surveyData.segments;

        if (config.segmentSelection === 'specific' && config.segmentIds) {
            return allSegments.filter(s => config.segmentIds!.includes(s.id));
        }

        return allSegments;
    }

    /**
     * Format an attribute key for display (e.g., "ageGroup" -> "Age Group").
     */
    private static formatAttributeKey(key: string): string {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
    }

    /**
     * Generate DTEFGeneratedBlueprint objects (richer output for analysis).
     */
    static generateDetailedBlueprints(config: DTEFBlueprintConfig): DTEFGeneratedBlueprint[] {
        const segments = this.selectSegments(config);
        const blueprints: DTEFGeneratedBlueprint[] = [];

        for (const segment of segments) {
            const prompts: DTEFPrompt[] = [];

            for (const questionId of config.targetQuestionIds) {
                const question = config.surveyData.questions[questionId];
                if (!question) continue;

                const response = segment.responses.find(r => r.questionId === questionId);
                if (!response) continue;

                const options = question.options || [];
                const { text: promptText } = this.buildPromptText(config, segment, question, options, questionId);

                prompts.push({
                    id: `${questionId}-${segment.id}`,
                    promptText,
                    expectedDistribution: response.distribution,
                    optionLabels: options,
                    questionId,
                    segmentId: segment.id,
                });
            }

            blueprints.push({
                segmentId: segment.id,
                segmentLabel: segment.label,
                configId: `dtef-${config.surveyData.surveyId}-${segment.id}`,
                configTitle: `${config.surveyData.surveyName} - ${segment.label}`,
                prompts,
                segmentAttributes: segment.attributes,
            });
        }

        return blueprints;
    }
}
