/**
 * Tests for DemographicBlueprintService — shift evaluation type
 *
 * Tests the shift eval type prompt generation where the population marginal
 * is included in the prompt and the model is asked to adjust it.
 */

import { DemographicBlueprintService } from '../demographicBlueprintService';
import { DTEFSurveyData, DTEFBlueprintConfig } from '@/types/dtef';

/** Minimal survey data fixture */
function makeSurveyData(): DTEFSurveyData {
    return {
        surveyId: 'test-survey',
        surveyName: 'Test Survey',
        source: 'unit-test',
        questions: {
            q1: { text: 'Do you like cats?', type: 'single-select' as any, options: ['Yes', 'No', 'Maybe'] },
            q2: { text: 'Favorite season?', type: 'single-select' as any, options: ['Spring', 'Summer', 'Fall', 'Winter'] },
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

describe('DemographicBlueprintService — shift evaluation', () => {
    const surveyData = makeSurveyData();

    describe('computePopulationMarginals', () => {
        it('computes sample-size-weighted average', () => {
            const marginals = DemographicBlueprintService.computePopulationMarginals(surveyData);
            // q1: (60*100 + 30*200)/300 = 40, (20*100 + 50*200)/300 = 40, (20*100 + 20*200)/300 = 20
            expect(marginals['q1'][0]).toBeCloseTo(40, 1);
            expect(marginals['q1'][1]).toBeCloseTo(40, 1);
            expect(marginals['q1'][2]).toBeCloseTo(20, 1);
        });

        it('returns entries for all questions', () => {
            const marginals = DemographicBlueprintService.computePopulationMarginals(surveyData);
            expect(Object.keys(marginals)).toEqual(expect.arrayContaining(['q1', 'q2']));
        });
    });

    describe('generateBlueprints with evalType=shift', () => {
        const config: DTEFBlueprintConfig = {
            surveyData,
            targetQuestionIds: ['q1', 'q2'],
            evalType: 'shift',
            modelConfig: { models: ['CORE_CHEAP'], temperature: 0.3 },
        };

        const blueprints = DemographicBlueprintService.generateBlueprints(config);

        it('generates one blueprint per segment', () => {
            expect(blueprints).toHaveLength(2);
        });

        it('includes -shift suffix in configId', () => {
            for (const bp of blueprints) {
                expect(bp.configId).toContain('-shift');
            }
        });

        it('uses shift system prompt', () => {
            for (const bp of blueprints) {
                expect(bp.system).toContain('DIFFERS from the overall population');
            }
        });

        it('includes population marginal distribution in prompt text', () => {
            const bp = blueprints[0];
            for (const prompt of bp.prompts) {
                expect(prompt.promptText).toContain('overall population responded');
                // Should contain percentage values from the marginal
                expect(prompt.promptText).toMatch(/\d+\.\d+%/);
            }
        });

        it('includes demographic group in prompt text', () => {
            const bp = blueprints[0];
            for (const prompt of bp.prompts) {
                expect(prompt.promptText).toContain('adjust this distribution');
            }
        });

        it('uses correct evaluation points (same JSD metric)', () => {
            for (const bp of blueprints) {
                for (const prompt of bp.prompts) {
                    expect(prompt.points).toHaveLength(1);
                    const point = prompt.points![0];
                    expect(typeof point).toBe('object');
                    expect((point as any).fn).toBe('distribution_metric');
                    expect((point as any).fnArgs?.metric).toBe('js-divergence');
                }
            }
        });

        it('stores evalType in config context', () => {
            for (const bp of blueprints) {
                const dtef = bp.context?.dtef as any;
                expect(dtef.evalType).toBe('shift');
            }
        });

        it('stores population marginals in config context', () => {
            for (const bp of blueprints) {
                const dtef = bp.context?.dtef as any;
                expect(dtef.populationMarginals).toBeDefined();
                expect(dtef.populationMarginals['q1']).toBeDefined();
            }
        });

        it('includes shift tag', () => {
            for (const bp of blueprints) {
                expect(bp.tags).toContain('shift');
            }
        });
    });

    describe('generateBlueprints with evalType=distribution (default)', () => {
        const config: DTEFBlueprintConfig = {
            surveyData,
            targetQuestionIds: ['q1'],
            modelConfig: { models: ['CORE_CHEAP'], temperature: 0.3 },
        };

        const blueprints = DemographicBlueprintService.generateBlueprints(config);

        it('does NOT include population marginal in prompt text', () => {
            const bp = blueprints[0];
            for (const prompt of bp.prompts) {
                expect(prompt.promptText).not.toContain('overall population responded');
            }
        });

        it('does NOT include -shift suffix in configId', () => {
            for (const bp of blueprints) {
                expect(bp.configId).not.toContain('-shift');
            }
        });

        it('uses default system prompt', () => {
            for (const bp of blueprints) {
                expect(bp.system).toContain('demographic survey analyst');
                expect(bp.system).not.toContain('DIFFERS');
            }
        });
    });

    describe('shift eval with pre-computed marginals', () => {
        const customMarginals = {
            q1: [50, 30, 20],
            q2: [25, 25, 25, 25],
        };

        const config: DTEFBlueprintConfig = {
            surveyData,
            targetQuestionIds: ['q1'],
            evalType: 'shift',
            populationMarginals: customMarginals,
            modelConfig: { models: ['CORE_CHEAP'], temperature: 0.3 },
        };

        const blueprints = DemographicBlueprintService.generateBlueprints(config);

        it('uses pre-computed marginals instead of computing from data', () => {
            const bp = blueprints[0];
            const prompt = bp.prompts[0];
            // Custom marginal for q1 is [50, 30, 20], should see 50.0% in prompt
            expect(prompt.promptText).toContain('50.0%');
        });
    });
});
