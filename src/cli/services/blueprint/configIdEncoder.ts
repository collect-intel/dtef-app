/**
 * ConfigId Encoder for DTEF Blueprints
 *
 * Encodes blueprint parameters into a deterministic configId string.
 * Backward-compatible: default parameters produce the same configId as legacy code.
 *
 * Format: dtef-{surveyId}-{segmentId}[-c{N}][-narrative|-rawsurvey|-interview|-firstperson][-shift|-synth|-indiv][-cot][-b{N}]
 *
 * @module cli/services/blueprint/configIdEncoder
 */

import { DTEFEvalType, DTEFContextFormat, DTEFReasoningMode } from '@/types/dtef';

export interface ConfigIdParts {
    surveyId: string;
    segmentId: string;
    contextQuestionCount?: number;
    contextFormat?: DTEFContextFormat;
    evalType?: DTEFEvalType;
    reasoningMode?: DTEFReasoningMode;
    batchSize?: number;
    /** For synthetic-individual: N value (only included in configId when non-default, i.e. != 20) */
    syntheticN?: number;
}

/**
 * Encode config parameters into a configId string.
 *
 * Backward-compatible encoding rules:
 * - Base: `dtef-{surveyId}-{segmentId}`
 * - Context: `-c{N}` for distribution-context with N>0, `-narrative` for narrative,
 *   `-rawsurvey`/`-interview`/`-firstperson` for individual formats.
 *   No suffix for attribute-label (default).
 * - Eval: `-shift` (existing), `-synth` for synthetic-individual, `-indiv` for individual-answer.
 *   No suffix for distribution (default).
 * - Reasoning: `-cot` for cot. No suffix for standard (default).
 * - Batch: `-b{N}` always last.
 */
export function encodeConfigId(parts: ConfigIdParts): string {
    let id = `dtef-${parts.surveyId}-${parts.segmentId}`;

    // Context format suffix
    const contextFormat = parts.contextFormat || 'distribution-context';
    const contextCount = parts.contextQuestionCount ?? 0;

    if (contextFormat === 'distribution-context' || contextFormat === 'attribute-label') {
        // Legacy behavior: -c{N} for N>0, no suffix for 0
        if (contextCount > 0) {
            id += `-c${contextCount}`;
        }
    } else if (contextFormat === 'narrative') {
        id += '-narrative';
    } else if (contextFormat === 'raw-survey') {
        id += '-rawsurvey';
    } else if (contextFormat === 'interview') {
        id += '-interview';
    } else if (contextFormat === 'first-person') {
        id += '-firstperson';
    }

    // Eval type suffix
    const evalType = parts.evalType || 'distribution';
    if (evalType === 'shift') {
        id += '-shift';
    } else if (evalType === 'synthetic-individual') {
        id += '-synth';
        // Include N in configId when non-default (default is 20)
        if (parts.syntheticN && parts.syntheticN !== 20) {
            id += `${parts.syntheticN}`;
        }
    } else if (evalType === 'individual-answer') {
        id += '-indiv';
    }

    // Reasoning mode suffix
    const reasoningMode = parts.reasoningMode || 'standard';
    if (reasoningMode === 'cot') {
        id += '-cot';
    }

    // Batch suffix (always last)
    if (parts.batchSize && parts.batchSize > 1) {
        id += `-b${parts.batchSize}`;
    }

    return id;
}
