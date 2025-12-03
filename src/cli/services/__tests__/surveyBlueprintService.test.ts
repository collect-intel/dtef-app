import { SurveyBlueprintService } from '../surveyBlueprintService';
import { Survey, SurveyBlueprintConfig } from '@/types/survey';

describe('SurveyBlueprintService', () => {
    const mockSurvey: Survey = {
        id: 'test-survey',
        title: 'Test Survey',
        description: 'A test survey',
        demographicQuestions: [
            {
                id: 'age',
                type: 'single-select',
                text: 'Age group?',
                options: ['18-25', '26-35', '36-45']
            },
            {
                id: 'gender',
                type: 'single-select',
                text: 'Gender?',
                options: ['Male', 'Female', 'Other']
            }
        ],
        surveyQuestions: [
            {
                id: 'q1',
                type: 'single-select',
                text: 'Do you like AI?',
                options: ['Yes', 'No', 'Maybe']
            },
            {
                id: 'q2',
                type: 'multi-select',
                text: 'Which features do you use?',
                options: ['Chat', 'Image', 'Code', 'Voice']
            },
            {
                id: 'q3',
                type: 'open-ended',
                text: 'What do you think about AI ethics?'
            }
        ],
        participants: [
            {
                id: 'p1',
                demographics: {
                    age: '18-25',
                    gender: 'Female'
                },
                responses: [
                    { questionId: 'age', answer: '18-25' },
                    { questionId: 'gender', answer: 'Female' },
                    { questionId: 'q1', answer: 'Yes' },
                    { questionId: 'q2', answer: ['Chat', 'Code'] },
                    { questionId: 'q3', answer: 'AI ethics is important for safety' }
                ]
            },
            {
                id: 'p2',
                demographics: {
                    age: '36-45',
                    gender: 'Male'
                },
                responses: [
                    { questionId: 'age', answer: '36-45' },
                    { questionId: 'gender', answer: 'Male' },
                    { questionId: 'q1', answer: 'Maybe' },
                    { questionId: 'q2', answer: ['Voice'] },
                    { questionId: 'q3', answer: 'We need more regulations' }
                ]
            }
        ]
    };

    describe('generateBlueprints', () => {
        it('should generate blueprints for all participants', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q1'],
                participantSelection: 'all'
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            expect(blueprints).toHaveLength(2);
            expect(blueprints[0].configId).toContain('survey-test-survey-participant-p1');
            expect(blueprints[1].configId).toContain('survey-test-survey-participant-p2');
        });

        it('should generate blueprints with demographics included', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q1'],
                includeDemographics: true,
                participantSelection: 'first',
                participantCount: 1
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            expect(blueprints).toHaveLength(1);
            const prompt = blueprints[0].prompts[0];
            expect(prompt.promptText).toContain('demographic profile');
            expect(prompt.promptText).toContain('Age');
            expect(prompt.promptText).toContain('Gender');
        });

        it('should include context questions in prompts', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q3'],
                contextQuestionIds: ['q1', 'q2'],
                participantSelection: 'first',
                participantCount: 1
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            const prompt = blueprints[0].prompts[0];
            expect(prompt.promptText).toContain('Do you like AI?');
            expect(prompt.promptText).toContain('Which features do you use?');
        });

        it('should generate evaluation points for single-select questions', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q1'],
                participantSelection: 'first',
                participantCount: 1
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            const prompt = blueprints[0].prompts[0];
            expect(prompt.points).toBeDefined();
            expect(prompt.points).toContain('Selects option a (Yes)');
            expect(prompt.should_not).toBeDefined();
            expect(prompt.should_not!).toContain('Selects option b (No)');
            expect(prompt.should_not!).toContain('Selects option c (Maybe)');
        });

        it('should generate evaluation points for multi-select questions', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q2'],
                participantSelection: 'first',
                participantCount: 1
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            const prompt = blueprints[0].prompts[0];
            expect(prompt.points).toContain('Includes option a (Chat)');
            expect(prompt.points).toContain('Includes option c (Code)');
            expect(prompt.should_not!).toContain('Selects option b (Image) as primary choice');
        });

        it('should handle random participant selection', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q1'],
                participantSelection: 'random',
                participantCount: 1
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            expect(blueprints).toHaveLength(1);
            expect(['p1', 'p2']).toContain(
                blueprints[0].configId!.split('participant-')[1]
            );
        });

        it('should handle specific participant selection', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q1'],
                participantSelection: 'specific',
                participantIds: ['p2']
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            expect(blueprints).toHaveLength(1);
            expect(blueprints[0].configId).toContain('participant-p2');
        });

        it('should apply model configuration', async () => {
            const config: SurveyBlueprintConfig = {
                survey: mockSurvey,
                targetQuestionIds: ['q1'],
                participantSelection: 'first',
                participantCount: 1,
                modelConfig: {
                    models: ['gpt-4', 'claude-3'],
                    temperature: 0.5,
                    judgeModels: ['gpt-4']
                }
            };

            const blueprints = await SurveyBlueprintService.generateBlueprints(config);

            expect(blueprints[0].models).toEqual(['gpt-4', 'claude-3']);
            expect(blueprints[0].temperature).toBe(0.5);
            expect(blueprints[0].evaluationConfig?.['llm-coverage']?.judgeModels).toEqual(['gpt-4']);
        });
    });

    describe('importSurveyData', () => {
        it('should import valid survey data', () => {
            const jsonData = JSON.stringify(mockSurvey);
            const imported = SurveyBlueprintService.importSurveyData(jsonData);

            expect(imported.id).toBe('test-survey');
            expect(imported.participants).toHaveLength(2);
            expect(imported.surveyQuestions).toHaveLength(3);
        });

        it('should throw error for invalid survey data', () => {
            const invalidData = JSON.stringify({ invalid: 'data' });

            expect(() => {
                SurveyBlueprintService.importSurveyData(invalidData);
            }).toThrow('Invalid survey data structure');
        });

        it('should throw error for malformed JSON', () => {
            const malformedJson = 'not valid json';

            expect(() => {
                SurveyBlueprintService.importSurveyData(malformedJson);
            }).toThrow('Failed to parse survey data');
        });
    });

    describe('exportSurveyData', () => {
        it('should export survey data as formatted JSON', () => {
            const exported = SurveyBlueprintService.exportSurveyData(mockSurvey);
            const parsed = JSON.parse(exported);

            expect(parsed.id).toBe('test-survey');
            expect(parsed.participants).toHaveLength(2);
            expect(exported).toContain('\n');
        });
    });
});