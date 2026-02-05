/**
 * DTEF Data Validation Service
 *
 * Validates DTEFSurveyData structures to ensure data integrity
 * before blueprint generation.
 */

import {
    DTEFSurveyData,
    SegmentWithResponses,
    DemographicResponse,
    isValidDistribution,
} from '@/types/dtef';

export interface ValidationError {
    path: string;
    message: string;
    severity: 'error' | 'warning';
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    summary: {
        questionCount: number;
        segmentCount: number;
        totalResponses: number;
    };
}

/**
 * Validate a DTEFSurveyData object for completeness and correctness.
 */
export function validateDTEFSurveyData(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
        errors.push({ path: '', message: 'Data must be a non-null object', severity: 'error' });
        return { valid: false, errors, warnings, summary: { questionCount: 0, segmentCount: 0, totalResponses: 0 } };
    }

    const d = data as Record<string, unknown>;

    // Required fields
    if (!d.surveyId || typeof d.surveyId !== 'string') {
        errors.push({ path: 'surveyId', message: 'surveyId is required and must be a string', severity: 'error' });
    }

    if (!d.surveyName || typeof d.surveyName !== 'string') {
        errors.push({ path: 'surveyName', message: 'surveyName is required and must be a string', severity: 'error' });
    }

    // Validate questions
    let questionCount = 0;
    const questionIds = new Set<string>();

    if (!d.questions || typeof d.questions !== 'object') {
        errors.push({ path: 'questions', message: 'questions is required and must be an object', severity: 'error' });
    } else {
        const questions = d.questions as Record<string, unknown>;
        for (const [qId, q] of Object.entries(questions)) {
            questionIds.add(qId);
            questionCount++;

            if (!q || typeof q !== 'object') {
                errors.push({ path: `questions.${qId}`, message: 'Question must be an object', severity: 'error' });
                continue;
            }

            const question = q as Record<string, unknown>;

            if (!question.text || typeof question.text !== 'string') {
                errors.push({ path: `questions.${qId}.text`, message: 'Question text is required', severity: 'error' });
            }

            if (!question.type || typeof question.type !== 'string') {
                errors.push({ path: `questions.${qId}.type`, message: 'Question type is required', severity: 'error' });
            }

            if (question.type === 'single-select' || question.type === 'multi-select') {
                if (!Array.isArray(question.options) || question.options.length < 2) {
                    errors.push({
                        path: `questions.${qId}.options`,
                        message: 'Select-type questions must have at least 2 options',
                        severity: 'error',
                    });
                }
            }
        }
    }

    // Validate segments
    let segmentCount = 0;
    let totalResponses = 0;

    if (!Array.isArray(d.segments)) {
        errors.push({ path: 'segments', message: 'segments is required and must be an array', severity: 'error' });
    } else {
        const segments = d.segments as unknown[];
        const segmentIds = new Set<string>();

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            segmentCount++;

            if (!seg || typeof seg !== 'object') {
                errors.push({ path: `segments[${i}]`, message: 'Segment must be an object', severity: 'error' });
                continue;
            }

            const segment = seg as Record<string, unknown>;

            if (!segment.id || typeof segment.id !== 'string') {
                errors.push({ path: `segments[${i}].id`, message: 'Segment id is required', severity: 'error' });
            } else if (segmentIds.has(segment.id as string)) {
                errors.push({ path: `segments[${i}].id`, message: `Duplicate segment id: ${segment.id}`, severity: 'error' });
            } else {
                segmentIds.add(segment.id as string);
            }

            if (!segment.label || typeof segment.label !== 'string') {
                warnings.push({ path: `segments[${i}].label`, message: 'Segment label is recommended', severity: 'warning' });
            }

            if (typeof segment.sampleSize !== 'number' || segment.sampleSize <= 0) {
                warnings.push({ path: `segments[${i}].sampleSize`, message: 'sampleSize should be a positive number', severity: 'warning' });
            } else if (segment.sampleSize < 30) {
                warnings.push({
                    path: `segments[${i}].sampleSize`,
                    message: `Small sample size (${segment.sampleSize}). Results may not be statistically significant.`,
                    severity: 'warning',
                });
            }

            // Validate responses
            if (!Array.isArray(segment.responses)) {
                errors.push({ path: `segments[${i}].responses`, message: 'Segment responses must be an array', severity: 'error' });
                continue;
            }

            const responses = segment.responses as unknown[];
            for (let j = 0; j < responses.length; j++) {
                const resp = responses[j] as Record<string, unknown>;
                totalResponses++;

                if (!resp.questionId || typeof resp.questionId !== 'string') {
                    errors.push({
                        path: `segments[${i}].responses[${j}].questionId`,
                        message: 'Response questionId is required',
                        severity: 'error',
                    });
                    continue;
                }

                if (!questionIds.has(resp.questionId as string)) {
                    errors.push({
                        path: `segments[${i}].responses[${j}].questionId`,
                        message: `Response references unknown question: ${resp.questionId}`,
                        severity: 'error',
                    });
                }

                if (!Array.isArray(resp.distribution)) {
                    errors.push({
                        path: `segments[${i}].responses[${j}].distribution`,
                        message: 'Response distribution must be an array',
                        severity: 'error',
                    });
                } else if (!isValidDistribution(resp.distribution)) {
                    const sum = (resp.distribution as number[]).reduce((a: number, b: number) => a + b, 0);
                    errors.push({
                        path: `segments[${i}].responses[${j}].distribution`,
                        message: `Invalid distribution (sum=${sum.toFixed(1)}, expected ~100)`,
                        severity: 'error',
                    });
                } else {
                    // Check that distribution length matches question options
                    const qId = resp.questionId as string;
                    const questions = d.questions as Record<string, Record<string, unknown>>;
                    const q = questions?.[qId];
                    if (q && Array.isArray(q.options)) {
                        const dist = resp.distribution as number[];
                        if (dist.length !== q.options.length) {
                            errors.push({
                                path: `segments[${i}].responses[${j}].distribution`,
                                message: `Distribution has ${dist.length} values but question "${qId}" has ${q.options.length} options`,
                                severity: 'error',
                            });
                        }
                    }
                }
            }

            // Check for missing question responses
            for (const qId of questionIds) {
                const hasResponse = responses.some((r: any) => r.questionId === qId);
                if (!hasResponse) {
                    warnings.push({
                        path: `segments[${i}].responses`,
                        message: `Segment "${segment.id}" has no response for question "${qId}"`,
                        severity: 'warning',
                    });
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: { questionCount, segmentCount, totalResponses },
    };
}
