/**
 * Tests for statistical analysis functions.
 *
 * These test the pure mathematical functions used by the statistical
 * validity analysis pipeline. All functions are segment-agnostic —
 * they operate on numeric arrays and don't know about demographic categories.
 */

import {
    computeShiftVector,
    vectorCosine,
    vectorMagnitude,
    decomposeGap,
    multinomialSample,
    bootstrapScoreCI,
    bootstrapAggregateCI,
    computeNoiseFloorValue,
    computeWeightedMean,
    stratifyByPrefix,
} from '../statisticalAnalysis';
import { jsDivergenceSimilarity } from '../../point-functions/distribution_metric';

// ── Shift Vector Functions ────────────────────────────────────────────────

describe('computeShiftVector', () => {
    it('computes element-wise difference', () => {
        expect(computeShiftVector([50, 30, 20], [40, 30, 30])).toEqual([10, 0, -10]);
    });

    it('returns zero vector for identical inputs', () => {
        expect(computeShiftVector([25, 25, 25, 25], [25, 25, 25, 25])).toEqual([0, 0, 0, 0]);
    });
});

describe('vectorMagnitude', () => {
    it('computes L2 norm', () => {
        expect(vectorMagnitude([3, 4])).toBeCloseTo(5);
    });

    it('returns 0 for zero vector', () => {
        expect(vectorMagnitude([0, 0, 0])).toBe(0);
    });

    it('handles single element', () => {
        expect(vectorMagnitude([7])).toBeCloseTo(7);
    });
});

describe('vectorCosine', () => {
    it('returns 1 for parallel vectors', () => {
        expect(vectorCosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1.0);
    });

    it('returns -1 for antiparallel vectors', () => {
        expect(vectorCosine([1, 0], [-1, 0])).toBeCloseTo(-1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
        expect(vectorCosine([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    it('returns 0 when either vector is zero', () => {
        expect(vectorCosine([0, 0], [1, 2])).toBe(0);
        expect(vectorCosine([1, 2], [0, 0])).toBe(0);
    });
});

// ── Gap Decomposition ─────────────────────────────────────────────────────

describe('decomposeGap', () => {
    it('perfect prediction → direction=1, ratio=1', () => {
        const marginal = [40, 30, 30];
        const truth = [50, 25, 25];
        const prediction = [50, 25, 25]; // perfect match
        const result = decomposeGap(prediction, truth, marginal);
        expect(result.directionalAccuracy).toBeCloseTo(1.0);
        expect(result.magnitudeRatio).toBeCloseTo(1.0);
    });

    it('opposite direction → direction≈-1', () => {
        const marginal = [40, 30, 30];
        const truth = [50, 25, 25]; // shifted up on first option
        const prediction = [30, 35, 35]; // shifted down (wrong direction)
        const result = decomposeGap(prediction, truth, marginal);
        expect(result.directionalAccuracy).toBeCloseTo(-1.0);
    });

    it('right direction but double magnitude → ratio≈2', () => {
        const marginal = [40, 30, 30];
        const truth = [45, 27.5, 27.5]; // +5 shift
        const prediction = [50, 25, 25]; // +10 shift (double)
        const result = decomposeGap(prediction, truth, marginal);
        expect(result.directionalAccuracy).toBeCloseTo(1.0);
        expect(result.magnitudeRatio).toBeCloseTo(2.0);
    });

    it('no shift (segment = marginal) → null decomposition', () => {
        const marginal = [40, 30, 30];
        const truth = [40, 30, 30]; // identical to marginal
        const prediction = [45, 25, 30];
        const result = decomposeGap(prediction, truth, marginal);
        // When truth = marginal, direction is undefined — should be null/0
        expect(result.truthShiftMagnitude).toBeCloseTo(0);
        expect(result.directionalAccuracy).toBe(0); // undefined direction → 0
    });

    it('tracks truth shift magnitude correctly', () => {
        const marginal = [50, 50];
        const truth = [70, 30]; // shift magnitude = sqrt(20^2 + 20^2) ≈ 28.28
        const prediction = [60, 40];
        const result = decomposeGap(prediction, truth, marginal);
        expect(result.truthShiftMagnitude).toBeCloseTo(Math.sqrt(800));
    });
});

// ── Multinomial Sampling ──────────────────────────────────────────────────

describe('multinomialSample', () => {
    it('produces a sample of correct size', () => {
        const sample = multinomialSample([0.5, 0.3, 0.2], 100);
        expect(sample.length).toBe(3);
        const total = sample.reduce((a, b) => a + b, 0);
        expect(total).toBe(100);
    });

    it('respects probabilities approximately (law of large numbers)', () => {
        const probs = [0.7, 0.2, 0.1];
        const sample = multinomialSample(probs, 10000);
        // With n=10000, proportions should be within ~2% of true probs
        const proportions = sample.map(c => c / 10000);
        expect(proportions[0]).toBeCloseTo(0.7, 1);
        expect(proportions[1]).toBeCloseTo(0.2, 1);
        expect(proportions[2]).toBeCloseTo(0.1, 1);
    });

    it('handles edge case of single category', () => {
        const sample = multinomialSample([1.0], 50);
        expect(sample).toEqual([50]);
    });

    it('all counts are non-negative', () => {
        const sample = multinomialSample([0.01, 0.01, 0.98], 10);
        for (const c of sample) {
            expect(c).toBeGreaterThanOrEqual(0);
        }
    });
});

// ── Bootstrap CIs ─────────────────────────────────────────────────────────

describe('bootstrapScoreCI', () => {
    it('large n → narrow CI', () => {
        const truth = [40, 30, 20, 10]; // 4 options
        const prediction = [42, 28, 20, 10];
        const ci = bootstrapScoreCI(truth, prediction, 1000, 500);
        const width = ci.ci95High - ci.ci95Low;
        expect(width).toBeLessThan(0.08);
    });

    it('small n → wide CI', () => {
        const truth = [40, 30, 20, 10];
        const prediction = [42, 28, 20, 10];
        const ci = bootstrapScoreCI(truth, prediction, 15, 500);
        const width = ci.ci95High - ci.ci95Low;
        expect(width).toBeGreaterThan(0.05);
    });

    it('CI contains the point estimate (usually)', () => {
        const truth = [50, 50];
        const prediction = [55, 45];
        const ci = bootstrapScoreCI(truth, prediction, 100, 1000);
        // The point estimate score
        const pointScore = jsDivergenceSimilarity(prediction, truth);
        // CI should generally contain or be near the point score
        // (it won't always contain it since bootstrap resamples the truth)
        expect(ci.ci95Low).toBeLessThan(pointScore + 0.1);
        expect(ci.ci95High).toBeGreaterThan(pointScore - 0.1);
    });

    it('returns valid bounds', () => {
        const truth = [30, 30, 40];
        const prediction = [35, 25, 40];
        const ci = bootstrapScoreCI(truth, prediction, 50, 200);
        expect(ci.ci95Low).toBeLessThanOrEqual(ci.mean);
        expect(ci.ci95High).toBeGreaterThanOrEqual(ci.mean);
        expect(ci.ci95Low).toBeGreaterThanOrEqual(0);
        expect(ci.ci95High).toBeLessThanOrEqual(1);
    });
});

describe('bootstrapAggregateCI', () => {
    it('produces reasonable CI for score array', () => {
        const scores = [0.8, 0.82, 0.79, 0.85, 0.81, 0.78, 0.83, 0.80];
        const ci = bootstrapAggregateCI(scores, 1000);
        expect(ci.mean).toBeCloseTo(scores.reduce((a, b) => a + b) / scores.length, 2);
        expect(ci.ci95Low).toBeGreaterThan(0.7);
        expect(ci.ci95High).toBeLessThan(0.9);
    });

    it('single score → CI collapses to point', () => {
        const ci = bootstrapAggregateCI([0.75], 100);
        expect(ci.mean).toBeCloseTo(0.75);
        expect(ci.ci95Low).toBeCloseTo(0.75);
        expect(ci.ci95High).toBeCloseTo(0.75);
    });
});

// ── Noise Floor ───────────────────────────────────────────────────────────

describe('computeNoiseFloorValue', () => {
    it('higher n → higher noise floor (closer to 1)', () => {
        const floor50 = computeNoiseFloorValue(4, 50);
        const floor500 = computeNoiseFloorValue(4, 500);
        expect(floor500).toBeGreaterThan(floor50);
    });

    it('more options (k) → lower noise floor', () => {
        const floor3 = computeNoiseFloorValue(3, 100);
        const floor6 = computeNoiseFloorValue(6, 100);
        expect(floor3).toBeGreaterThan(floor6);
    });

    it('matches known values from the writeup', () => {
        // k=4, n=50 → E[similarity] ≈ 0.792 (from appendix table)
        expect(computeNoiseFloorValue(4, 50)).toBeCloseTo(0.792, 2);
    });

    it('handles very large n', () => {
        const floor = computeNoiseFloorValue(4, 100000);
        expect(floor).toBeGreaterThan(0.99);
    });
});

// ── Weighted Mean ─────────────────────────────────────────────────────────

describe('computeWeightedMean', () => {
    it('equal weights → arithmetic mean', () => {
        const result = computeWeightedMean(
            [0.8, 0.7, 0.9],
            [1, 1, 1],
        );
        expect(result).toBeCloseTo(0.8);
    });

    it('sqrt-n weighting upweights large samples', () => {
        // Segment A: score 0.9, n=100 (weight=10)
        // Segment B: score 0.5, n=1 (weight=1)
        // Weighted mean should be much closer to 0.9
        const result = computeWeightedMean(
            [0.9, 0.5],
            [Math.sqrt(100), Math.sqrt(1)],
        );
        // (0.9*10 + 0.5*1) / (10+1) = 9.5/11 ≈ 0.8636
        expect(result).toBeCloseTo(0.8636, 3);
    });

    it('single value → returns that value', () => {
        expect(computeWeightedMean([0.75], [5])).toBeCloseTo(0.75);
    });

    it('all zero weights → returns 0', () => {
        expect(computeWeightedMean([0.8, 0.9], [0, 0])).toBe(0);
    });
});

// ── Stratification ────────────────────────────────────────────────────────

describe('stratifyByPrefix', () => {
    it('groups items by segment ID prefix', () => {
        const items = [
            { segmentId: 'gender:male', value: 1 },
            { segmentId: 'gender:female', value: 2 },
            { segmentId: 'age:18-25', value: 3 },
            { segmentId: 'age:26-35', value: 4 },
            { segmentId: 'country:usa', value: 5 },
        ];
        const result = stratifyByPrefix(items, i => i.segmentId);
        expect(result.get('gender')?.length).toBe(2);
        expect(result.get('age')?.length).toBe(2);
        expect(result.get('country')?.length).toBe(1);
    });

    it('handles segments with no colon gracefully', () => {
        const items = [{ segmentId: 'unknown', value: 1 }];
        const result = stratifyByPrefix(items, i => i.segmentId);
        expect(result.get('unknown')?.length).toBe(1);
    });

    it('returns empty map for empty input', () => {
        const result = stratifyByPrefix([], (_: any) => '');
        expect(result.size).toBe(0);
    });
});
