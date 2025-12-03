/**
 * Survey data structure types for generating Weval Blueprints
 */

export type QuestionType = 'single-select' | 'multi-select' | 'open-ended' | 'text-content';

export interface BaseQuestion {
    id: string;
    type: QuestionType;
    text: string;
}

export interface SingleSelectQuestion extends BaseQuestion {
    type: 'single-select';
    options: string[];
}

export interface MultiSelectQuestion extends BaseQuestion {
    type: 'multi-select';
    options: string[];
}

export interface OpenEndedQuestion extends BaseQuestion {
    type: 'open-ended';
}

export interface TextContent extends BaseQuestion {
    type: 'text-content';
}

export type SurveyQuestion = 
    | SingleSelectQuestion 
    | MultiSelectQuestion 
    | OpenEndedQuestion 
    | TextContent;

export interface ParticipantResponse {
    questionId: string;
    answer: string | string[] | null;
}

export interface Participant {
    id: string;
    demographics: Record<string, string | number | boolean>;
    responses: ParticipantResponse[];
}

export interface Survey {
    id: string;
    title: string;
    description?: string;
    demographicQuestions: SurveyQuestion[];
    surveyQuestions: SurveyQuestion[];
    participants: Participant[];
}

export interface SurveyBlueprintConfig {
    survey: Survey;
    targetQuestionIds: string[];
    contextQuestionIds?: string[];
    includeDemographics?: boolean | string[];
    participantSelection?: 'all' | 'random' | 'first' | 'specific';
    participantCount?: number;
    participantIds?: string[];
    modelConfig?: {
        models?: string[];
        temperature?: number;
        judgeModels?: string[];
    };
    blueprintTemplate?: {
        systemPrompt?: string;
        promptPrefix?: string;
        promptSuffix?: string;
        responseFormat?: 'letter-only' | 'full-answer' | 'explanation';
    };
}

export interface GeneratedBlueprint {
    participantId: string;
    configId: string;
    configTitle: string;
    prompts: Array<{
        id: string;
        promptText: string;
        points: string[];
        should_not?: string[];
        idealResponse: string;
    }>;
}