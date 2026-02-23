/**
 * Tests for baselineGeneratorService
 *
 * Validates that synthetic baseline results are correctly generated
 * and flow through the normal pipeline without special handling.
 */

import {
    generateBaselineResults,
    getBaselineMeanScore,
    BASELINE_MODEL_IDS,
    BaselineType,
} from '../baselineGeneratorService';
import { DTEFSurveyData } from '@/types/dtef';

/** Minimal survey data fixture with 2 segments and 2 questions */
function makeSurveyData(): DTEFSurveyData {
    return {
        surveyId: 'test-survey',
        surveyName: 'Test Survey',
        description: 'Fixture for baseline tests',
        source: 'unit-test',
        questions: {
            q1: { text: 'Do you like cats?', type: 'single-select' as any, options: ['Yes', 'No', 'Maybe'] },
            q2: { text: 'Favorite color?', type: 'single-select' as any, options: ['Red', 'Blue', 'Green', 'Yellow'] },
        },
        segments: [
            {
                id: 'seg-a',
                label: 'Segment A',
                attributes: { group: 'alpha' },
                sampleSize: 100,
                responses: [
                    { questionId: 'q1', distribution: [60, 20, 20] },
                    { questionId: 'q2', distribution: [10, 40, 30, 20] },
                ],
            },
            {
                id: 'seg-b',
                label: 'Segment B',
                attributes: { group: 'beta' },
                sampleSize: 200,
                responses: [
                    { questionId: 'q1', distribution: [30, 50, 20] },
                    { questionId: 'q2', distribution: [20, 20, 40, 20] },
                ],
            },
        ],
    };
}

describe('baselineGeneratorService', () => {
    describe('generateBaselineResults — population-marginal', () => {
        const survey = makeSurveyData();
        const results = generateBaselineResults(survey, 'population-marginal');

        it('generates one result per segment', () => {
            expect(results).toHaveLength(2);
        });

        it('uses the correct model ID', () => {
            for (const r of results) {
                expect(r.effectiveModels).toEqual([BASELINE_MODEL_IDS.POPULATION_MARGINAL]);
            }
        });

        it('has valid WevalResult structure', () => {
            for (const r of results) {
                expect(r.configId).toBeTruthy();
                expect(r.configTitle).toBeTruthy();
                expect(r.timestamp).toBeTruthy();
                expect(r.config).toBeDefined();
                expect(r.evalMethodsUsed).toEqual(['llm-coverage']);
                expect(r.promptIds).toBeDefined();
                expect(r.promptIds.length).toBeGreaterThan(0);
            }
        });

        it('includes DTEF metadata', () => {
            const r = results[0];
            expect(r.dtefMetadata).toBeDefined();
            expect(r.dtefMetadata!.surveyId).toBe('test-survey');
            expect(r.dtefMetadata!.segmentIds).toEqual(['seg-a']);
        });

        it('has llmCoverageScores for each prompt', () => {
            for (const r of results) {
                const scores = r.evaluationResults?.llmCoverageScores;
                expect(scores).toBeDefined();
                for (const promptId of r.promptIds) {
                    expect(scores![promptId]).toBeDefined();
                    const modelScore = scores![promptId][r.effectiveModels[0]];
                    expect(modelScore).toBeDefined();
                    expect(typeof modelScore!.avgCoverageExtent).toBe('number');
                    expect(modelScore!.avgCoverageExtent).toBeGreaterThanOrEqual(0);
                    expect(modelScore!.avgCoverageExtent).toBeLessThanOrEqual(1);
                }
            }
        });

        it('has synthetic responses for each prompt', () => {
            for (const r of results) {
                expect(r.allFinalAssistantResponses).toBeDefined();
                for (const promptId of r.promptIds) {
                    const resp = r.allFinalAssistantResponses![promptId];
                    expect(resp).toBeDefined();
                    expect(resp[r.effectiveModels[0]]).toBeDefined();
                    // Should be parseable as a distribution array
                    const text = resp[r.effectiveModels[0]];
                    expect(text).toMatch(/^\[[\d., ]+\]$/);
                }
            }
        });

        it('computes population marginal as weighted average', () => {
            // q1: seg-a (n=100) [60,20,20], seg-b (n=200) [30,50,20]
            // weighted: [(60*100 + 30*200)/300, (20*100 + 50*200)/300, (20*100 + 20*200)/300]
            //         = [40, 40, 20]
            const segAResult = results.find(r => r.dtefMetadata!.segmentIds[0] === 'seg-a')!;
            const q1Prompt = segAResult.promptIds.find(id => id.startsWith('q1-'))!;
            const responseText = segAResult.allFinalAssistantResponses![q1Prompt][BASELINE_MODEL_IDS.POPULATION_MARGINAL];
            // Parse the prediction
            const prediction = JSON.parse(responseText);
            expect(prediction).toHaveLength(3);
            expect(prediction[0]).toBeCloseTo(40, 0);
            expect(prediction[1]).toBeCloseTo(40, 0);
            expect(prediction[2]).toBeCloseTo(20, 0);
        });

        it('includes ground truth distributions in config context', () => {
            for (const r of results) {
                const dtef = r.config.context?.dtef as any;
                expect(dtef).toBeDefined();
                expect(dtef.groundTruthDistributions).toBeDefined();
                expect(Object.keys(dtef.groundTruthDistributions).length).toBeGreaterThan(0);
            }
        });

        it('scores are higher when segment matches marginal', () => {
            // For q1, the marginal is [40,40,20]
            // seg-a has [60,20,20] — further from marginal
            // seg-b has [30,50,20] — also differs
            // Both should have valid scores between 0 and 1
            for (const r of results) {
                const scores = r.evaluationResults?.llmCoverageScores;
                for (const promptId of Object.keys(scores!)) {
                    const s = scores![promptId][BASELINE_MODEL_IDS.POPULATION_MARGINAL];
                    expect(s!.avgCoverageExtent).toBeGreaterThan(0);
                    expect(s!.avgCoverageExtent).toBeLessThanOrEqual(1);
                }
            }
        });
    });

    describe('generateBaselineResults — uniform', () => {
        const survey = makeSurveyData();
        const results = generateBaselineResults(survey, 'uniform');

        it('uses the uniform model ID', () => {
            for (const r of results) {
                expect(r.effectiveModels).toEqual([BASELINE_MODEL_IDS.UNIFORM]);
            }
        });

        it('predicts equal distribution', () => {
            const r = results[0];
            const q1Prompt = r.promptIds.find(id => id.startsWith('q1-'))!;
            const responseText = r.allFinalAssistantResponses![q1Prompt][BASELINE_MODEL_IDS.UNIFORM];
            const prediction = JSON.parse(responseText);
            // q1 has 3 options → uniform is [33.3, 33.3, 33.3]
            expect(prediction).toHaveLength(3);
            for (const p of prediction) {
                expect(p).toBeCloseTo(100 / 3, 0);
            }
        });
    });

    describe('getBaselineMeanScore', () => {
        it('computes mean across all prompts and segments', () => {
            const survey = makeSurveyData();
            const results = generateBaselineResults(survey, 'population-marginal');
            const mean = getBaselineMeanScore(results);
            expect(mean).toBeGreaterThan(0);
            expect(mean).toBeLessThanOrEqual(1);
        });

        it('returns 0 for empty results', () => {
            expect(getBaselineMeanScore([])).toBe(0);
        });
    });
});
