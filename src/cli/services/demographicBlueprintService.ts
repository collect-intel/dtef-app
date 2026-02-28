/**
 * Demographic Blueprint Service
 *
 * Generates evaluation blueprints from demographic aggregate survey data.
 * Orchestrates context generators, system prompt generators, prompt assemblers,
 * and config ID encoders from the blueprint/ modules.
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
    DTEFEvalType,
    DTEFContextFormat,
    DTEFReasoningMode,
} from '@/types/dtef';
import { WevalConfig, WevalPromptConfig } from '@/types/shared';
import {
    formatAttributeKey,
    buildDistributionContext,
    buildNarrativeContext,
    getContextBuilder,
    ContextResult,
} from './blueprint/contextGenerators';
import {
    getSystemPrompt,
    DEFAULT_SYSTEM_PROMPT,
    BATCHED_SYSTEM_PROMPT,
    SHIFT_SYSTEM_PROMPT,
} from './blueprint/systemPromptGenerators';
import { assemblePrompt, assembleBatchedPrompt, BatchedQuestionItem } from './blueprint/promptAssembler';
import { encodeConfigId } from './blueprint/configIdEncoder';

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
     * Compute population marginal distributions (weighted average across segments).
     * Returns a map from questionId to marginal distribution.
     */
    static computePopulationMarginals(
        surveyData: DTEFSurveyData,
    ): Record<string, number[]> {
        const accum = new Map<string, { weightedSum: number[]; totalWeight: number }>();

        for (const segment of surveyData.segments) {
            for (const resp of segment.responses) {
                let entry = accum.get(resp.questionId);
                if (!entry) {
                    entry = { weightedSum: new Array(resp.distribution.length).fill(0), totalWeight: 0 };
                    accum.set(resp.questionId, entry);
                }
                for (let i = 0; i < resp.distribution.length; i++) {
                    entry.weightedSum[i] += resp.distribution[i] * segment.sampleSize;
                }
                entry.totalWeight += segment.sampleSize;
            }
        }

        const result: Record<string, number[]> = {};
        for (const [qId, entry] of accum) {
            result[qId] = entry.weightedSum.map(v => v / entry.totalWeight);
        }
        return result;
    }

    /**
     * Generate a single WevalConfig for a demographic segment.
     */
    private static generateBlueprintForSegment(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses
    ): WevalConfig {
        const batchSize = config.batchSize || 1;
        const evalType: DTEFEvalType = config.evalType || 'distribution';
        const reasoningMode: DTEFReasoningMode = config.reasoningMode || 'standard';

        // Determine context format: if not explicitly set, infer from config
        const contextFormat: DTEFContextFormat = config.contextFormat
            || (config.contextQuestionIds && config.contextQuestionIds.length > 0
                ? 'distribution-context'
                : 'attribute-label');

        // Use batched generation if batchSize > 1
        if (batchSize > 1) {
            return this.generateBatchedBlueprintForSegment(config, segment, batchSize);
        }

        // For shift eval type, compute marginals if not provided
        let marginals: Record<string, number[]> | undefined;
        if (evalType === 'shift' || contextFormat === 'narrative') {
            marginals = config.populationMarginals || this.computePopulationMarginals(config.surveyData);
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
                response,
                evalType,
                contextFormat,
                reasoningMode,
                marginals,
            );
            prompts.push(prompt);

            // Track the maximum context count across all prompts.
            if (contextQuestionCount > blueprintContextCount) {
                blueprintContextCount = contextQuestionCount;
                blueprintContextIds = contextQuestionIds;
            }
        }

        // Use configIdEncoder for backward-compatible configId
        const blueprintId = encodeConfigId({
            surveyId: config.surveyData.surveyId,
            segmentId: segment.id,
            contextQuestionCount: blueprintContextCount,
            contextFormat,
            evalType,
            reasoningMode,
        });

        const ctxLabel = blueprintContextCount > 0 ? ` (${blueprintContextCount} context Qs)` : '';
        const evalLabel = evalType === 'shift' ? ' [shift]'
            : evalType === 'synthetic-individual' ? ' [synth]'
            : evalType === 'individual-answer' ? ' [indiv]'
            : '';
        const cotLabel = reasoningMode === 'cot' ? ' [CoT]' : '';
        const fmtLabel = contextFormat === 'narrative' ? ' [narrative]' : '';
        const blueprintTitle = `${config.surveyData.surveyName} - ${segment.label}${ctxLabel}${evalLabel}${cotLabel}${fmtLabel}`;

        // Build ground truth distributions map for DTEF metadata
        const groundTruthDistributions: Record<string, number[]> = {};
        for (const prompt of prompts) {
            if (prompt.idealResponse) {
                try {
                    const dist = JSON.parse(prompt.idealResponse);
                    if (Array.isArray(dist)) {
                        groundTruthDistributions[prompt.id] = dist;
                    }
                } catch { /* ignore parse errors */ }
            }
        }

        // Choose system prompt via the generator
        const systemPrompt = getSystemPrompt(evalType, reasoningMode, {
            customPrompt: config.blueprintTemplate?.systemPrompt,
        });

        // Build tags
        const evalTag = evalType === 'shift' ? 'shift'
            : evalType === 'synthetic-individual' ? 'synthetic-individual'
            : evalType === 'individual-answer' ? 'individual-answer'
            : 'distribution';
        const tags = ['_periodic', 'dtef', 'demographic', evalTag, config.surveyData.surveyId];
        if (reasoningMode === 'cot') tags.push('cot');
        if (contextFormat === 'narrative') tags.push('narrative');
        if (config.experimentId) tags.push(`experiment:${config.experimentId}`);

        return {
            configId: blueprintId,
            configTitle: blueprintTitle,
            description: `DTEF${evalLabel}: Predict response distributions for ${segment.label}. Source: ${config.surveyData.source || config.surveyData.surveyName}`,
            models: config.modelConfig?.models || ['CORE'],
            system: systemPrompt,
            temperature: config.modelConfig?.temperature || 0.3,
            prompts,
            tags,
            context: {
                dtef: {
                    surveyId: config.surveyData.surveyId,
                    segmentId: segment.id,
                    segmentLabel: segment.label,
                    segmentAttributes: segment.attributes,
                    groundTruthDistributions,
                    contextQuestionCount: blueprintContextCount,
                    contextQuestionIds: blueprintContextIds,
                    evalType,
                    contextFormat,
                    reasoningMode,
                    ...(config.experimentId ? { experimentId: config.experimentId } : {}),
                    ...(marginals ? { populationMarginals: marginals } : {}),
                },
            },
        };
    }

    /**
     * Generate a batched blueprint where multiple questions are asked per prompt.
     * Uses the full composition model: context generators, prompt assembler,
     * system prompt generators, and config ID encoder.
     */
    private static generateBatchedBlueprintForSegment(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        batchSize: number
    ): WevalConfig {
        const evalType: DTEFEvalType = config.evalType || 'distribution';
        const reasoningMode: DTEFReasoningMode = config.reasoningMode || 'standard';
        const contextFormat: DTEFContextFormat = config.contextFormat
            || (config.contextQuestionIds && config.contextQuestionIds.length > 0
                ? 'distribution-context'
                : 'attribute-label');

        // Compute marginals if needed
        let marginals: Record<string, number[]> | undefined;
        if (evalType === 'shift' || contextFormat === 'narrative') {
            marginals = config.populationMarginals || this.computePopulationMarginals(config.surveyData);
        }

        const prompts: WevalPromptConfig[] = [];
        let blueprintContextCount = 0;
        let blueprintContextIds: string[] = [];

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

            // Exclude all batch question IDs from context
            const batchQuestionIds = batch.map(item => item.questionId);

            // Build context using the composition model
            let contextBlock: ContextResult | null = null;
            if (contextFormat === 'distribution-context') {
                contextBlock = buildDistributionContext(segment, config, undefined, batchQuestionIds);
            } else if (contextFormat === 'narrative') {
                contextBlock = buildNarrativeContext(segment, config, marginals, undefined, batchQuestionIds);
            } else {
                contextBlock = getContextBuilder(contextFormat, segment, config, undefined, marginals, batchQuestionIds);
            }

            // Assemble the batched prompt
            const batchedItems: BatchedQuestionItem[] = batch.map(item => ({
                questionId: item.questionId,
                question: item.question,
            }));

            const assembled = assembleBatchedPrompt(
                contextBlock,
                segment,
                batchedItems,
                evalType,
                reasoningMode,
                {
                    prefix: config.blueprintTemplate?.promptPrefix,
                    suffix: config.blueprintTemplate?.promptSuffix,
                    marginals,
                    syntheticN: config.syntheticN,
                },
            );

            // Track context counts
            if (assembled.contextQuestionCount > blueprintContextCount) {
                blueprintContextCount = assembled.contextQuestionCount;
                blueprintContextIds = assembled.contextQuestionIds;
            }

            // Build ideal response as JSON object
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
                promptText: assembled.text,
                points,
                idealResponse,
                temperature: config.modelConfig?.temperature,
            });
        }

        // Encode configId with full parameters
        const blueprintId = encodeConfigId({
            surveyId: config.surveyData.surveyId,
            segmentId: segment.id,
            contextQuestionCount: blueprintContextCount,
            contextFormat,
            evalType,
            reasoningMode,
            batchSize,
        });

        const ctxLabel = blueprintContextCount > 0 ? ` (${blueprintContextCount} context Qs)` : '';
        const evalLabel = evalType === 'shift' ? ' [shift]'
            : evalType === 'synthetic-individual' ? ' [synth]'
            : evalType === 'individual-answer' ? ' [indiv]'
            : '';
        const cotLabel = reasoningMode === 'cot' ? ' [CoT]' : '';
        const fmtLabel = contextFormat === 'narrative' ? ' [narrative]' : '';
        const blueprintTitle = `${config.surveyData.surveyName} - ${segment.label} (batch ${batchSize})${ctxLabel}${evalLabel}${cotLabel}${fmtLabel}`;

        // Build ground truth distributions
        const groundTruthDistributions: Record<string, number[]> = {};
        for (const pair of questionPairs) {
            groundTruthDistributions[pair.questionId] = pair.response.distribution;
        }

        // System prompt via generator with batched flag
        const systemPrompt = getSystemPrompt(evalType, reasoningMode, {
            customPrompt: config.blueprintTemplate?.systemPrompt,
            batched: true,
        });

        // Build tags (matching single-question path)
        const evalTag = evalType === 'shift' ? 'shift'
            : evalType === 'synthetic-individual' ? 'synthetic-individual'
            : evalType === 'individual-answer' ? 'individual-answer'
            : 'distribution';
        const tags = ['_periodic', 'dtef', 'demographic', 'batched', evalTag, config.surveyData.surveyId];
        if (reasoningMode === 'cot') tags.push('cot');
        if (contextFormat === 'narrative') tags.push('narrative');
        if (config.experimentId) tags.push(`experiment:${config.experimentId}`);

        return {
            configId: blueprintId,
            configTitle: blueprintTitle,
            description: `DTEF${evalLabel}: Batched predictions (${batchSize} Qs/prompt) for ${segment.label}. Source: ${config.surveyData.source || config.surveyData.surveyName}`,
            models: config.modelConfig?.models || ['CORE'],
            system: systemPrompt,
            temperature: config.modelConfig?.temperature || 0.3,
            prompts,
            tags,
            context: {
                dtef: {
                    surveyId: config.surveyData.surveyId,
                    segmentId: segment.id,
                    segmentLabel: segment.label,
                    segmentAttributes: segment.attributes,
                    groundTruthDistributions,
                    contextQuestionCount: blueprintContextCount,
                    contextQuestionIds: blueprintContextIds,
                    batchSize,
                    evalType,
                    contextFormat,
                    reasoningMode,
                    ...(config.experimentId ? { experimentId: config.experimentId } : {}),
                    ...(marginals ? { populationMarginals: marginals } : {}),
                },
            },
        };
    }

    /**
     * Generate a prompt for a specific question using the composition model.
     */
    private static generatePromptForQuestion(
        config: DTEFBlueprintConfig,
        segment: SegmentWithResponses,
        questionId: string,
        question: { text: string; type: string; options?: string[] },
        response: DemographicResponse,
        evalType: DTEFEvalType,
        contextFormat: DTEFContextFormat,
        reasoningMode: DTEFReasoningMode,
        marginals?: Record<string, number[]>,
    ): { prompt: WevalPromptConfig; contextQuestionCount: number; contextQuestionIds: string[] } {
        const options = question.options || [];

        // Get context block based on format
        let contextBlock: ContextResult | null = null;
        if (contextFormat === 'distribution-context') {
            contextBlock = buildDistributionContext(segment, config, questionId);
        } else if (contextFormat === 'narrative') {
            contextBlock = buildNarrativeContext(segment, config, marginals, questionId);
        } else {
            contextBlock = getContextBuilder(contextFormat, segment, config, questionId, marginals);
        }

        // Assemble the full prompt
        const assembled = assemblePrompt(
            contextBlock,
            segment,
            question,
            questionId,
            evalType,
            reasoningMode,
            {
                prefix: config.blueprintTemplate?.promptPrefix,
                suffix: config.blueprintTemplate?.promptSuffix,
                marginals,
                syntheticN: config.syntheticN,
            },
        );

        // Build the ideal response as the distribution string
        const idealDistribution = response.distribution
            .map(n => n.toFixed(1))
            .join(', ');
        const idealResponse = `[${idealDistribution}]`;

        // Build evaluation points
        const points = this.generateDistributionPoints(response.distribution, options, evalType);

        return {
            prompt: {
                id: `${questionId}-${segment.id}`,
                description: `Predict: ${segment.label} → "${question.text}"`,
                promptText: assembled.text,
                points,
                idealResponse,
                temperature: config.modelConfig?.temperature,
            },
            contextQuestionCount: assembled.contextQuestionCount,
            contextQuestionIds: assembled.contextQuestionIds,
        };
    }

    /**
     * Generate evaluation points for distribution comparison.
     */
    private static generateDistributionPoints(
        expectedDistribution: number[],
        _options: string[],
        evalType: DTEFEvalType = 'distribution',
    ): WevalPromptConfig['points'] {
        if (evalType === 'individual-answer') {
            return [{
                text: 'Individual Answer Accuracy',
                fn: 'individual_metric',
                fnArgs: {
                    expected: expectedDistribution,
                    mode: 'brier',
                },
            }];
        }

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
     * Generate DTEFGeneratedBlueprint objects (richer output for analysis).
     */
    static generateDetailedBlueprints(config: DTEFBlueprintConfig): DTEFGeneratedBlueprint[] {
        const segments = this.selectSegments(config);
        const evalType: DTEFEvalType = config.evalType || 'distribution';
        const reasoningMode: DTEFReasoningMode = config.reasoningMode || 'standard';
        const contextFormat: DTEFContextFormat = config.contextFormat
            || (config.contextQuestionIds && config.contextQuestionIds.length > 0
                ? 'distribution-context'
                : 'attribute-label');
        const blueprints: DTEFGeneratedBlueprint[] = [];

        let marginals: Record<string, number[]> | undefined;
        if (evalType === 'shift' || contextFormat === 'narrative') {
            marginals = config.populationMarginals || this.computePopulationMarginals(config.surveyData);
        }

        for (const segment of segments) {
            const prompts: DTEFPrompt[] = [];

            for (const questionId of config.targetQuestionIds) {
                const question = config.surveyData.questions[questionId];
                if (!question) continue;

                const response = segment.responses.find(r => r.questionId === questionId);
                if (!response) continue;

                const options = question.options || [];

                // Get context and assemble prompt
                let contextBlock: ContextResult | null = null;
                if (contextFormat === 'distribution-context') {
                    contextBlock = buildDistributionContext(segment, config, questionId);
                } else if (contextFormat === 'narrative') {
                    contextBlock = buildNarrativeContext(segment, config, marginals, questionId);
                }

                const assembled = assemblePrompt(
                    contextBlock,
                    segment,
                    question,
                    questionId,
                    evalType,
                    reasoningMode,
                    {
                        prefix: config.blueprintTemplate?.promptPrefix,
                        suffix: config.blueprintTemplate?.promptSuffix,
                        marginals,
                        syntheticN: config.syntheticN,
                    },
                );

                prompts.push({
                    id: `${questionId}-${segment.id}`,
                    promptText: assembled.text,
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
