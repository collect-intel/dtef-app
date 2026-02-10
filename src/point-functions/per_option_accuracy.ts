/**
 * Per-Option Accuracy Point Function
 *
 * Computes accuracy for a single option in a predicted distribution against
 * the expected distribution. Each option gets its own point function call,
 * preserving per-option visibility in the UI.
 *
 * Usage in blueprints:
 *   fn: per_option_accuracy
 *   fnArgs:
 *     expected: [45.2, 30.1, 15.5, 9.2]
 *     options: ["Strongly Agree", "Agree", "Disagree", "Strongly Disagree"]
 *     optionIndex: 0
 */

import { PointFunction, PointFunctionReturn } from './types';
import { parseDistribution } from './distribution_metric';

interface PerOptionAccuracyArgs {
    /** Expected distribution percentages (sums to ~100) */
    expected: number[];
    /** Option labels for display */
    options: string[];
    /** Index of the specific option to score */
    optionIndex: number;
    /** Absolute percentage-point tolerance (default: dynamically computed) */
    tolerance?: number;
}

export const per_option_accuracy: PointFunction = (
    llmResponseText: string,
    args: any,
): PointFunctionReturn => {
    if (!args || typeof args !== 'object') {
        return { error: "Invalid arguments for 'per_option_accuracy'. Expected an object with 'expected' array, 'options' array, and 'optionIndex'." };
    }

    const typedArgs = args as PerOptionAccuracyArgs;

    if (!Array.isArray(typedArgs.expected) || typedArgs.expected.length === 0) {
        return { error: "Invalid 'expected' distribution. Must be a non-empty array of numbers." };
    }

    if (typedArgs.optionIndex === undefined || typedArgs.optionIndex < 0 || typedArgs.optionIndex >= typedArgs.expected.length) {
        return { error: `Invalid 'optionIndex': ${typedArgs.optionIndex}. Must be 0-${typedArgs.expected.length - 1}.` };
    }

    const { expected, options, optionIndex } = typedArgs;
    const optionLabel = options?.[optionIndex] || `Option ${optionIndex + 1}`;
    const expectedValue = expected[optionIndex];

    // Parse the predicted distribution from the LLM response
    const predicted = parseDistribution(llmResponseText);

    if (!predicted) {
        return {
            score: 0,
            explain: `Could not parse a distribution from the response. Expected format: [n1, n2, n3, ...]`,
        };
    }

    if (predicted.length !== expected.length) {
        return {
            score: 0,
            explain: `Distribution length mismatch: expected ${expected.length} values, got ${predicted.length}`,
        };
    }

    const predictedValue = predicted[optionIndex];
    const error = Math.abs(predictedValue - expectedValue);

    // Tolerance: 30% relative or 5pp absolute, whichever is larger
    const tolerance = typedArgs.tolerance ?? Math.max(5, expectedValue * 0.3);

    // Linear degradation from 1.0 (perfect) to 0.0 (at or beyond tolerance)
    const score = Math.max(0, 1 - error / tolerance);

    return {
        score,
        explain: `Option "${optionLabel}": predicted ${predictedValue.toFixed(1)}% vs expected ${expectedValue.toFixed(1)}% (error: ${error.toFixed(1)}pp, tolerance: ${tolerance.toFixed(1)}pp) → score: ${score.toFixed(3)}`,
    };
};
