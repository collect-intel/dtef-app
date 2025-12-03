import {
    EvaluationStrategyConfig,
    IterativeProfileHoldoutConfig,
    EvaluationStrategyResult,
    StageEvaluation
} from '@/types/surveyEvaluationStrategies';
import { Survey, SurveyBlueprintConfig, Participant } from '@/types/survey';
import { WevalConfig, WevalPromptConfig } from '@/types/shared';
import { SurveyBlueprintService } from './surveyBlueprintService';

/**
 * Service for generating survey evaluations using different strategies
 */
export class SurveyEvaluationStrategies {
    
    /**
     * Main entry point for generating evaluations based on strategy
     */
    static async generateEvaluations(
        config: EvaluationStrategyConfig
    ): Promise<EvaluationStrategyResult> {
        switch (config.strategy) {
            case 'iterative-profile-holdout':
                return this.generateIterativeProfileHoldout(config);
            
            // Future strategies
            case 'iterative-demographic-calibration':
                throw new Error('Iterative demographic calibration strategy not yet implemented');
            
            case 'relative-propensity':
                throw new Error('Relative propensity strategy not yet implemented');
            
            default:
                throw new Error(`Unknown evaluation strategy: ${(config as any).strategy}`);
        }
    }
    
    /**
     * Generate Iterative Profile Holdout evaluations
     */
    private static async generateIterativeProfileHoldout(
        config: IterativeProfileHoldoutConfig
    ): Promise<EvaluationStrategyResult> {
        const { survey, anchorQuestionIds, stages } = config;
        
        // Validate anchor questions exist
        this.validateQuestionIds(survey, anchorQuestionIds, 'anchor');
        
        // Select participants
        const participants = this.selectParticipants(
            survey.participants,
            config.participantSelection || 'all',
            config.participantCount,
            config.participantIds
        );
        
        const blueprints: WevalConfig[] = [];
        const blueprintMapping: any[] = [];
        
        // Get all non-anchor, non-text survey questions for context selection
        const availableContextQuestions = survey.surveyQuestions
            .filter(q => 
                q.type !== 'text-content' && 
                !anchorQuestionIds.includes(q.id)
            )
            .map(q => q.id);
        
        // Generate evaluations for each participant and stage
        for (const participant of participants) {
            // Track cumulative context across stages
            let cumulativeContext: string[] = [];
            
            for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
                const stage = stages[stageIndex];
                const stageName = stage.name || `Stage ${stageIndex + 1}`;
                
                // Determine context questions for this stage
                const contextQuestionIds = this.selectContextQuestions(
                    availableContextQuestions,
                    stage,
                    stageIndex,
                    cumulativeContext
                );
                
                // Update cumulative context for next stage
                cumulativeContext = contextQuestionIds;
                
                // Generate blueprints for each anchor question at this stage
                const stageBlueprints = await this.generateStageBlueprints(
                    config,
                    participant,
                    stage,
                    stageIndex,
                    contextQuestionIds,
                    anchorQuestionIds,
                    stageName
                );
                
                for (const blueprint of stageBlueprints) {
                    blueprints.push(blueprint);
                    blueprintMapping.push({
                        blueprintId: blueprint.configId!,
                        participantId: participant.id,
                        stageName: stageName,
                        stageIndex
                    });
                }
            }
        }
        
        return {
            config,
            blueprints,
            metadata: {
                totalEvaluations: blueprints.length,
                participantCount: participants.length,
                stageCount: stages.length,
                generatedAt: new Date().toISOString(),
                blueprintMapping
            }
        };
    }
    
    /**
     * Generate blueprints for a specific stage
     */
    private static async generateStageBlueprints(
        config: IterativeProfileHoldoutConfig,
        participant: Participant,
        stage: IterativeProfileHoldoutConfig['stages'][0],
        stageIndex: number,
        contextQuestionIds: string[],
        anchorQuestionIds: string[],
        stageName: string
    ): WevalConfig[] {
        const { survey } = config;
        
        // Create prompts for ALL anchor questions
        const prompts: WevalPromptConfig[] = await Promise.all(
            anchorQuestionIds.map(anchorId => 
                this.createPromptForAnchor(
                    survey,
                    participant,
                    anchorId,
                    contextQuestionIds,
                    stage.includeDemographics !== false
                )
            )
        );
        
        const blueprintId = `${survey.id}-p${participant.id}-stage${stageIndex + 1}-${stageName.toLowerCase().replace(/\s+/g, '-')}`;
        
        // Return a single blueprint containing all anchor questions for this stage
        return [{
            configId: blueprintId,
            configTitle: `${survey.title} - ${participant.id} - ${stageName}`,
            description: `${stageName} evaluation for participant ${participant.id}`,
            models: config.modelConfig?.models || ['openai:gpt-4o-mini', 'anthropic:claude-3-5-haiku-latest'],
            temperature: config.modelConfig?.temperature || 0.7,
            prompts, // All anchor questions in one blueprint
            tags: [
                'iterative-profile-holdout',
                `stage-${stageIndex + 1}`,
                stageName.toLowerCase().replace(/\s+/g, '-'),
                `participant-${participant.id}`,
                survey.id
            ],
            evaluationConfig: config.modelConfig?.judgeModels ? {
                'llm-coverage': {
                    judgeModels: config.modelConfig.judgeModels
                }
            } : undefined
        }];
    }
    
    /**
     * Create a prompt for a specific anchor question
     */
    private static async createPromptForAnchor(
        survey: Survey,
        participant: Participant,
        anchorQuestionId: string,
        contextQuestionIds: string[],
        includeDemographics: boolean
    ): WevalPromptConfig {
        // Build the configuration for the survey blueprint service
        const blueprintConfig: SurveyBlueprintConfig = {
            survey,
            targetQuestionIds: [anchorQuestionId],
            contextQuestionIds: contextQuestionIds.length > 0 ? contextQuestionIds : undefined,
            includeDemographics,
            participantSelection: 'specific',
            participantIds: [participant.id]
        };
        
        // Generate a temporary blueprint to get the prompt structure
        const tempBlueprints = await SurveyBlueprintService.generateBlueprints(blueprintConfig);
        
        // Extract and return the first (and only) prompt
        return tempBlueprints[0].prompts[0];
    }
    
    /**
     * Select context questions for a stage
     */
    private static selectContextQuestions(
        availableQuestions: string[],
        stage: IterativeProfileHoldoutConfig['stages'][0],
        stageIndex: number,
        previousContext: string[]
    ): string[] {
        const selection = stage.contextSelection;
        
        switch (selection.type) {
            case 'explicit':
                // Return exactly the questions specified
                return selection.questionIds.filter(id => availableQuestions.includes(id));
            
            case 'cumulative':
                // Add N more questions to what we had before
                if (stageIndex === 0) {
                    // First stage: take first N questions
                    return availableQuestions.slice(0, Math.min(selection.addCount, availableQuestions.length));
                } else {
                    // Later stages: add next N questions
                    const previousCount = previousContext.length;
                    const newQuestions = availableQuestions.slice(
                        previousCount,
                        previousCount + selection.addCount
                    );
                    return [...previousContext, ...newQuestions];
                }
            
            case 'total':
                // Show total of N questions (cumulative)
                const targetCount = Math.min(selection.totalCount, availableQuestions.length);
                if (previousContext.length >= targetCount) {
                    // Already have enough or more
                    return previousContext.slice(0, targetCount);
                } else {
                    // Need to add more to reach target
                    const needed = targetCount - previousContext.length;
                    const newQuestions = availableQuestions
                        .filter(q => !previousContext.includes(q))
                        .slice(0, needed);
                    return [...previousContext, ...newQuestions];
                }
            
            case 'all-available':
                // Return all non-anchor questions
                return availableQuestions;
            
            case 'random':
                // Randomly select N questions (not cumulative)
                const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, Math.min(selection.count, shuffled.length));
            
            default:
                throw new Error(`Unknown context selection type: ${(selection as any).type}`);
        }
    }
    
    /**
     * Validate that question IDs exist in the survey
     */
    private static validateQuestionIds(
        survey: Survey,
        questionIds: string[],
        type: string
    ): void {
        const allQuestionIds = [
            ...survey.demographicQuestions.map(q => q.id),
            ...survey.surveyQuestions.map(q => q.id)
        ];
        
        for (const id of questionIds) {
            if (!allQuestionIds.includes(id)) {
                throw new Error(`${type} question ID '${id}' not found in survey`);
            }
        }
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
}