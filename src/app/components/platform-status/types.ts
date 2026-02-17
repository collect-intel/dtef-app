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
  expectedSummaryFiles: number;
  foundSummaryFiles: number;
  unidentifiedFiles: number;
}

export interface PlatformStatusResponse {
  blueprints: BlueprintStatusItem[];
  summaryFiles: SummaryFileItem[];
  stats: ProgressStats;
  generatedAt: string;
  errors: string[];
}
