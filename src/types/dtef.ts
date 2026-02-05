/**
 * DTEF (Digital Twin Evaluation Framework) Type Definitions
 *
 * These types support demographic aggregate survey data and evaluation,
 * where responses are represented as distributions (percentages) across
 * demographic segments rather than individual participant responses.
 *
 * @module types/dtef
 */

import { QuestionType, SurveyQuestion } from './survey';

// Re-export useful types from survey.ts
export type { QuestionType, SurveyQuestion } from './survey';

/**
 * Represents a demographic segment (e.g., "Men aged 18-29 in USA").
 * Each segment aggregates responses from multiple survey respondents
 * who share the same demographic attributes.
 */
export interface DemographicSegment {
  /** Unique identifier for this segment */
  id: string;

  /** Human-readable label (e.g., "Men, 18-29, USA") */
  label: string;

  /**
   * Demographic attributes that define this segment.
   * Keys are attribute names (e.g., "gender", "ageGroup", "country"),
   * values are the specific values for this segment.
   */
  attributes: Record<string, string>;

  /** Number of actual survey respondents this segment represents */
  sampleSize: number;
}

/**
 * Response distribution for a single question within a demographic segment.
 * The distribution array contains percentages for each answer option.
 */
export interface DemographicResponse {
  /** ID of the question this response is for */
  questionId: string;

  /**
   * Percentage distribution across answer options.
   * Array indices correspond to question option indices.
   * Values should sum to approximately 100 (may have small rounding differences).
   *
   * @example
   * // For a question with options ["Agree", "Neutral", "Disagree"]:
   * distribution: [45.5, 30.2, 24.3]  // 45.5% Agree, 30.2% Neutral, 24.3% Disagree
   */
  distribution: number[];
}

/**
 * A demographic segment with its response data.
 * Combines segment metadata with actual survey responses.
 */
export interface SegmentWithResponses extends DemographicSegment {
  /** Response distributions for each question */
  responses: DemographicResponse[];
}

/**
 * Complete survey data structure for DTEF.
 * Contains survey metadata, questions, and demographic segment responses.
 */
export interface DTEFSurveyData {
  /** Unique identifier for the survey */
  surveyId: string;

  /** Human-readable survey name */
  surveyName: string;

  /** Optional description of the survey */
  description?: string;

  /** Source of the survey data (e.g., "Global Dialogues 2024") */
  source?: string;

  /**
   * Survey questions with their options.
   * Keys are question IDs, values are question definitions.
   */
  questions: Record<string, {
    /** Question text */
    text: string;
    /** Type of question (primarily single-select for DTEF) */
    type: QuestionType;
    /** Answer options for select-type questions */
    options?: string[];
  }>;

  /**
   * Demographic segments with their response distributions.
   * Each segment represents a demographic group's aggregated responses.
   */
  segments: SegmentWithResponses[];
}

/**
 * Configuration for generating DTEF blueprints from survey data.
 */
export interface DTEFBlueprintConfig {
  /** Survey data to generate blueprints from */
  surveyData: DTEFSurveyData;

  /** IDs of questions to include in generated blueprints */
  targetQuestionIds: string[];

  /** IDs of questions to include as context (optional) */
  contextQuestionIds?: string[];

  /**
   * Which segments to include.
   * 'all' includes all segments, 'specific' uses segmentIds.
   * @default 'all'
   */
  segmentSelection?: 'all' | 'specific';

  /** Specific segment IDs when segmentSelection is 'specific' */
  segmentIds?: string[];

  /**
   * Maximum token budget for prompts.
   * Used to control how much context is included per prompt.
   */
  tokenBudget?: number;

  /** Model configuration for evaluation */
  modelConfig?: {
    /** Models to evaluate */
    models?: string[];
    /** Model temperature setting */
    temperature?: number;
  };

  /** Blueprint template customization */
  blueprintTemplate?: {
    /** Custom system prompt */
    systemPrompt?: string;
    /** Text to prepend to each prompt */
    promptPrefix?: string;
    /** Text to append to each prompt */
    promptSuffix?: string;
  };
}

/**
 * A single prompt within a DTEF blueprint.
 * Contains the prompt text and expected demographic response distribution.
 */
export interface DTEFPrompt {
  /** Unique identifier for this prompt */
  id: string;

  /** The full prompt text to send to the model */
  promptText: string;

  /**
   * Expected response distribution from the demographic segment.
   * Each number represents the expected percentage for that option.
   */
  expectedDistribution: number[];

  /** Labels for each option (for display and reference) */
  optionLabels: string[];

  /** Reference to the question ID this prompt is based on */
  questionId: string;

  /** Reference to the demographic segment this prompt targets */
  segmentId: string;
}

/**
 * A generated DTEF blueprint for a specific demographic segment.
 */
export interface DTEFGeneratedBlueprint {
  /** ID of the demographic segment this blueprint targets */
  segmentId: string;

  /** Segment label for human readability */
  segmentLabel: string;

  /** Configuration/blueprint ID */
  configId: string;

  /** Human-readable title */
  configTitle: string;

  /** Array of prompts to evaluate */
  prompts: DTEFPrompt[];

  /** Segment attributes for reference */
  segmentAttributes: Record<string, string>;
}

/**
 * Result of evaluating a model's response against expected distribution.
 */
export interface DistributionMetricResult {
  /** The prompt that was evaluated */
  promptId: string;

  /** Expected distribution from survey data */
  expectedDistribution: number[];

  /** Actual distribution from model responses (if parseable) */
  actualDistribution?: number[];

  /** Raw model response text */
  rawResponse: string;

  /**
   * Similarity score between expected and actual distributions.
   * Higher is better. Typically 0-1 scale.
   */
  similarityScore?: number;

  /**
   * Which metric was used for comparison.
   * Options: 'cosine', 'kl-divergence', 'js-divergence', 'earth-mover'
   */
  metricUsed?: string;

  /** Whether the response could be parsed into a distribution */
  parseable: boolean;

  /** Error message if parsing failed */
  parseError?: string;
}

/**
 * Aggregated results for a single model across all prompts in an evaluation.
 */
export interface DTEFModelResult {
  /** Model identifier */
  modelId: string;

  /** Display name for the model */
  modelName: string;

  /** Average similarity score across all prompts */
  averageScore: number;

  /** Number of prompts that could be parsed */
  parseableCount: number;

  /** Total number of prompts evaluated */
  totalPrompts: number;

  /** Parse success rate (parseableCount / totalPrompts) */
  parseRate: number;

  /** Individual prompt results */
  promptResults: DistributionMetricResult[];
}

/**
 * Complete evaluation run results for DTEF.
 */
export interface DTEFEvaluationResults {
  /** Unique identifier for this evaluation run */
  runId: string;

  /** Blueprint/config ID that was evaluated */
  configId: string;

  /** Timestamp when evaluation started */
  startedAt: string;

  /** Timestamp when evaluation completed */
  completedAt: string;

  /** Demographic segment that was evaluated */
  segment: DemographicSegment;

  /** Results for each model evaluated */
  modelResults: DTEFModelResult[];

  /** Summary statistics */
  summary: {
    /** Best performing model ID */
    bestModelId: string;
    /** Best model's average score */
    bestScore: number;
    /** Overall average across all models */
    overallAverage: number;
    /** Number of models evaluated */
    modelCount: number;
  };
}

/**
 * Leaderboard entry for a model's demographic prediction performance.
 */
export interface DTEFLeaderboardEntry {
  /** Model identifier */
  modelId: string;

  /** Display name for the model */
  modelName: string;

  /** Average score across all demographic segments */
  overallScore: number;

  /** Number of segments evaluated */
  segmentsEvaluated: number;

  /** Number of questions evaluated */
  questionsEvaluated: number;

  /** Breakdown by demographic attribute (optional) */
  attributeBreakdown?: Record<string, {
    attribute: string;
    value: string;
    score: number;
    count: number;
  }[]>;

  /** Last evaluation timestamp */
  lastEvaluatedAt: string;
}

/**
 * Type guard to check if a value is a valid distribution array.
 * A valid distribution has numbers that approximately sum to 100.
 */
export function isValidDistribution(distribution: unknown): distribution is number[] {
  if (!Array.isArray(distribution)) return false;
  if (distribution.length === 0) return false;
  if (!distribution.every(n => typeof n === 'number' && !isNaN(n) && n >= 0)) return false;

  const sum = distribution.reduce((a, b) => a + b, 0);
  // Allow for some rounding error (should be approximately 100)
  return sum >= 99 && sum <= 101;
}

/**
 * Type guard to check if a segment has valid responses.
 */
export function isValidSegmentWithResponses(segment: unknown): segment is SegmentWithResponses {
  if (typeof segment !== 'object' || segment === null) return false;
  const s = segment as Record<string, unknown>;

  return (
    typeof s.id === 'string' &&
    typeof s.label === 'string' &&
    typeof s.attributes === 'object' && s.attributes !== null &&
    typeof s.sampleSize === 'number' &&
    Array.isArray(s.responses)
  );
}
