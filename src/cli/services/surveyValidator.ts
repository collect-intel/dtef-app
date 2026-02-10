import { Survey, SurveyQuestion, Participant, ParticipantResponse } from '@/types/survey';

export interface ValidationIssue {
    level: 'error' | 'warning';
    message: string;
    details?: any;
}

/**
 * @deprecated This validator is for the legacy per-participant survey format.
 *
 * For DTEF demographic survey validation, use the validation in dtef-commands.ts
 * which validates DTEFSurveyData format instead. This class is preserved for
 * backward compatibility with the legacy `survey` CLI commands.
 */
export class SurveyValidator {
    private issues: ValidationIssue[] = [];
    
    /**
     * Comprehensive validation of survey data structure
     */
    public validate(survey: Survey): ValidationIssue[] {
        this.issues = [];
        
        // Basic structure validation
        this.validateBasicStructure(survey);
        
        // Question validation
        this.validateQuestions(survey);
        
        // Participant validation
        this.validateParticipants(survey);
        
        // Cross-reference validation
        this.validateCrossReferences(survey);
        
        return this.issues;
    }
    
    private validateBasicStructure(survey: Survey) {
        if (!survey.id) {
            this.addError('Survey must have an id');
        }
        
        if (!survey.title) {
            this.addError('Survey must have a title');
        }
        
        if (!Array.isArray(survey.surveyQuestions)) {
            this.addError('Survey must have surveyQuestions array');
        }
        
        if (!Array.isArray(survey.demographicQuestions)) {
            this.addError('Survey must have demographicQuestions array');
        }
        
        if (!Array.isArray(survey.participants)) {
            this.addError('Survey must have participants array');
        }
        
        if (survey.participants.length === 0) {
            this.addWarning('Survey has no participants');
        }
    }
    
    private validateQuestions(survey: Survey) {
        const allQuestions = [...survey.demographicQuestions, ...survey.surveyQuestions];
        const questionIds = new Set<string>();
        
        for (const question of allQuestions) {
            // Check for duplicate IDs
            if (questionIds.has(question.id)) {
                this.addError(`Duplicate question ID: ${question.id}`);
            }
            questionIds.add(question.id);
            
            // Validate question structure
            if (!question.text || question.text.trim() === '') {
                this.addError(`Question ${question.id} has empty text`);
            }
            
            // Validate question type
            const validTypes = ['single-select', 'multi-select', 'open-ended', 'text-content'];
            if (!validTypes.includes(question.type)) {
                this.addError(`Question ${question.id} has invalid type: ${question.type}`);
            }
            
            // Validate select questions have options
            if (question.type === 'single-select' || question.type === 'multi-select') {
                if (!question.options || !Array.isArray(question.options)) {
                    this.addError(`Question ${question.id} (${question.type}) must have options array`);
                } else if (question.options.length === 0) {
                    this.addError(`Question ${question.id} has empty options array`);
                } else {
                    // Check for duplicate options
                    const optionSet = new Set<string>();
                    for (const option of question.options) {
                        if (optionSet.has(option)) {
                            this.addError(`Question ${question.id} has duplicate option: ${option}`);
                        }
                        optionSet.add(option);
                        
                        if (!option || option.trim() === '') {
                            this.addError(`Question ${question.id} has empty option`);
                        }
                    }
                }
            }
            
            // Validate that text-content doesn't have options
            if (question.type === 'text-content' && (question as any).options) {
                this.addWarning(`Text-content question ${question.id} should not have options`);
            }
        }
    }
    
    private validateParticipants(survey: Survey) {
        const participantIds = new Set<string>();
        const allQuestionIds = new Set([
            ...survey.demographicQuestions.map(q => q.id),
            ...survey.surveyQuestions.map(q => q.id)
        ]);
        
        // Track response consistency
        const responsePatterns = new Map<string, number>();
        
        for (const participant of survey.participants) {
            // Check for duplicate participant IDs
            if (participantIds.has(participant.id)) {
                this.addError(`Duplicate participant ID: ${participant.id}`);
            }
            participantIds.add(participant.id);
            
            // Validate demographics
            this.validateParticipantDemographics(participant, survey.demographicQuestions);
            
            // Validate responses
            this.validateParticipantResponses(participant, survey, allQuestionIds);
            
            // Track response pattern
            const pattern = participant.responses.map(r => r.questionId).sort().join(',');
            responsePatterns.set(pattern, (responsePatterns.get(pattern) || 0) + 1);
        }
        
        // Check for inconsistent response patterns
        if (responsePatterns.size > 1) {
            const patterns = Array.from(responsePatterns.entries());
            this.addWarning(`Participants have different sets of responses. Found ${patterns.length} different patterns`);
        }
    }
    
    private validateParticipantDemographics(participant: Participant, demographicQuestions: SurveyQuestion[]) {
        for (const [key, value] of Object.entries(participant.demographics)) {
            const question = demographicQuestions.find(q => q.id === key);
            
            if (!question) {
                this.addWarning(`Participant ${participant.id} has demographic key '${key}' that doesn't match any demographic question ID`);
                continue;
            }
            
            // Validate value matches question type
            if (question.type === 'single-select') {
                if (!question.options?.includes(value as string)) {
                    this.addError(`Participant ${participant.id} demographic '${key}' value '${value}' is not a valid option. Valid options: ${question.options?.join(', ')}`);
                }
            }
        }
    }
    
    private validateParticipantResponses(
        participant: Participant,
        survey: Survey,
        allQuestionIds: Set<string>
    ) {
        const respondedQuestions = new Set<string>();
        
        for (const response of participant.responses) {
            // Check for duplicate responses to same question
            if (respondedQuestions.has(response.questionId)) {
                this.addError(`Participant ${participant.id} has duplicate response to question ${response.questionId}`);
            }
            respondedQuestions.add(response.questionId);
            
            // Check if question exists
            if (!allQuestionIds.has(response.questionId)) {
                this.addError(`Participant ${participant.id} has response to non-existent question: ${response.questionId}`);
                continue;
            }
            
            // Find the question
            const question = [...survey.demographicQuestions, ...survey.surveyQuestions]
                .find(q => q.id === response.questionId);
            
            if (!question) continue;
            
            // Validate response format based on question type
            this.validateResponseFormat(participant.id, response, question);
        }
        
        // Check for responses to text-content items
        const textContentIds = survey.surveyQuestions
            .filter(q => q.type === 'text-content')
            .map(q => q.id);
        
        for (const textId of textContentIds) {
            if (respondedQuestions.has(textId)) {
                this.addError(`Participant ${participant.id} has response to text-content item ${textId}, which should not have responses`);
            }
        }
    }
    
    private validateResponseFormat(
        participantId: string,
        response: ParticipantResponse,
        question: SurveyQuestion
    ) {
        const { questionId, answer } = response;
        
        switch (question.type) {
            case 'single-select':
                if (typeof answer !== 'string') {
                    this.addError(`Participant ${participantId} response to ${questionId} must be a string, got ${typeof answer}`);
                } else if (!question.options?.includes(answer)) {
                    this.addError(`Participant ${participantId} response to ${questionId}: '${answer}' is not a valid option. Valid options: ${question.options?.join(', ')}`);
                }
                break;
                
            case 'multi-select':
                if (!Array.isArray(answer)) {
                    this.addError(`Participant ${participantId} response to ${questionId} must be an array, got ${typeof answer}`);
                } else {
                    const answerArray = answer as string[];
                    const uniqueAnswers = new Set<string>();
                    
                    for (const item of answerArray) {
                        if (typeof item !== 'string') {
                            this.addError(`Participant ${participantId} response to ${questionId}: array contains non-string value`);
                            continue;
                        }
                        
                        if (uniqueAnswers.has(item)) {
                            this.addError(`Participant ${participantId} response to ${questionId}: duplicate answer '${item}'`);
                        }
                        uniqueAnswers.add(item);
                        
                        if (!question.options?.includes(item)) {
                            this.addError(`Participant ${participantId} response to ${questionId}: '${item}' is not a valid option. Valid options: ${question.options?.join(', ')}`);
                        }
                    }
                }
                break;
                
            case 'open-ended':
                if (answer !== null && typeof answer !== 'string') {
                    this.addError(`Participant ${participantId} response to ${questionId} must be a string or null, got ${typeof answer}`);
                }
                break;
                
            case 'text-content':
                this.addError(`Participant ${participantId} should not have response to text-content item ${questionId}`);
                break;
        }
    }
    
    private validateCrossReferences(survey: Survey) {
        // Check for missing survey responses (warning only)
        // Note: We don't check demographic questions as they're stored in the demographics object
        const allNonTextSurveyQuestions = survey.surveyQuestions
            .filter(q => q.type !== 'text-content');
        
        for (const participant of survey.participants) {
            const respondedIds = new Set(participant.responses.map(r => r.questionId));
            const missingQuestions = allNonTextSurveyQuestions
                .filter(q => !respondedIds.has(q.id))
                .map(q => q.id);
            
            if (missingQuestions.length > 0) {
                this.addWarning(
                    `Participant ${participant.id} missing responses to: ${missingQuestions.join(', ')}`
                );
            }
        }
    }
    
    private addError(message: string, details?: any) {
        this.issues.push({ level: 'error', message, details });
    }
    
    private addWarning(message: string, details?: any) {
        this.issues.push({ level: 'warning', message, details });
    }
    
    /**
     * Format validation results for console output
     */
    public static formatResults(issues: ValidationIssue[]): {
        errors: ValidationIssue[];
        warnings: ValidationIssue[];
        isValid: boolean;
    } {
        const errors = issues.filter(i => i.level === 'error');
        const warnings = issues.filter(i => i.level === 'warning');
        
        return {
            errors,
            warnings,
            isValid: errors.length === 0
        };
    }
}