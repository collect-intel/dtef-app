export interface BlueprintStatusItem {
  configId: string;
  title?: string;
  runCount: number;
  lastRun: string | null; // ISO timestamp or null
  tags?: string[];
  inGitHub: boolean;
  inS3: boolean;
}

export interface SummaryFileItem {
  name: string;
  path: string;
  expectedPurpose: string;
  description?: string;
  pageLinks?: { label: string; href: string }[];
  category: 'core' | 'discovered' | 'unidentified';
  found: boolean;
  lastModified?: string;
  size?: number;
}

export interface ProgressStats {
  totalGitHubConfigs: number;
  configsWithRuns: number;
  configsWithoutRuns: number;
  orphanedConfigs: number;
  recentRunConfigs: number; // configs with a run in last 7 days
  staleRunConfigs: number; // inGitHub + inS3 but lastRun > 7 days ago
  periodicConfigs: number; // inGitHub configs with _periodic tag
  periodicWithRecentRuns: number; // periodic + lastRun < 7 days
  periodicNeverRun: number; // periodic + no runs at all
  expectedSummaryFiles: number;
  foundSummaryFiles: number;
  unidentifiedFiles: number;
}

export interface QueueStatus {
  active: number;
  queued: number;
  totalEnqueued: number;
  totalCompleted: number;
  totalFailed: number;
  lastCompletedId: string | null;
  lastCompletedAt: string | null;
  lastFailedId: string | null;
  lastFailedAt: string | null;
  processStartedAt: string;
  uptimeSeconds: number;
}

export interface TimingRunPoint {
  timestamp: string;
  configId: string;
  configTitle?: string;
  totalDurationMs: number;
  generationDurationMs: number;
  evaluationDurationMs: number;
  saveDurationMs: number;
  slowestModel?: { modelId: string; avgMs: number };
  fastestModel?: { modelId: string; avgMs: number };
}

export interface ModelSpeedEntry {
  modelId: string;
  avgMs: number;
  appearances: number;
  wasSlowest: number;
  wasFastest: number;
}

export interface TimingStats {
  runsWithTiming: number;
  totalRuns: number;
  avgDurationMs: number;
  medianDurationMs: number;
  totalTimeSpentMs: number;
  avgGenerationPct: number;
  avgEvaluationPct: number;
  avgSavePct: number;
}

export interface TimingInsights {
  runs: TimingRunPoint[];
  modelSpeeds: ModelSpeedEntry[];
  stats: TimingStats;
}

export interface PlatformStatusResponse {
  blueprints: BlueprintStatusItem[];
  summaryFiles: SummaryFileItem[];
  stats: ProgressStats;
  queue: QueueStatus;
  timingInsights: TimingInsights | null;
  generatedAt: string;
  errors: string[];
}
