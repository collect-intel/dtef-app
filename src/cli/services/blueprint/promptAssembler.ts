/**
 * Prompt Assembler for DTEF Blueprints
 *
 * Combines context blocks, target questions, and instruction suffixes
 * into final prompt text. Handles layout differences between eval types.
 *
 * @module cli/services/blueprint/promptAssembler
 */

import {
    DTEFBlueprintConfig,
    DTEFEvalType,
    DTEFReasoningMode,
    SegmentWithResponses,
} from '@/types/dtef';
import { buildDemographicsHeader, formatAttributeKey } from './contextGenerators';

export interface AssembledPrompt {
    text: string;
    contextQuestionCount: number;
    contextQuestionIds: string[];
}

/**
 * Assemble a complete prompt from components.
 */
export function assemblePrompt(
    contextBlock: { text: string; contextQuestionCount: number; contextQuestionIds: string[] } | null,
    segment: SegmentWithResponses,
    question: { text: string; type: string; options?: string[] },
    targetQuestionId: string | undefined,
    evalType: DTEFEvalType = 'distribution',
    _reasoningMode: DTEFReasoningMode = 'standard',
    options?: {
        prefix?: string;
        suffix?: string;
        marginals?: Record<string, number[]>;
        syntheticN?: number;
    },
): AssembledPrompt {
    const prefix = options?.prefix || '';
    const suffix = options?.suffix || '';
    const questionOptions = question.options || [];

    let corePrompt = '';

    if (prefix) {
        corePrompt += `${prefix}\n\n`;
    }

    // For shift eval type, show population marginal first, then demographics
    if (evalType === 'shift' && options?.marginals && targetQuestionId && options.marginals[targetQuestionId]) {
        const marginal = options.marginals[targetQuestionId];
        corePrompt += `The overall population responded to the following survey question as follows:\n\n`;
        corePrompt += `"${question.text}"\n\n`;

        if (questionOptions.length > 0) {
            corePrompt += `Response distribution:\n`;
            questionOptions.forEach((opt, idx) => {
                const letter = String.fromCharCode(97 + idx);
                const pct = marginal[idx]?.toFixed(1) ?? '?';
                corePrompt += `  ${letter}. ${opt}: ${pct}%\n`;
            });
            corePrompt += '\n';
        } else {
            corePrompt += `Distribution: [${marginal.map(n => n.toFixed(1)).join(', ')}]\n\n`;
        }

        corePrompt += `How would you adjust this distribution for the following demographic group?\n`;
        corePrompt += `(sample size: ${segment.sampleSize})\n`;
        const attributeLines = Object.entries(segment.attributes)
            .map(([key, value]) => `- ${formatAttributeKey(key)}: ${value}`)
            .join('\n');
        corePrompt += `${attributeLines}\n\n`;
    } else {
        corePrompt += buildDemographicsHeader(segment) + '\n\n';
    }

    // Add context block
    if (contextBlock && contextBlock.text) {
        corePrompt += contextBlock.text;
    }

    // Add target question (shift type already included it above)
    if (evalType !== 'shift') {
        if (evalType === 'synthetic-individual') {
            const n = options?.syntheticN || 20;
            corePrompt += `Survey question:\n"${question.text}"\n\n`;
            if (questionOptions.length > 0) {
                corePrompt += `Answer options:\n`;
                questionOptions.forEach((opt, idx) => {
                    const letter = String.fromCharCode(97 + idx);
                    corePrompt += `  ${letter}. ${opt}\n`;
                });
                corePrompt += '\n';
            }
            corePrompt += `Simulate ${n} individual members of this demographic group answering this question.`;
        } else if (evalType === 'individual-answer') {
            corePrompt += `Survey question:\n"${question.text}"\n\n`;
            if (questionOptions.length > 0) {
                corePrompt += `Answer options:\n`;
                questionOptions.forEach((opt, idx) => {
                    const letter = String.fromCharCode(97 + idx);
                    corePrompt += `  ${letter}. ${opt}\n`;
                });
                corePrompt += '\n';
            }
            corePrompt += `Predict the most likely answer for a member of this demographic group.`;
        } else {
            corePrompt += `Survey question:\n"${question.text}"\n\n`;
            if (questionOptions.length > 0) {
                corePrompt += `Answer options:\n`;
                questionOptions.forEach((opt, idx) => {
                    const letter = String.fromCharCode(97 + idx);
                    corePrompt += `  ${letter}. ${opt}\n`;
                });
                corePrompt += '\n';
            }
            corePrompt += `Predict the percentage distribution of responses for this demographic group across the answer options.`;
        }
    } else {
        corePrompt += `Predict the adjusted percentage distribution for this demographic group.`;
    }

    if (suffix) {
        corePrompt += `\n\n${suffix}`;
    }

    return {
        text: corePrompt,
        contextQuestionCount: contextBlock?.contextQuestionCount ?? 0,
        contextQuestionIds: contextBlock?.contextQuestionIds ?? [],
    };
}
