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
        const prompts: WevalPromptConfig[] = [];

        for (const questionId of config.targetQuestionIds) {
            const question = config.surveyData.questions[questionId];
            if (!question) continue;

            const response = segment.responses.find(r => r.questionId === questionId);
            if (!response) continue;

            const prompt = this.generatePromptForQuestion(
                config,
                segment,
                questionId,
                question,
                response
            );
            prompts.push(prompt);
        }

        const blueprintId = `dtef-${config.surveyData.surveyId}-${segment.id}`;
        const blueprintTitle = `${config.surveyData.surveyName} - ${segment.label}`;

        // Build ground truth distributions map for DTEF metadata
        const groundTruthDistributions: Record<string, number[]> = {};
        for (const prompt of prompts) {
            const response = segment.responses.find(r => r.questionId === prompt.id.split('-')[0]);
            // Use the idealResponse to extract expected distribution
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
    ): WevalPromptConfig {
        const options = question.options || [];
        const promptText = this.buildPromptText(config, segment, question, options, questionId);

        // Build the ideal response as the distribution string
        const idealDistribution = response.distribution
            .map(n => n.toFixed(1))
            .join(', ');
        const idealResponse = `[${idealDistribution}]`;

        // Build evaluation points using the distribution_metric point function
        const points = this.generateDistributionPoints(response.distribution, options);

        return {
            id: `${questionId}-${segment.id}`,
            description: `Predict: ${segment.label} → "${question.text}"`,
            promptText,
            points,
            idealResponse,
            temperature: config.modelConfig?.temperature,
        };
    }

    /**
     * Build the prompt text for a demographic prediction question.
     * Optionally includes context questions (other questions' distributions
     * for the same segment) if token budget allows.
     */
    private static buildPromptText(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        question: { text: string; type: string; options?: string[] },
        options: string[],
        targetQuestionId?: string
    ): string {
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
        const contextSection = this.buildContextSection(
            config,
            segment,
            targetQuestionId
        );

        if (contextSection) {
            corePrompt += contextSection;
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

        return corePrompt;
    }

    /**
     * Build context section with other question distributions for the segment.
     * Uses token budget to decide how many context questions to include.
     */
    private static buildContextSection(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        targetQuestionId?: string
    ): string | null {
        const contextQuestionIds = config.contextQuestionIds;
        if (!contextQuestionIds || contextQuestionIds.length === 0) return null;

        const tokenBudget = config.tokenBudget || DEFAULT_TOKEN_BUDGET;
        const systemPrompt = config.blueprintTemplate?.systemPrompt || DEFAULT_SYSTEM_PROMPT;

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
        }

        if (contextTexts.length === 0) return null;

        // Check token budget - estimate how many context questions fit
        const budget = calculateTokenBudget(
            systemPrompt,
            '', // Core prompt not built yet at this point; use conservative estimate
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

        return section;
    }

    /**
     * Generate evaluation points for distribution comparison.
     * Uses the distribution_metric point function to compare
     * expected vs actual distributions.
     */
    private static generateDistributionPoints(
        expectedDistribution: number[],
        options: string[]
    ): WevalPromptConfig['points'] {
        const points: WevalPromptConfig['points'] = [];

        // Primary point: overall distribution similarity
        points.push({
            text: `Response distribution matches expected demographic pattern`,
            fn: 'distribution_metric',
            fnArgs: {
                expected: expectedDistribution,
                metric: 'js-divergence',
                threshold: 0.85,
            },
        });

        // Secondary points: individual option accuracy (within tolerance)
        expectedDistribution.forEach((expected, idx) => {
            if (expected >= 5) {  // Only check options with meaningful presence
                const optionLabel = options[idx] || `Option ${idx + 1}`;
                const tolerance = Math.max(5, expected * 0.3); // 30% relative or 5pp absolute
                points.push(
                    `Predicted percentage for "${optionLabel}" is within ${tolerance.toFixed(0)}pp of ${expected.toFixed(1)}%`
                );
            }
        });

        return points;
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
                const promptText = this.buildPromptText(config, segment, question, options, questionId);

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
