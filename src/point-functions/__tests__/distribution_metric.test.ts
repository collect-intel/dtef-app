import { parseDistribution, parseIndividualAnswers, jsDivergenceSimilarity, distribution_metric } from '../distribution_metric';

describe('parseDistribution', () => {
    it('parses bracket format', () => {
        expect(parseDistribution('[45.2, 30.1, 15.5, 9.2]')).toEqual([45.2, 30.1, 15.5, 9.2]);
    });

    it('parses CoT DISTRIBUTION marker', () => {
        expect(parseDistribution('Some reasoning...\nDISTRIBUTION: [45.2, 30.1, 15.5, 9.2]')).toEqual([45.2, 30.1, 15.5, 9.2]);
    });

    it('returns null for individual answer arrays', () => {
        // ["a", "b", "a"] contains no parseable numbers after bracket extraction
        expect(parseDistribution('["a", "b", "a", "c"]')).toBeNull();
    });
});

describe('parseIndividualAnswers', () => {
    it('parses basic letter array', () => {
        const result = parseIndividualAnswers('["a", "b", "a", "c", "a"]', 3);
        expect(result).toEqual([60, 20, 20]); // a=3/5=60%, b=1/5=20%, c=1/5=20%
    });

    it('parses with markdown code blocks', () => {
        const result = parseIndividualAnswers('```json\n["a", "a", "b", "a"]\n```', 3);
        expect(result).toEqual([75, 25, 0]); // a=3, b=1, c=0
    });

    it('handles all same answer', () => {
        const result = parseIndividualAnswers('["a", "a", "a", "a"]', 2);
        expect(result).toEqual([100, 0]);
    });

    it('handles 20 individual answers matching 3 options', () => {
        // Simulate a real synthetic-individual response
        const answers = '["a", "a", "b", "a", "b", "a", "a", "b", "a", "a", "b", "a", "a", "b", "a", "a", "b", "a", "a", "b"]';
        const result = parseIndividualAnswers(answers, 3);
        expect(result).not.toBeNull();
        // a=13, b=7, c=0 → [65, 35, 0]
        expect(result![0]).toBeCloseTo(65, 0);
        expect(result![1]).toBeCloseTo(35, 0);
        expect(result![2]).toBeCloseTo(0, 0);
    });

    it('ignores letters beyond numOptions', () => {
        // If model outputs "d" but only 3 options exist
        const result = parseIndividualAnswers('["a", "b", "d", "a"]', 3);
        // d is ignored, a=2, b=1, total=3
        expect(result).toEqual([
            (2 / 3) * 100,
            (1 / 3) * 100,
            0,
        ]);
    });

    it('returns null for number arrays', () => {
        expect(parseIndividualAnswers('[45.2, 30.1, 15.5]', 3)).toBeNull();
    });

    it('returns null for empty input', () => {
        expect(parseIndividualAnswers('', 3)).toBeNull();
    });

    it('returns null for non-letter content', () => {
        expect(parseIndividualAnswers('["hello", "world"]', 3)).toBeNull();
    });
});

describe('distribution_metric with individual answers', () => {
    it('scores synthetic-individual responses via aggregation', () => {
        // Expected: [34, 56, 10] (3 options)
        // Model response: 20 individual answers
        const response = '["a", "a", "b", "a", "b", "a", "a", "c", "a", "a", "b", "a", "a", "b", "a", "a", "b", "a", "a", "c"]';
        const result = distribution_metric(response, {
            expected: [34, 56, 10],
            metric: 'js-divergence',
        });

        expect(result).not.toHaveProperty('error');
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.explain).toContain('aggregated from individual answers');
    });

    it('still scores regular distributions normally', () => {
        const result = distribution_metric('[34.0, 56.0, 10.0]', {
            expected: [34, 56, 10],
            metric: 'js-divergence',
        });

        expect(result.score).toBeCloseTo(1.0, 2); // Perfect match
        expect(result.explain).not.toContain('aggregated');
    });

    it('handles markdown-wrapped individual answers', () => {
        const response = '```json\n["a", "b", "a", "a", "b"]\n```';
        const result = distribution_metric(response, {
            expected: [60, 40],
            metric: 'js-divergence',
        });

        expect(result.score).toBeGreaterThan(0);
        expect(result.explain).toContain('aggregated from individual answers');
    });
});

describe('jsDivergenceSimilarity', () => {
    it('returns 1.0 for identical distributions', () => {
        expect(jsDivergenceSimilarity([34, 56, 10], [34, 56, 10])).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for maximally different distributions', () => {
        const score = jsDivergenceSimilarity([100, 0], [0, 100]);
        expect(score).toBeLessThan(0.3);
    });

    it('returns intermediate values for similar distributions', () => {
        const score = jsDivergenceSimilarity([34, 56, 10], [30, 55, 15]);
        expect(score).toBeGreaterThan(0.8);
        expect(score).toBeLessThan(1.0);
    });
});
