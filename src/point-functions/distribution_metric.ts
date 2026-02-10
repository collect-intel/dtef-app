/**
 * Distribution Metric Point Function
 *
 * Compares a model's predicted response distribution against an expected
 * demographic distribution. Used by DTEF blueprints to evaluate how well
 * AI models predict survey response patterns across demographic groups.
 *
 * Usage in blueprints:
 *   fn: distribution_metric
 *   fnArgs:
 *     expected: [45.2, 30.1, 15.5, 9.2]
 *     metric: js-divergence  # or cosine, earth-mover
 *     threshold: 0.85
 */

import { PointFunction, PointFunctionReturn } from './types';

interface DistributionMetricArgs {
    /** Expected distribution percentages (must sum to ~100) */
    expected: number[];
    /** Comparison metric to use */
    metric?: 'js-divergence' | 'cosine' | 'earth-mover';
    /** Score threshold for pass/fail (0-1, default 0.7) */
    threshold?: number;
}

/**
 * Parse a distribution array from LLM response text.
 * Handles formats like:
 *   [45.2, 30.1, 15.5, 9.2]
 *   45.2, 30.1, 15.5, 9.2
 *   45.2%, 30.1%, 15.5%, 9.2%
 */
export function parseDistribution(text: string): number[] | null {
    // Try JSON array format first: [45.2, 30.1, 15.5, 9.2]
    const bracketMatch = text.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
        const numbers = bracketMatch[1]
            .split(',')
            .map(s => parseFloat(s.trim().replace('%', '')))
            .filter(n => !isNaN(n));
        if (numbers.length > 0) return numbers;
    }

    // Try comma-separated numbers anywhere in the text
    const lines = text.split('\n');
    for (const line of lines) {
        // Look for lines with multiple numbers separated by commas
        const numberPattern = /(\d+\.?\d*)\s*%?\s*[,;]\s*/g;
        const numbers: number[] = [];
        let match;
        while ((match = numberPattern.exec(line)) !== null) {
            numbers.push(parseFloat(match[1]));
        }
        // Check for the last number (no trailing comma)
        const lastNum = line.match(/[,;]\s*(\d+\.?\d*)\s*%?\s*$/);
        if (lastNum) {
            numbers.push(parseFloat(lastNum[1]));
        }
        if (numbers.length >= 2) return numbers;
    }

    // Try labeled format: "a. Option: 45.2%"
    const labeledNumbers: number[] = [];
    const labeledPattern = /[a-z]\.\s*[^:]+:\s*(\d+\.?\d*)\s*%?/gi;
    let labeledMatch;
    while ((labeledMatch = labeledPattern.exec(text)) !== null) {
        labeledNumbers.push(parseFloat(labeledMatch[1]));
    }
    if (labeledNumbers.length >= 2) return labeledNumbers;

    return null;
}

/**
 * Normalize a distribution to sum to 1.0 (probability distribution).
 */
export function normalize(dist: number[]): number[] {
    const sum = dist.reduce((a, b) => a + b, 0);
    if (sum === 0) return dist.map(() => 1 / dist.length);
    return dist.map(v => v / sum);
}

/**
 * Jensen-Shannon divergence (symmetric version of KL divergence).
 * Returns a value in [0, 1] where 0 = identical distributions.
 * We convert to a similarity score: 1 - JSD.
 */
function jsDivergenceSimilarity(p: number[], q: number[]): number {
    const pNorm = normalize(p);
    const qNorm = normalize(q);

    // Compute midpoint M = (P + Q) / 2
    const m = pNorm.map((pi, i) => (pi + qNorm[i]) / 2);

    // KL(P || M) and KL(Q || M)
    let klPM = 0;
    let klQM = 0;
    const epsilon = 1e-10;

    for (let i = 0; i < pNorm.length; i++) {
        const pi = Math.max(pNorm[i], epsilon);
        const qi = Math.max(qNorm[i], epsilon);
        const mi = Math.max(m[i], epsilon);

        klPM += pi * Math.log2(pi / mi);
        klQM += qi * Math.log2(qi / mi);
    }

    const jsd = (klPM + klQM) / 2;
    // JSD is bounded [0, 1] when using log2
    return Math.max(0, 1 - jsd);
}

/**
 * Cosine similarity between two distributions.
 * Returns a value in [0, 1].
 */
function cosineSimilarity(p: number[], q: number[]): number {
    let dotProduct = 0;
    let normP = 0;
    let normQ = 0;

    for (let i = 0; i < p.length; i++) {
        dotProduct += p[i] * q[i];
        normP += p[i] * p[i];
        normQ += q[i] * q[i];
    }

    const denom = Math.sqrt(normP) * Math.sqrt(normQ);
    if (denom === 0) return 0;

    return dotProduct / denom;
}

/**
 * Earth Mover's Distance (1D Wasserstein) similarity.
 * Measures the minimum "work" to transform one distribution into another.
 * Returns a similarity score in [0, 1].
 */
function earthMoverSimilarity(p: number[], q: number[]): number {
    const pNorm = normalize(p);
    const qNorm = normalize(q);

    let totalWork = 0;
    let cumDiff = 0;

    for (let i = 0; i < pNorm.length; i++) {
        cumDiff += pNorm[i] - qNorm[i];
        totalWork += Math.abs(cumDiff);
    }

    // Maximum possible EMD for n bins is 1.0 (when using normalized distributions)
    // Convert to similarity
    return Math.max(0, 1 - totalWork);
}

export const distribution_metric: PointFunction = (
    llmResponseText: string,
    args: any,
): PointFunctionReturn => {
    // Validate args
    if (!args || typeof args !== 'object') {
        return { error: "Invalid arguments for 'distribution_metric'. Expected an object with 'expected' array." };
    }

    const typedArgs = args as DistributionMetricArgs;

    if (!Array.isArray(typedArgs.expected) || typedArgs.expected.length === 0) {
        return { error: "Invalid 'expected' distribution. Must be a non-empty array of numbers." };
    }

    const expected = typedArgs.expected;
    const metric = typedArgs.metric || 'js-divergence';
    const threshold = typedArgs.threshold ?? 0.7;

    // Parse the predicted distribution from the LLM response
    const predicted = parseDistribution(llmResponseText);

    if (!predicted) {
        return {
            score: 0,
            explain: `Could not parse a distribution from the response. Expected format: [n1, n2, n3, ...]`,
        };
    }

    // Handle length mismatch
    if (predicted.length !== expected.length) {
        return {
            score: 0.1, // Small partial credit for attempting
            explain: `Distribution length mismatch: expected ${expected.length} values, got ${predicted.length}`,
        };
    }

    // Compute similarity score
    let score: number;
    let metricName: string;

    switch (metric) {
        case 'cosine':
            score = cosineSimilarity(predicted, expected);
            metricName = 'Cosine Similarity';
            break;
        case 'earth-mover':
            score = earthMoverSimilarity(predicted, expected);
            metricName = 'Earth Mover Similarity';
            break;
        case 'js-divergence':
        default:
            score = jsDivergenceSimilarity(predicted, expected);
            metricName = 'JS Divergence Similarity';
            break;
    }

    const expectedStr = expected.map(n => n.toFixed(1)).join(', ');
    const predictedStr = predicted.map(n => n.toFixed(1)).join(', ');

    return {
        score,
        explain: `${metricName}: ${score.toFixed(3)} (threshold: ${threshold}). Expected: [${expectedStr}], Predicted: [${predictedStr}]`,
    };
};
