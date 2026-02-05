import {
    Survey,
    SurveyBlueprintConfig,
    GeneratedBlueprint,
    SurveyQuestion,
    Participant,
    ParticipantResponse
} from '@/types/survey';
import { WevalConfig, WevalPromptConfig } from '@/types/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * @deprecated This service generates per-participant blueprints.
 * For demographic aggregate blueprints, use DemographicBlueprintService instead.
 * This class is preserved for potential future individual-prediction features.
 */
export class SurveyBlueprintService {
    /**
     * Generate Weval blueprints from survey data
     */
    static async generateBlueprints(
        config: SurveyBlueprintConfig
    ): Promise<WevalConfig[]> {
        const participants = this.selectParticipants(
            config.survey.participants,
            config.participantSelection || 'all',
            config.participantCount,
            config.participantIds
        );

        const blueprints: WevalConfig[] = [];

        for (const participant of participants) {
            const blueprint = this.generateBlueprintForParticipant(
                config,
                participant
            );
            blueprints.push(blueprint);
        }

        return blueprints;
    }

    /**
     * Generate a single blueprint for a participant
     */
    private static generateBlueprintForParticipant(
        config: SurveyBlueprintConfig,
        participant: Participant
    ): WevalConfig {
        const prompts: WevalPromptConfig[] = [];

        for (const targetQuestionId of config.targetQuestionIds) {
            const prompt = this.generatePromptForQuestion(
                config,
                participant,
                targetQuestionId
            );
            prompts.push(prompt);
        }

        const blueprintId = `survey-${config.survey.id}-participant-${participant.id}`;
        const blueprintTitle = `${config.survey.title} - Participant ${participant.id}`;

        return {
            configId: blueprintId,
            configTitle: blueprintTitle,
            description: `Generated from survey: ${config.survey.description || config.survey.title}`,
            models: config.modelConfig?.models || ['openai:gpt-4o-mini', 'anthropic:claude-3-5-haiku-latest'],
            temperature: config.modelConfig?.temperature || 0.7,
            prompts,
            tags: ['survey-generated', config.survey.id],
            evaluationConfig: config.modelConfig?.judgeModels ? {
                'llm-coverage': {
                    judgeModels: config.modelConfig.judgeModels
                }
            } : undefined
        };
    }

    /**
     * Generate a prompt configuration for a specific question
     */
    private static generatePromptForQuestion(
        config: SurveyBlueprintConfig,
        participant: Participant,
        targetQuestionId: string
    ): WevalPromptConfig {
        const targetQuestion = this.findQuestion(config.survey, targetQuestionId);
        if (!targetQuestion) {
            throw new Error(`Target question ${targetQuestionId} not found`);
        }

        // Check if there's introductory text before the target question
        const targetIndex = config.survey.surveyQuestions.findIndex(q => q.id === targetQuestionId);
        let introText = '';
        if (targetIndex > 0) {
            const prevQuestion = config.survey.surveyQuestions[targetIndex - 1];
            if (prevQuestion.type === 'text-content') {
                introText = prevQuestion.text;
            }
        }

        // Calculate display number for target question (count non-text questions before it + 1)
        const targetDisplayNumber = config.survey.surveyQuestions
            .slice(0, targetIndex + 1)
            .filter(q => q.type !== 'text-content')
            .length;

        const contextPrompt = this.buildContextPrompt(config, participant, targetQuestionId);
        const questionPrompt = this.formatQuestionPrompt(targetQuestion, introText, targetDisplayNumber);
        const fullPromptText = `${contextPrompt}\n\n${questionPrompt}`;

        const participantAnswer = this.getParticipantAnswer(participant, targetQuestionId);
        const { points, shouldNot } = this.generateEvaluationPoints(
            targetQuestion,
            participantAnswer
        );

        return {
            id: `q-${targetQuestionId}-p-${participant.id}`,
            description: `Predict response to: ${targetQuestion.text}`,
            promptText: fullPromptText,
            points,
            should_not: shouldNot.length > 0 ? shouldNot : undefined,
            idealResponse: this.formatIdealResponse(targetQuestion, participantAnswer),
            temperature: config.modelConfig?.temperature
        };
    }

    /**
     * Build the context prompt including demographics and previous answers
     */
    private static buildContextPrompt(
        config: SurveyBlueprintConfig,
        participant: Participant,
        targetQuestionId: string
    ): string {
        let prompt = '';

        // Add demographic context
        if (config.includeDemographics) {
            const demographicsToInclude = Array.isArray(config.includeDemographics)
                ? config.includeDemographics
                : Object.keys(participant.demographics);

            const validDemographics: string[] = [];
            for (const key of demographicsToInclude) {
                const value = participant.demographics[key];
                if (value !== undefined && value !== null && value !== '') {
                    validDemographics.push(`    - ${this.formatDemographicKey(key)}: ${value}`);
                }
            }
            
            // Only add demographic section if there are valid demographics
            if (validDemographics.length > 0) {
                prompt += 'Imagine you are a person who fits the following demographic profile:\n';
                prompt += validDemographics.join('\n') + '\n\n';
            }
        }

        // Add survey context
        prompt += 'You participate in a survey and respond to the following questions with the answers indicated.\n\n';
        prompt += '<SURVEY>\n';

        // Get context questions - if not specified, get the 5 questions before the target
        let contextQuestions: string[];
        if (config.contextQuestionIds) {
            contextQuestions = config.contextQuestionIds;
        } else {
            const targetIndex = config.survey.surveyQuestions.findIndex(q => q.id === targetQuestionId);
            const startIndex = Math.max(0, targetIndex - 5);
            contextQuestions = config.survey.surveyQuestions
                .slice(startIndex, targetIndex)
                .map(q => q.id);
        }

        // Include text-content and questions in order
        let lastTextContent = '';
        let displayNumber = 1; // Track question numbering
        for (const questionId of contextQuestions) {
            const question = this.findQuestion(config.survey, questionId);
            if (!question) continue;

            if (question.type === 'text-content') {
                lastTextContent = question.text;
                prompt += `${lastTextContent}\n\n`;
            } else {
                const answer = this.getParticipantAnswer(participant, questionId);
                prompt += this.formatQuestionWithAnswer(question, answer, displayNumber);
                displayNumber++;
                prompt += '\n';
            }
        }

        prompt += '</SURVEY>';

        // Add custom prefix if provided
        if (config.blueprintTemplate?.promptPrefix) {
            prompt = config.blueprintTemplate.promptPrefix + '\n\n' + prompt;
        }

        return prompt;
    }

    /**
     * Format a question for the prompt
     */
    private static formatQuestionPrompt(question: SurveyQuestion, introText?: string, displayNumber?: number): string {
        let prompt = '';
        
        if (introText) {
            prompt += `${introText}\n\n`;
        }
        
        prompt += 'How would you most likely respond to the following question?\n';
        // Use displayNumber if provided, otherwise don't show a number
        const numberPrefix = displayNumber !== undefined ? `${displayNumber}. ` : '';
        prompt += `${numberPrefix}${question.text}\n`;

        if (question.type === 'single-select' || question.type === 'multi-select') {
            question.options.forEach((option, idx) => {
                const letter = String.fromCharCode(97 + idx); // a, b, c, ...
                prompt += `    ${letter}. ${option}\n`;
            });
        }

        return prompt;
    }

    /**
     * Format a question with its answer for context
     */
    private static formatQuestionWithAnswer(
        question: SurveyQuestion,
        answer: string | string[] | null,
        displayNumber: number
    ): string {
        let formatted = `${displayNumber}. ${question.text}\n`;

        if (question.type === 'single-select' || question.type === 'multi-select') {
            question.options.forEach((option, idx) => {
                const letter = String.fromCharCode(97 + idx);
                formatted += `    ${letter}. ${option}`;
                
                if (answer) {
                    const answers = Array.isArray(answer) ? answer : [answer];
                    if (answers.includes(option)) {
                        formatted += ' ✓';
                    }
                }
                formatted += '\n';
            });
            formatted += `    Answer: ${Array.isArray(answer) ? answer.join(', ') : answer}\n`;
        } else if (question.type === 'open-ended') {
            formatted += `    Answer: ${answer || '[No response]'}\n`;
        }

        return formatted;
    }

    /**
     * Generate evaluation points based on the participant's actual answer
     */
    private static generateEvaluationPoints(
        question: SurveyQuestion,
        participantAnswer: string | string[] | null
    ): { points: string[], shouldNot: string[] } {
        const points: string[] = [];
        const shouldNot: string[] = [];

        if (question.type === 'single-select') {
            if (participantAnswer) {
                const selectedIndex = question.options.indexOf(participantAnswer as string);
                if (selectedIndex !== -1) {
                    const letter = String.fromCharCode(97 + selectedIndex);
                    points.push(`Selects option ${letter} (${participantAnswer})`);
                    points.push(`Response indicates "${participantAnswer}"`);
                }

                // Add should_not for other options
                question.options.forEach((option, idx) => {
                    if (option !== participantAnswer) {
                        const letter = String.fromCharCode(97 + idx);
                        shouldNot.push(`Selects option ${letter} (${option})`);
                    }
                });
            }
        } else if (question.type === 'multi-select') {
            const answers = Array.isArray(participantAnswer) ? participantAnswer : [];
            answers.forEach(answer => {
                const idx = question.options.indexOf(answer);
                if (idx !== -1) {
                    const letter = String.fromCharCode(97 + idx);
                    points.push(`Includes option ${letter} (${answer})`);
                }
            });

            // Add should_not for unselected options
            question.options.forEach((option, idx) => {
                if (!answers.includes(option)) {
                    const letter = String.fromCharCode(97 + idx);
                    shouldNot.push(`Selects option ${letter} (${option}) as primary choice`);
                }
            });
        } else if (question.type === 'open-ended' && participantAnswer) {
            // For open-ended, we evaluate based on semantic content
            points.push(`Response addresses the core question meaningfully`);
            points.push(`Response aligns with the participant's demographic profile and previous answers`);
        }

        return { points, shouldNot };
    }

    /**
     * Format the ideal response for evaluation
     */
    private static formatIdealResponse(
        question: SurveyQuestion,
        participantAnswer: string | string[] | null
    ): string {
        if (!participantAnswer) {
            return '[No response provided]';
        }

        if (question.type === 'single-select') {
            const idx = question.options.indexOf(participantAnswer as string);
            if (idx !== -1) {
                const letter = String.fromCharCode(97 + idx);
                return `${letter}. ${participantAnswer}`;
            }
        } else if (question.type === 'multi-select') {
            const answers = Array.isArray(participantAnswer) ? participantAnswer : [];
            return answers.map(answer => {
                const idx = question.options.indexOf(answer);
                const letter = idx !== -1 ? String.fromCharCode(97 + idx) : '?';
                return `${letter}. ${answer}`;
            }).join(', ');
        }

        return participantAnswer as string;
    }

    /**
     * Helper method to find a question in the survey
     */
    private static findQuestion(survey: Survey, questionId: string): SurveyQuestion | undefined {
        return [...survey.demographicQuestions, ...survey.surveyQuestions]
            .find(q => q.id === questionId);
    }

    /**
     * Get participant's answer for a specific question
     */
    private static getParticipantAnswer(
        participant: Participant,
        questionId: string
    ): string | string[] | null {
        const response = participant.responses.find(r => r.questionId === questionId);
        return response?.answer || null;
    }

    /**
     * Select participants based on configuration
     */
    private static selectParticipants(
        allParticipants: Participant[],
        selection: 'all' | 'random' | 'first' | 'specific',
        count?: number,
        specificIds?: string[]
    ): Participant[] {
        switch (selection) {
            case 'all':
                return allParticipants;
            case 'first':
                return allParticipants.slice(0, count || 1);
            case 'random':
                const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, count || 1);
            case 'specific':
                if (!specificIds) return [];
                return allParticipants.filter(p => specificIds.includes(p.id));
            default:
                return allParticipants;
        }
    }

    /**
     * Format demographic key for display
     */
    private static formatDemographicKey(key: string): string {
        return key
            .split(/[_-]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Export survey data to JSON format
     */
    static exportSurveyData(survey: Survey): string {
        return JSON.stringify(survey, null, 2);
    }

    /**
     * Import survey data from JSON
     */
    static importSurveyData(jsonData: string): Survey {
        try {
            const data = JSON.parse(jsonData);
            // Basic validation
            if (!data.id || !data.title || !data.surveyQuestions || !data.participants) {
                throw new Error('Invalid survey data structure');
            }
            return data as Survey;
        } catch (error) {
            throw new Error(`Failed to parse survey data: ${error}`);
        }
    }
}