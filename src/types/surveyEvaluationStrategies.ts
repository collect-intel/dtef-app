/**
 * Survey Evaluation Strategy Types
 * 
 * These strategies define different ways to generate evaluations from survey data
 * to measure model capabilities in predicting human responses.
 */

import { Survey, SurveyBlueprintConfig } from './survey';
import { WevalConfig } from './shared';

/**
 * Base configuration for all evaluation strategies
 */
export interface BaseStrategyConfig {
    survey: Survey;
    participantSelection?: 'all' | 'random' | 'first' | 'specific';
    participantCount?: number;
    participantIds?: string[];
    modelConfig?: {
        models?: string[];
        temperature?: number;
        judgeModels?: string[];
    };
}

/**
 * Iterative Profile Holdout Strategy
 * 
 * Measures how predictive accuracy improves as more context is revealed.
 * Creates multiple evaluation stages with increasing amounts of information.
 */
export interface IterativeProfileHoldoutConfig extends BaseStrategyConfig {
    strategy: 'iterative-profile-holdout';
    
    /**
     * The questions to predict (hold out) at each stage
     * These remain constant across all stages
     */
    anchorQuestionIds: string[];
    
    /**
     * Configuration for context stages
     */
    stages: Array<{
        /**
         * Name of this stage (e.g., "First Impression", "Developing View")
         * If not provided, will be auto-generated as "Stage 1", "Stage 2", etc.
         */
        name?: string;
        
        /**
         * Whether to include demographics at this stage (defaults to true)
         */
        includeDemographics?: boolean;
        
        /**
         * How to select context questions for this stage.
         * Must use exactly one of these methods:
         */
        contextSelection: 
            /**
             * Explicitly specify which questions to show (cumulative)
             * These are the TOTAL questions shown at this stage
             */
            | { type: 'explicit'; questionIds: string[] }
            
            /**
             * Add N more questions to what was shown in previous stage
             * For stage 0: shows first N questions
             * For stage 1+: adds next N questions after previous stage
             */
            | { type: 'cumulative'; addCount: number }
            
            /**
             * Show total of N questions at this stage
             * Will include all questions from previous stages plus more to reach N
             */
            | { type: 'total'; totalCount: number }
            
            /**
             * Show all available non-anchor questions
             */
            | { type: 'all-available' }
            
            /**
             * Randomly select N questions (not cumulative)
             */
            | { type: 'random'; count: number };
    }>;
}

/**
 * Iterative Demographic Calibration Strategy (future)
 */
export interface IterativeDemographicCalibrationConfig extends BaseStrategyConfig {
    strategy: 'iterative-demographic-calibration';
    // Implementation details to be determined
}

/**
 * Relative Propensity Strategy (future)
 */
export interface RelativePropensityConfig extends BaseStrategyConfig {
    strategy: 'relative-propensity';
    // Implementation details to be determined
}

/**
 * Union type for all evaluation strategies
 */
export type EvaluationStrategyConfig = 
    | IterativeProfileHoldoutConfig
    | IterativeDemographicCalibrationConfig
    | RelativePropensityConfig;

/**
 * Result of applying an evaluation strategy
 */
export interface EvaluationStrategyResult {
    /**
     * The strategy configuration used
     */
    config: EvaluationStrategyConfig;
    
    /**
     * Generated blueprint configurations
     * Each blueprint represents one evaluation
     */
    blueprints: WevalConfig[];
    
    /**
     * Metadata about the generation
     */
    metadata: {
        totalEvaluations: number;
        participantCount: number;
        stageCount?: number;
        generatedAt: string;
        /**
         * Mapping of blueprint IDs to their stage/participant info
         */
        blueprintMapping: Array<{
            blueprintId: string;
            participantId: string;
            stageName?: string;
            stageIndex?: number;
        }>;
    };
}

/**
 * Stage result for iterative strategies
 */
export interface StageEvaluation {
    stageName: string;
    stageIndex: number;
    participantId: string;
    blueprintId: string;
    contextQuestionCount: number;
    contextQuestionIds: string[];
}