/**
 * Experiment Tracking Types
 *
 * Types for managing A/B experiments across evaluation conditions.
 * Experiments compare different evaluation configurations (context formats,
 * reasoning modes, eval types) to measure their impact on accuracy.
 *
 * @module types/experiment
 */

export type ExperimentStatus = 'planned' | 'running' | 'completed' | 'failed';
export type ExperimentConclusion = 'promoted' | 'rejected' | 'needs-more-data' | null;

export interface ExperimentCondition {
    name: string;
    evalType: string;
    contextFormat: string;
    reasoningMode: string;
    [key: string]: unknown;
}

export interface ExperimentDesign {
    independentVariable: string;
    conditions: ExperimentCondition[];
    conditionMap?: Record<string, string[]>;  // condition name → configIds
    segments: string;
    models: string;
    subjectQuestions: string;
}

export interface ExperimentResults {
    summary: string;
    conditionScores?: Record<string, number>;
    pValue?: number;
    effectSize?: number;
    detailedResultsPath?: string;
    perConditionStats?: Record<string, {
        mean: number;
        stddev: number;
        n: number;
        scores: number[];
    }>;
    analyzedAt?: string;
    configsAnalyzed?: number;
    configsMissing?: number;
}

export interface ExperimentRecord {
    id: string;
    title: string;
    status: ExperimentStatus;
    createdAt: string;
    completedAt: string | null;
    hypothesis: string;
    successCriteria: string;
    design: ExperimentDesign;
    configIds: string[];
    results: ExperimentResults | null;
    conclusion: ExperimentConclusion;
    notes: string;
}

export interface ExperimentIndex {
    experiments: ExperimentRecord[];
    lastUpdated: string;
}
