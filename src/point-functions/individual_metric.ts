/**
 * Individual Answer Metric Point Function
 *
 * Evaluates individual-answer predictions against expected distributions.
 * Supports three scoring modes:
 * - binary: 1.0 if predicted answer matches the mode, 0.0 otherwise
 * - brier: 1 - Σ(predicted_i - actual_i)² (Brier skill score)
 * - confidence: probability assigned to the correct (mode) answer
 *
 * Parses ANSWER: and PROBABILITIES: CoT markers from model responses.
 */

import { PointFunction, PointFunctionReturn } from './types';
import { normalize } from './distribution_metric';

interface IndividualMetricArgs {
    /** Expected distribution percentages (ground truth) */
    expected: number[];
    /** Scoring mode */
    mode?: 'binary' | 'brier' | 'confidence';
}

/**
 * Parse an answer letter from response text.
 * Handles "ANSWER: a" CoT marker and standalone letter responses.
 */
function parseAnswer(text: string): string | null {
    // Try ANSWER: marker
    const markerMatch = text.match(/ANSWER:\s*([a-zA-Z])/i);
    if (markerMatch) return markerMatch[1].toLowerCase();

    // Try standalone letter on a line
    const lines = text.trim().split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^[a-zA-Z]\.?\s*$/.test(trimmed)) {
            return trimmed[0].toLowerCase();
        }
    }

    return null;
}

/**
 * Parse a probability array from response text.
 * Handles "PROBABILITIES: [0.4, 0.3, 0.2, 0.1]" CoT marker.
 */
function parseProbabilities(text: string): number[] | null {
    // Try PROBABILITIES: marker
    const markerMatch = text.match(/PROBABILITIES:\s*\[([^\]]+)\]/i);
    if (markerMatch) {
        const numbers = markerMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
        if (numbers.length > 0) return numbers;
    }

    return null;
}

export const individual_metric: PointFunction = (
    llmResponseText: string,
    args: any,
): PointFunctionReturn => {
    if (!args || typeof args !== 'object') {
        return { error: "Invalid arguments for 'individual_metric'. Expected an object with 'expected' array." };
    }

    const typedArgs = args as IndividualMetricArgs;

    if (!Array.isArray(typedArgs.expected) || typedArgs.expected.length === 0) {
        return { error: "Invalid 'expected' distribution." };
    }

    const expected = typedArgs.expected;
    const mode = typedArgs.mode || 'brier';
    const normalizedExpected = normalize(expected);

    // Find the mode (most likely answer) index
    const modeIdx = expected.indexOf(Math.max(...expected));

    const answer = parseAnswer(llmResponseText);
    const probabilities = parseProbabilities(llmResponseText);

    switch (mode) {
        case 'binary': {
            if (!answer) {
                return { score: 0, explain: 'Could not parse answer letter from response.' };
            }
            const answerIdx = answer.charCodeAt(0) - 97;
            const correct = answerIdx === modeIdx;
            return {
                score: correct ? 1.0 : 0.0,
                explain: `Binary: predicted "${answer}" (index ${answerIdx}), mode is index ${modeIdx}. ${correct ? 'Correct' : 'Incorrect'}.`,
            };
        }

        case 'brier': {
            if (!probabilities) {
                return { score: 0, explain: 'Could not parse probability array from response.' };
            }
            if (probabilities.length !== expected.length) {
                return { score: 0.1, explain: `Probability length mismatch: expected ${expected.length}, got ${probabilities.length}` };
            }
            const normalizedProbs = normalize(probabilities);
            let brierSum = 0;
            for (let i = 0; i < normalizedExpected.length; i++) {
                brierSum += Math.pow(normalizedProbs[i] - normalizedExpected[i], 2);
            }
            const brierScore = Math.max(0, 1 - brierSum);
            return {
                score: brierScore,
                explain: `Brier skill score: ${brierScore.toFixed(3)}. Predicted: [${normalizedProbs.map(n => n.toFixed(3)).join(', ')}], Expected: [${normalizedExpected.map(n => n.toFixed(3)).join(', ')}]`,
            };
        }

        case 'confidence': {
            if (!probabilities) {
                return { score: 0, explain: 'Could not parse probability array from response.' };
            }
            if (modeIdx >= probabilities.length) {
                return { score: 0, explain: `Mode index ${modeIdx} out of range for probabilities array (length ${probabilities.length})` };
            }
            const normalizedProbs = normalize(probabilities);
            const confidence = normalizedProbs[modeIdx];
            return {
                score: confidence,
                explain: `Confidence in mode answer (index ${modeIdx}): ${confidence.toFixed(3)}`,
            };
        }

        default:
            return { error: `Unknown mode: ${mode}` };
    }
};
