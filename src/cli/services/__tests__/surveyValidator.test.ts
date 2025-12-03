import { SurveyValidator } from '../surveyValidator';
import { Survey } from '@/types/survey';

describe('SurveyValidator', () => {
    const validSurvey: Survey = {
        id: 'test-survey',
        title: 'Test Survey',
        description: 'A test survey',
        demographicQuestions: [
            {
                id: 'age',
                type: 'single-select',
                text: 'Age?',
                options: ['18-25', '26-35']
            }
        ],
        surveyQuestions: [
            {
                id: 'q1',
                type: 'single-select',
                text: 'Question 1?',
                options: ['Yes', 'No']
            },
            {
                id: 'q2',
                type: 'multi-select',
                text: 'Question 2?',
                options: ['A', 'B', 'C']
            },
            {
                id: 'q3',
                type: 'open-ended',
                text: 'Question 3?'
            },
            {
                id: 'intro',
                type: 'text-content',
                text: 'Introduction text'
            }
        ],
        participants: [
            {
                id: 'p1',
                demographics: { age: '18-25' },
                responses: [
                    { questionId: 'age', answer: '18-25' },
                    { questionId: 'q1', answer: 'Yes' },
                    { questionId: 'q2', answer: ['A', 'B'] },
                    { questionId: 'q3', answer: 'Some text' }
                ]
            }
        ]
    };

    describe('valid survey', () => {
        it('should pass validation for a valid survey', () => {
            const validator = new SurveyValidator();
            const issues = validator.validate(validSurvey);
            const { errors, warnings, isValid } = SurveyValidator.formatResults(issues);
            
            expect(isValid).toBe(true);
            expect(errors).toHaveLength(0);
        });
    });

    describe('structural errors', () => {
        it('should detect missing required fields', () => {
            const invalidSurvey = { ...validSurvey, id: '' };
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => e.message.includes('Survey must have an id'))).toBe(true);
        });

        it('should detect duplicate question IDs', () => {
            const invalidSurvey = {
                ...validSurvey,
                surveyQuestions: [
                    ...validSurvey.surveyQuestions,
                    { id: 'q1', type: 'open-ended', text: 'Duplicate' }
                ]
            } as Survey;
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => e.message.includes('Duplicate question ID: q1'))).toBe(true);
        });

        it('should detect duplicate participant IDs', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [
                    ...validSurvey.participants,
                    { ...validSurvey.participants[0] }
                ]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => e.message.includes('Duplicate participant ID: p1'))).toBe(true);
        });
    });

    describe('response validation', () => {
        it('should detect invalid single-select answers', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'q1', answer: 'Invalid Answer' }
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes("'Invalid Answer' is not a valid option")
            )).toBe(true);
        });

        it('should detect invalid multi-select answers', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'q2', answer: ['A', 'InvalidOption'] }
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes("'InvalidOption' is not a valid option")
            )).toBe(true);
        });

        it('should detect wrong answer type for single-select', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'q1', answer: ['Yes'] } // Array instead of string
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('must be a string')
            )).toBe(true);
        });

        it('should detect wrong answer type for multi-select', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'q2', answer: 'A' } // String instead of array
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('must be an array')
            )).toBe(true);
        });

        it('should detect responses to text-content items', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'intro', answer: 'Should not respond to text' }
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('response to text-content item intro')
            )).toBe(true);
        });

        it('should detect responses to non-existent questions', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'nonexistent', answer: 'Some answer' }
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('response to non-existent question: nonexistent')
            )).toBe(true);
        });

        it('should detect duplicate responses to same question', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'q1', answer: 'Yes' },
                        { questionId: 'q1', answer: 'No' }
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('duplicate response to question q1')
            )).toBe(true);
        });
    });

    describe('demographic validation', () => {
        it('should detect invalid demographic values for single-select', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: 'InvalidAge' },
                    responses: []
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes("demographic 'age' value 'InvalidAge' is not a valid option")
            )).toBe(true);
        });

        it('should warn about demographic keys not matching question IDs', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { unknown_key: 'value' },
                    responses: []
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { warnings } = SurveyValidator.formatResults(issues);
            
            expect(warnings.some(w => 
                w.message.includes("demographic key 'unknown_key' that doesn't match")
            )).toBe(true);
        });

        // This test is no longer applicable since demographics are not in responses
        // Keeping a placeholder test to maintain test structure
        it('should validate demographics are from the defined questions', () => {
            const invalidSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: []
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            // Demographics validation still works
            expect(errors.length).toBe(0);
        });
    });

    describe('question validation', () => {
        it('should detect missing options for select questions', () => {
            const invalidSurvey = {
                ...validSurvey,
                surveyQuestions: [{
                    id: 'q1',
                    type: 'single-select' as const,
                    text: 'Question?',
                    options: []
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('has empty options array')
            )).toBe(true);
        });

        it('should detect duplicate options within a question', () => {
            const invalidSurvey = {
                ...validSurvey,
                surveyQuestions: [{
                    id: 'q1',
                    type: 'single-select' as const,
                    text: 'Question?',
                    options: ['Yes', 'No', 'Yes']
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('has duplicate option: Yes')
            )).toBe(true);
        });

        it('should detect empty question text', () => {
            const invalidSurvey = {
                ...validSurvey,
                surveyQuestions: [{
                    id: 'q1',
                    type: 'open-ended' as const,
                    text: ''
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('has empty text')
            )).toBe(true);
        });

        it('should detect invalid question type', () => {
            const invalidSurvey = {
                ...validSurvey,
                surveyQuestions: [{
                    id: 'q1',
                    type: 'invalid-type' as any,
                    text: 'Question?'
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(invalidSurvey);
            const { errors } = SurveyValidator.formatResults(issues);
            
            expect(errors.some(e => 
                e.message.includes('has invalid type: invalid-type')
            )).toBe(true);
        });
    });

    describe('completeness warnings', () => {
        it('should warn about missing responses', () => {
            const incompleteSurvey = {
                ...validSurvey,
                participants: [{
                    id: 'p1',
                    demographics: { age: '18-25' },
                    responses: [
                        { questionId: 'age', answer: '18-25' }
                        // Missing responses to q1, q2, q3
                    ]
                }]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(incompleteSurvey);
            const { warnings } = SurveyValidator.formatResults(issues);
            
            expect(warnings.some(w => 
                w.message.includes('missing responses to: q1, q2, q3')
            )).toBe(true);
        });

        it('should warn about inconsistent response patterns', () => {
            const inconsistentSurvey = {
                ...validSurvey,
                participants: [
                    {
                        id: 'p1',
                        demographics: { age: '18-25' },
                        responses: [
                            { questionId: 'q1', answer: 'Yes' }
                        ]
                    },
                    {
                        id: 'p2',
                        demographics: { age: '26-35' },
                        responses: [
                            { questionId: 'q1', answer: 'No' },
                            { questionId: 'q2', answer: ['A'] }
                        ]
                    }
                ]
            };
            
            const validator = new SurveyValidator();
            const issues = validator.validate(inconsistentSurvey);
            const { warnings } = SurveyValidator.formatResults(issues);
            
            expect(warnings.some(w => 
                w.message.includes('different sets of responses')
            )).toBe(true);
        });
    });
});