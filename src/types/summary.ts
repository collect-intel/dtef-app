// Neutral shared summary types for both CLI and UI

export interface HeadlineStatInfo {
  configId: string;
  configTitle: string;
  value: number;
  description?: string;
  latestRunLabel?: string;
  latestRunTimestamp?: string;
}

export interface TopModelStatInfo {
  modelId: string;
  overallAverageHybridScore: number;
  overallAverageSimilarityScore?: number;
  overallAverageCoverageScore?: number;
  runsParticipatedIn: number;
  uniqueConfigsParticipatedIn: number;
  runs: Array<{
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    hybridScore?: number | null;
    similarityScore?: number | null;
    coverageScore?: number | null;
  }>;
}

export interface DimensionScoreInfo {
  modelId: string;
  averageScore: number;
  runsCount: number;
  latestScores?: Array<{
    configTitle: string;
    runUrl: string;
    score: number;
  }>;
}

export interface DimensionLeaderboard {
  dimension: string;
  leaderboard: DimensionScoreInfo[];
}

export interface PotentialDriftInfo {
  configId: string;
  configTitle: string;
  runLabel: string;
  modelId: string;
  minScore: number;
  maxScore: number;
  scoreRange: number;
  runsCount: number;
  oldestTimestamp: string;
  newestTimestamp: string;
  minScoreTimestamp: string;
  maxScoreTimestamp: string;
}


