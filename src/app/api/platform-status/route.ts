import { NextResponse } from 'next/server';
import axios from 'axios';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BLUEPRINT_CONFIG_REPO_SLUG } from '@/lib/configConstants';
import { getS3Client, getBucketName, getAllBlueprintsSummary, getHomepageSummary, getLatestRunsSummary, LatestRunSummaryItem } from '@/lib/storageService';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { generateBlueprintIdFromPath } from '@/app/utils/blueprintIdUtils';
import { getQueueStatus } from '@/lib/evaluation-queue';
import type { PlatformStatusResponse, BlueprintStatusItem, SummaryFileItem, ProgressStats, QueueStatus, TimingInsights, TimingRunPoint, ModelSpeedEntry } from '@/app/components/platform-status/types';

// Known summary files with metadata
interface CoreFileInfo {
  name: string;
  description: string;
  pageLinks: { label: string; href: string }[];
}

const KNOWN_SUMMARY_FILES: Record<string, CoreFileInfo> = {
  'live/aggregates/homepage_summary.json': {
    name: 'Homepage Summary',
    description: 'Aggregate stats, model drift indicators, featured blueprints, and leaderboard data for the main dashboard.',
    pageLinks: [{ label: 'Homepage', href: '/' }],
  },
  'live/aggregates/latest_runs_summary.json': {
    name: 'Latest Runs Summary',
    description: 'Most recent evaluation runs across all models and blueprints.',
    pageLinks: [{ label: 'Homepage', href: '/' }, { label: 'Latest Runs', href: '/latest' }],
  },
  'live/aggregates/regressions-summary.json': {
    name: 'Regressions Summary',
    description: 'Tracks model performance regressions and improvements across versions, grouped by maker and tier.',
    pageLinks: [{ label: 'Regressions', href: '/regressions' }],
  },
  'live/aggregates/all_blueprints_summary.json': {
    name: 'All Blueprints Summary',
    description: 'Metadata for every blueprint config. Used as fallback for homepage and powers the browse/filter views.',
    pageLinks: [{ label: 'All Models', href: '/all' }, { label: 'Model Cards', href: '/cards' }],
  },
  'live/aggregates/dtef_summary.json': {
    name: 'DTEF Demographics Summary',
    description: 'Aggregated demographic evaluation results showing model accuracy across demographic segments.',
    pageLinks: [{ label: 'Demographics', href: '/demographics' }],
  },
  'live/aggregates/search-index.json': {
    name: 'Search Index',
    description: 'Full-text search index for blueprint configs and metadata, powered by Fuse.js.',
    pageLinks: [{ label: 'Search (global)', href: '/api/search' }],
  },
  'live/aggregates/pain-points.json': {
    name: 'Pain Points',
    description: 'Aggregated evaluation pain points and common failure patterns across models.',
    pageLinks: [],
  },
};

// Pattern-based classification for files not in the known list
function classifyS3Key(key: string): string | null {
  if (key.match(/^live\/aggregates\/dtef_summary_.+\.json$/)) return 'DTEF Survey Summary (per-survey)';
  if (key.match(/^live\/models\/summaries\/.+\.json$/)) return 'Model Summary';
  if (key.match(/^live\/models\/ndeltas\/.+\.json$/) && !key.endsWith('manifest.json')) return 'Model N-Delta';
  if (key.match(/^live\/models\/cards\/.+\.json$/)) return 'Model Card';
  return null;
}

async function fetchGitHubConfigs(): Promise<Set<string>> {
  const configIds = new Set<string>();
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;

  const url = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/git/trees/main?recursive=1`;
  const { data } = await axios.get(url, { headers });

  for (const node of data.tree || []) {
    if (
      node.type === 'blob' &&
      node.path.startsWith('blueprints/') &&
      !node.path.startsWith('blueprints/pr-evals/') &&
      (node.path.endsWith('.yml') || node.path.endsWith('.yaml') || node.path.endsWith('.json'))
    ) {
      // Use canonical ID generation (converts / to __ and strips compound extensions)
      const relativePath = node.path.replace(/^blueprints\//, '');
      const configId = generateBlueprintIdFromPath(relativePath);
      configIds.add(configId);
    }
  }

  return configIds;
}

interface S3FileInfo {
  key: string;
  lastModified?: Date;
  size?: number;
}

async function listS3Objects(prefix: string): Promise<S3FileInfo[]> {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const files: S3FileInfo[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await s3.send(command);
    for (const obj of response.Contents || []) {
      if (obj.Key) {
        files.push({
          key: obj.Key,
          lastModified: obj.LastModified,
          size: obj.Size,
        });
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}

function computeTimingInsights(runs: LatestRunSummaryItem[]): TimingInsights | null {
  const timedRuns = runs.filter(r => r.timingSummary);
  if (timedRuns.length === 0) return null;

  // Sort by timestamp ascending for chart
  timedRuns.sort((a, b) => {
    const ta = fromSafeTimestamp(a.timestamp);
    const tb = fromSafeTimestamp(b.timestamp);
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  const runPoints: TimingRunPoint[] = timedRuns.map(r => {
    const ts = r.timingSummary!;
    const gen = ts.generationDurationMs || 0;
    const eval_ = ts.evaluationDurationMs || 0;
    const save = ts.saveDurationMs || 0;
    // Pipeline saves timing before totalDurationMs is computed — fall back to phase sum
    const total = ts.totalDurationMs || (gen + eval_ + save);
    return {
      timestamp: fromSafeTimestamp(r.timestamp),
      configId: r.configId,
      configTitle: r.configTitle,
      totalDurationMs: total,
      generationDurationMs: gen,
      evaluationDurationMs: eval_,
      saveDurationMs: save,
      slowestModel: ts.slowestModel,
      fastestModel: ts.fastestModel,
    };
  });

  // Aggregate model speeds
  const modelMap = new Map<string, { totalMs: number; count: number; slowest: number; fastest: number }>();
  for (const r of timedRuns) {
    const ts = r.timingSummary!;
    if (ts.slowestModel) {
      const entry = modelMap.get(ts.slowestModel.modelId) || { totalMs: 0, count: 0, slowest: 0, fastest: 0 };
      entry.totalMs += ts.slowestModel.avgMs;
      entry.count++;
      entry.slowest++;
      modelMap.set(ts.slowestModel.modelId, entry);
    }
    if (ts.fastestModel) {
      const entry = modelMap.get(ts.fastestModel.modelId) || { totalMs: 0, count: 0, slowest: 0, fastest: 0 };
      // Only add to totalMs/count if this model wasn't already counted as slowest in same run
      if (!ts.slowestModel || ts.fastestModel.modelId !== ts.slowestModel.modelId) {
        entry.totalMs += ts.fastestModel.avgMs;
        entry.count++;
      }
      entry.fastest++;
      modelMap.set(ts.fastestModel.modelId, entry);
    }
  }
  const modelSpeeds: ModelSpeedEntry[] = Array.from(modelMap.entries()).map(([modelId, data]) => ({
    modelId,
    avgMs: data.count > 0 ? Math.round(data.totalMs / data.count) : 0,
    appearances: data.count,
    wasSlowest: data.slowest,
    wasFastest: data.fastest,
  }));

  // Compute stats
  const durations = runPoints.map(r => r.totalDurationMs);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const median = sortedDurations.length % 2 === 0
    ? (sortedDurations[sortedDurations.length / 2 - 1] + sortedDurations[sortedDurations.length / 2]) / 2
    : sortedDurations[Math.floor(sortedDurations.length / 2)];

  const totalTimeSpentMs = durations.reduce((s, d) => s + d, 0);

  const avgGenPct = runPoints.reduce((s, r) => s + (r.totalDurationMs > 0 ? r.generationDurationMs / r.totalDurationMs * 100 : 0), 0) / runPoints.length;
  const avgEvalPct = runPoints.reduce((s, r) => s + (r.totalDurationMs > 0 ? r.evaluationDurationMs / r.totalDurationMs * 100 : 0), 0) / runPoints.length;
  const avgSavePct = runPoints.reduce((s, r) => s + (r.totalDurationMs > 0 ? r.saveDurationMs / r.totalDurationMs * 100 : 0), 0) / runPoints.length;

  return {
    runs: runPoints,
    modelSpeeds,
    stats: {
      runsWithTiming: timedRuns.length,
      totalRuns: runs.length,
      avgDurationMs: Math.round(totalTimeSpentMs / runPoints.length),
      medianDurationMs: Math.round(median),
      totalTimeSpentMs,
      avgGenerationPct: Math.round(avgGenPct * 10) / 10,
      avgEvaluationPct: Math.round(avgEvalPct * 10) / 10,
      avgSavePct: Math.round(avgSavePct * 10) / 10,
    },
  };
}

export async function GET() {
  const errors: string[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Four parallel data fetches
  const [githubResult, summaryResult, s3FilesResult, latestRunsResult] = await Promise.allSettled([
    fetchGitHubConfigs(),
    // Fetch both summaries for cross-referencing
    Promise.allSettled([getAllBlueprintsSummary(), getHomepageSummary()]),
    // List S3 summary/model files
    Promise.allSettled([listS3Objects('live/aggregates/'), listS3Objects('live/models/')]),
    // Fetch latest runs for timing insights
    getLatestRunsSummary(),
  ]);

  // Extract GitHub config IDs
  let githubConfigIds = new Set<string>();
  if (githubResult.status === 'fulfilled') {
    githubConfigIds = githubResult.value;
  } else {
    errors.push(`GitHub fetch failed: ${githubResult.reason?.message || 'Unknown error'}`);
  }

  // Extract S3 config metadata from summaries
  const s3ConfigMap = new Map<string, { title?: string; runCount: number; lastRun: string | null; tags?: string[] }>();

  if (summaryResult.status === 'fulfilled') {
    const [bpResult, hpResult] = summaryResult.value;

    // Homepage summary has full runs arrays — use for run counts
    if (hpResult.status === 'fulfilled' && hpResult.value) {
      for (const config of hpResult.value.configs) {
        const lastRun = config.latestRunTimestamp
          ? fromSafeTimestamp(config.latestRunTimestamp)
          : null;
        // Avoid epoch fallback from fromSafeTimestamp
        const validLastRun = lastRun && new Date(lastRun).getTime() > 86400000 ? lastRun : null;
        s3ConfigMap.set(config.configId, {
          title: config.configTitle || config.title,
          runCount: config.runs?.length || 0,
          lastRun: validLastRun,
          tags: config.tags,
        });
      }
    } else if (hpResult.status === 'rejected') {
      errors.push(`Homepage summary fetch failed: ${hpResult.reason?.message || 'Unknown'}`);
    }

    // All blueprints summary may have configs not in homepage (no runs but listed)
    if (bpResult.status === 'fulfilled' && bpResult.value) {
      for (const config of bpResult.value.configs) {
        if (!s3ConfigMap.has(config.configId)) {
          const lastRun = config.latestRunTimestamp
            ? fromSafeTimestamp(config.latestRunTimestamp)
            : null;
          const validLastRun = lastRun && new Date(lastRun).getTime() > 86400000 ? lastRun : null;
          s3ConfigMap.set(config.configId, {
            title: config.configTitle || config.title,
            // runs array is empty in all_blueprints_summary (space optimization)
            // but if latestRunTimestamp exists, at least 1 run has happened
            runCount: validLastRun ? 1 : 0,
            lastRun: validLastRun,
            tags: config.tags,
          });
        }
      }
    } else if (bpResult.status === 'rejected') {
      errors.push(`All blueprints summary fetch failed: ${bpResult.reason?.message || 'Unknown'}`);
    }
  } else {
    errors.push(`Summary fetches failed: ${summaryResult.reason?.message || 'Unknown error'}`);
  }

  // Fix: if a config has lastRun but runCount is 0, it was evaluated at least once
  // (happens when runs arrays are empty in both summary files for DTEF configs)
  for (const [, entry] of s3ConfigMap) {
    if (entry.lastRun && entry.runCount === 0) {
      entry.runCount = 1;
    }
  }

  // Extract S3 file listings
  let allS3Files: S3FileInfo[] = [];
  if (s3FilesResult.status === 'fulfilled') {
    const [aggResult, modResult] = s3FilesResult.value;
    if (aggResult.status === 'fulfilled') allS3Files.push(...aggResult.value);
    else errors.push(`S3 aggregates listing failed: ${aggResult.reason?.message || 'Unknown'}`);
    if (modResult.status === 'fulfilled') allS3Files.push(...modResult.value);
    else errors.push(`S3 models listing failed: ${modResult.reason?.message || 'Unknown'}`);
  } else {
    errors.push(`S3 listing failed: ${s3FilesResult.reason?.message || 'Unknown error'}`);
  }

  // Build S3 file lookup by key
  const s3FileMap = new Map(allS3Files.map(f => [f.key, f]));

  // --- Cross-reference blueprints ---
  const blueprints: BlueprintStatusItem[] = [];

  // Configs in GitHub
  for (const configId of githubConfigIds) {
    const s3Data = s3ConfigMap.get(configId);
    blueprints.push({
      configId,
      title: s3Data?.title,
      runCount: s3Data?.runCount || 0,
      lastRun: s3Data?.lastRun || null,
      tags: s3Data?.tags,
      inGitHub: true,
      inS3: !!s3Data,
    });
  }

  // Orphaned: in S3 but not in GitHub
  for (const [configId, data] of s3ConfigMap) {
    if (!githubConfigIds.has(configId)) {
      blueprints.push({
        configId,
        title: data.title,
        runCount: data.runCount,
        lastRun: data.lastRun,
        tags: data.tags,
        inGitHub: false,
        inS3: true,
      });
    }
  }

  // --- Build summary files list ---
  const summaryFiles: SummaryFileItem[] = [];

  // Check known expected files
  for (const [filePath, info] of Object.entries(KNOWN_SUMMARY_FILES)) {
    const s3File = s3FileMap.get(filePath);
    summaryFiles.push({
      name: info.name,
      path: filePath,
      expectedPurpose: info.name,
      description: info.description,
      pageLinks: info.pageLinks,
      category: 'core',
      found: !!s3File,
      lastModified: s3File?.lastModified?.toISOString(),
      size: s3File?.size,
    });
  }

  // Classify remaining S3 files
  let unidentifiedCount = 0;
  for (const file of allS3Files) {
    if (KNOWN_SUMMARY_FILES[file.key]) continue; // Already handled

    const purpose = classifyS3Key(file.key);
    if (purpose) {
      summaryFiles.push({
        name: purpose,
        path: file.key,
        expectedPurpose: purpose,
        category: 'discovered',
        found: true,
        lastModified: file.lastModified?.toISOString(),
        size: file.size,
      });
    } else {
      unidentifiedCount++;
      summaryFiles.push({
        name: 'Unidentified',
        path: file.key,
        expectedPurpose: 'Unidentified',
        category: 'unidentified',
        found: true,
        lastModified: file.lastModified?.toISOString(),
        size: file.size,
      });
    }
  }

  // --- Compute stats ---
  const configsWithRuns = blueprints.filter(b => b.inGitHub && b.inS3).length;
  const configsWithoutRuns = blueprints.filter(b => b.inGitHub && !b.inS3).length;
  const orphanedConfigs = blueprints.filter(b => !b.inGitHub && b.inS3).length;
  const recentRunConfigs = blueprints.filter(b => {
    if (!b.inGitHub || !b.lastRun) return false;
    return new Date(b.lastRun) >= sevenDaysAgo;
  }).length;
  const staleRunConfigs = blueprints.filter(b => {
    if (!b.inGitHub || !b.inS3) return false;
    if (!b.lastRun) return true; // in S3 but no timestamp = stale
    return new Date(b.lastRun) < sevenDaysAgo;
  }).length;

  // Scheduler-aligned stats: periodic configs (what the scheduler actually processes)
  const periodicBlueprints = blueprints.filter(b => b.inGitHub && b.tags?.includes('_periodic'));
  const periodicConfigs = periodicBlueprints.length;
  const periodicWithRecentRuns = periodicBlueprints.filter(b => {
    if (!b.lastRun) return false;
    return new Date(b.lastRun) >= sevenDaysAgo;
  }).length;
  const periodicNeverRun = periodicBlueprints.filter(b => !b.inS3).length;

  const expectedSummaryFiles = Object.keys(KNOWN_SUMMARY_FILES).length;
  const foundSummaryFiles = Object.keys(KNOWN_SUMMARY_FILES).filter(k => s3FileMap.has(k)).length;

  const stats: ProgressStats = {
    totalGitHubConfigs: githubConfigIds.size,
    configsWithRuns,
    configsWithoutRuns,
    orphanedConfigs,
    recentRunConfigs,
    staleRunConfigs,
    periodicConfigs,
    periodicWithRecentRuns,
    periodicNeverRun,
    expectedSummaryFiles,
    foundSummaryFiles,
    unidentifiedFiles: unidentifiedCount,
  };

  const queue = getQueueStatus() as QueueStatus;

  // Compute timing insights from latest runs
  let timingInsights: TimingInsights | null = null;
  if (latestRunsResult.status === 'fulfilled' && latestRunsResult.value) {
    timingInsights = computeTimingInsights(latestRunsResult.value.runs);
  } else if (latestRunsResult.status === 'rejected') {
    errors.push(`Latest runs summary fetch failed: ${latestRunsResult.reason?.message || 'Unknown'}`);
  }

  const response: PlatformStatusResponse = {
    blueprints,
    summaryFiles,
    stats,
    queue,
    timingInsights,
    generatedAt: now.toISOString(),
    errors,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
