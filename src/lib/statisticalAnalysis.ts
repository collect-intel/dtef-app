/**
 * Statistical Analysis Functions
 *
 * Pure, testable mathematical functions used by the DTEF statistical
 * validity analysis pipeline. All functions are segment-agnostic —
 * they operate on numeric arrays and don't know about demographic categories.
 *
 * These are designed to be scalable to thousands of configs:
 * - All functions operate on pre-extracted numeric data (not raw results)
 * - Bootstrap/permutation functions use configurable iteration counts
 * - Stratification is generic (works with any segment ID format)
 *
 * @module lib/statisticalAnalysis
 */

import { jsDivergenceSimilarity, normalize } from '../point-functions/distribution_metric';

// ── Vector Operations ─────────────────────────────────────────────────────

/**
 * Compute element-wise difference: a - b.
 */
export function computeShiftVector(a: number[], b: number[]): number[] {
    return a.map((v, i) => v - b[i]);
}

/**
 * L2 (Euclidean) norm of a vector.
 */
export function vectorMagnitude(v: number[]): number {
    return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

/**
 * Cosine similarity between two vectors.
 * Returns 0 if either vector has zero magnitude.
 */
export function vectorCosine(a: number[], b: number[]): number {
    const magA = vectorMagnitude(a);
    const magB = vectorMagnitude(b);
    if (magA === 0 || magB === 0) return 0;
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    return dot / (magA * magB);
}

// ── Gap Decomposition ─────────────────────────────────────────────────────

export interface GapDecomposition {
    /** Cosine similarity of shift vectors: 1 = right direction, -1 = opposite, 0 = orthogonal */
    directionalAccuracy: number;
    /** ||modelShift|| / ||truthShift||: >1 = overshoot, <1 = undershoot */
    magnitudeRatio: number;
    /** How much the ground truth segment differs from the population marginal */
    truthShiftMagnitude: number;
    /** How much the model tried to shift from the marginal */
    modelShiftMagnitude: number;
}

/**
 * Decompose a model's prediction error relative to the population marginal.
 *
 * For a given (model, segment, question):
 * - shiftModel = modelPrediction - populationMarginal
 * - shiftTruth = groundTruth - populationMarginal
 *
 * Returns directional accuracy (cosine of shifts) and magnitude ratio.
 * When truthShiftMagnitude is ~0 (segment ≈ marginal), direction is undefined → 0.
 */
export function decomposeGap(
    modelPrediction: number[],
    groundTruth: number[],
    populationMarginal: number[],
): GapDecomposition {
    const shiftModel = computeShiftVector(modelPrediction, populationMarginal);
    const shiftTruth = computeShiftVector(groundTruth, populationMarginal);

    const truthMag = vectorMagnitude(shiftTruth);
    const modelMag = vectorMagnitude(shiftModel);

    // When truth shift is negligible, direction is undefined
    const directionalAccuracy = truthMag < 1e-10 ? 0 : vectorCosine(shiftModel, shiftTruth);
    const magnitudeRatio = truthMag < 1e-10 ? (modelMag < 1e-10 ? 1 : Infinity) : modelMag / truthMag;

    return {
        directionalAccuracy,
        magnitudeRatio: isFinite(magnitudeRatio) ? magnitudeRatio : Infinity,
        truthShiftMagnitude: truthMag,
        modelShiftMagnitude: modelMag,
    };
}

// ── Multinomial Sampling ──────────────────────────────────────────────────

/**
 * Draw a single multinomial sample of size n from a probability distribution.
 * Returns counts per category (sums to n).
 *
 * Uses sequential sampling for efficiency with typical survey sizes.
 */
export function multinomialSample(probs: number[], n: number): number[] {
    const counts = new Array(probs.length).fill(0);
    for (let i = 0; i < n; i++) {
        let r = Math.random();
        let cumProb = 0;
        for (let j = 0; j < probs.length; j++) {
            cumProb += probs[j];
            if (r <= cumProb || j === probs.length - 1) {
                counts[j]++;
                break;
            }
        }
    }
    return counts;
}

// ── Bootstrap Confidence Intervals ────────────────────────────────────────

export interface ConfidenceInterval {
    mean: number;
    ci95Low: number;
    ci95High: number;
}

/**
 * Bootstrap CI on JSD similarity between a model prediction and ground truth.
 *
 * Resamples the ground truth distribution (treating it as multinomial with
 * parameters = observed proportions) and recomputes JSD similarity each time.
 *
 * @param groundTruth - observed distribution (percentages, sums to ~100)
 * @param prediction - model's predicted distribution (percentages)
 * @param sampleSize - number of survey respondents (n)
 * @param B - number of bootstrap iterations (default 1000)
 */
export function bootstrapScoreCI(
    groundTruth: number[],
    prediction: number[],
    sampleSize: number,
    B: number = 1000,
): ConfidenceInterval {
    const probs = normalize(groundTruth);
    const scores: number[] = [];

    for (let b = 0; b < B; b++) {
        const counts = multinomialSample(probs, sampleSize);
        // Convert counts to percentages for JSD computation
        const resampled = counts.map(c => (c / sampleSize) * 100);
        scores.push(jsDivergenceSimilarity(prediction, resampled));
    }

    scores.sort((a, b) => a - b);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
        mean,
        ci95Low: scores[Math.floor(scores.length * 0.025)] ?? mean,
        ci95High: scores[Math.floor(scores.length * 0.975)] ?? mean,
    };
}

/**
 * Bootstrap CI on the mean of a score array.
 * Resamples with replacement from the scores and computes the mean each time.
 */
export function bootstrapAggregateCI(
    scores: number[],
    B: number = 1000,
): ConfidenceInterval {
    if (scores.length === 0) return { mean: 0, ci95Low: 0, ci95High: 0 };
    if (scores.length === 1) return { mean: scores[0], ci95Low: scores[0], ci95High: scores[0] };

    const means: number[] = [];
    const n = scores.length;

    for (let b = 0; b < B; b++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += scores[Math.floor(Math.random() * n)];
        }
        means.push(sum / n);
    }

    means.sort((a, b) => a - b);
    const mean = scores.reduce((a, b) => a + b, 0) / n;

    return {
        mean,
        ci95Low: means[Math.floor(means.length * 0.025)] ?? mean,
        ci95High: means[Math.floor(means.length * 0.975)] ?? mean,
    };
}

// ── Sampling Noise Ceiling ─────────────────────────────────────────────────
//
// NOTE: This is a *data quality ceiling*, not a behavioral ceiling.
//
// The formula estimates the expected JSD similarity between a population's
// true distribution and a sample of size n drawn from it. It answers:
// "How good could ANY predictor be, given sampling noise in the ground truth?"
//
// This is DISTINCT from Park et al.'s self-consistency normalization, which
// uses human test-retest reliability (a behavioral ceiling measuring how
// consistently humans reproduce their own answers).
//
// Our ceiling: statistical (sampling noise in ground truth data)
// Park et al.: behavioral (human response consistency across sessions)
//
// Both are valid ceilings but measure different things. A normalized score
// of 1.0 here means "as good as statistically achievable given sample size",
// not "as good as a human retaking the survey."

/**
 * Compute the sampling noise ceiling for a (k, n) pair.
 * Returns the expected JSD similarity between the true distribution and
 * one drawn from it with n samples and k categories.
 *
 * Formula: 1 - sqrt((k-1) / (2n × ln2))
 *
 * Previously called "noise floor" — renamed to "sampling noise ceiling" for
 * clarity. This is the maximum achievable score given ground truth data quality.
 */
export function computeNoiseFloorValue(k: number, n: number): number {
    if (n <= 0 || k <= 1) return 0;
    return 1 - Math.sqrt((k - 1) / (2 * n * Math.LN2));
}

/**
 * Compute a normalized score that maps raw JSD similarity into the
 * meaningful range between the uniform baseline and sampling noise ceiling.
 *
 * normalizedScore = (rawScore - uniformBaseline) / (noiseCeiling - uniformBaseline)
 *
 * Interpretation:
 * - 0.0 = performing at uniform baseline (random guessing)
 * - 1.0 = performing at the sampling noise ceiling (best achievable given data quality)
 * - >1.0 = overfitting or measurement artifact
 * - <0.0 = worse than random
 *
 * @param rawScore - JSD similarity score (0-1)
 * @param uniformBaseline - uniform baseline score for this question (JSD similarity of equal distribution)
 * @param noiseCeiling - sampling noise ceiling for this (k, n) pair
 */
export function computeNormalizedScore(
    rawScore: number,
    uniformBaseline: number,
    noiseCeiling: number,
): number {
    const range = noiseCeiling - uniformBaseline;
    if (range <= 0) return 0;
    return (rawScore - uniformBaseline) / range;
}

// ── Weighted Aggregation ──────────────────────────────────────────────────

/**
 * Compute weighted mean of values with corresponding weights.
 * Returns 0 if all weights are zero.
 */
export function computeWeightedMean(values: number[], weights: number[]): number {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < values.length; i++) {
        weightedSum += values[i] * weights[i];
        totalWeight += weights[i];
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ── Stratification ────────────────────────────────────────────────────────

/**
 * Group items by segment prefix (the part before the first colon).
 * Segment-agnostic: works with any ID format using colon-separated prefixes.
 *
 * @param items - array of items to group
 * @param getSegmentId - function to extract segment ID from an item
 */
export function stratifyByPrefix<T>(
    items: T[],
    getSegmentId: (item: T) => string,
): Map<string, T[]> {
    const result = new Map<string, T[]>();
    for (const item of items) {
        const segId = getSegmentId(item);
        const colonIdx = segId.indexOf(':');
        const prefix = colonIdx >= 0 ? segId.substring(0, colonIdx) : segId;
        if (!result.has(prefix)) result.set(prefix, []);
        result.get(prefix)!.push(item);
    }
    return result;
}

// ── Aggregated Decomposition ──────────────────────────────────────────────

export interface AggregatedDecomposition {
    /** Average directional accuracy across all (segment, question) pairs */
    avgDirectionalAccuracy: number;
    /** Average magnitude ratio */
    avgMagnitudeRatio: number;
    /** Fraction of pairs where model shifted in the right direction (cosine > 0) */
    fractionCorrectDirection: number;
    /** Average overshoot for pairs where model overshot (ratio > 1) */
    avgOvershoot: number;
    /** Average undershoot for pairs where model undershot (ratio < 1) */
    avgUndershoot: number;
    /** Number of pairs analyzed (excludes pairs where segment ≈ marginal) */
    pairCount: number;
    /** Number of pairs skipped (segment ≈ marginal, truth shift magnitude < threshold) */
    skippedCount: number;
}

/**
 * Aggregate gap decompositions across multiple (segment, question) pairs.
 * Filters out pairs where the segment is approximately equal to the marginal
 * (truth shift magnitude below threshold), since direction is undefined there.
 */
export function aggregateDecompositions(
    decompositions: GapDecomposition[],
    minShiftMagnitude: number = 1.0,
): AggregatedDecomposition {
    const valid = decompositions.filter(d => d.truthShiftMagnitude >= minShiftMagnitude);
    const skipped = decompositions.length - valid.length;

    if (valid.length === 0) {
        return {
            avgDirectionalAccuracy: 0,
            avgMagnitudeRatio: 0,
            fractionCorrectDirection: 0,
            avgOvershoot: 0,
            avgUndershoot: 0,
            pairCount: 0,
            skippedCount: skipped,
        };
    }

    const sumDir = valid.reduce((a, d) => a + d.directionalAccuracy, 0);
    const correctDir = valid.filter(d => d.directionalAccuracy > 0).length;

    const finiteMagnitudes = valid.filter(d => isFinite(d.magnitudeRatio));
    const sumMag = finiteMagnitudes.reduce((a, d) => a + d.magnitudeRatio, 0);

    const overshoots = finiteMagnitudes.filter(d => d.magnitudeRatio > 1);
    const undershoots = finiteMagnitudes.filter(d => d.magnitudeRatio <= 1);

    return {
        avgDirectionalAccuracy: sumDir / valid.length,
        avgMagnitudeRatio: finiteMagnitudes.length > 0 ? sumMag / finiteMagnitudes.length : 0,
        fractionCorrectDirection: correctDir / valid.length,
        avgOvershoot: overshoots.length > 0
            ? overshoots.reduce((a, d) => a + d.magnitudeRatio, 0) / overshoots.length
            : 0,
        avgUndershoot: undershoots.length > 0
            ? undershoots.reduce((a, d) => a + d.magnitudeRatio, 0) / undershoots.length
            : 0,
        pairCount: valid.length,
        skippedCount: skipped,
    };
}
