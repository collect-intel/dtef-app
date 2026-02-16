import { NextResponse } from 'next/server';
import axios from 'axios';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BLUEPRINT_CONFIG_REPO_SLUG } from '@/lib/configConstants';
import { getS3Client, getBucketName, getAllBlueprintsSummary, getHomepageSummary } from '@/lib/storageService';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import type { PlatformStatusResponse, BlueprintStatusItem, SummaryFileItem, ProgressStats } from '@/app/components/platform-status/types';

// Known summary files with their expected purpose
const KNOWN_SUMMARY_FILES: Record<string, string> = {
  'live/aggregates/homepage_summary.json': 'Homepage Summary',
  'live/aggregates/latest_runs_summary.json': 'Latest Runs Summary',
  'live/aggregates/regressions_summary.json': 'Regressions Summary',
  'live/aggregates/all_blueprints_summary.json': 'All Blueprints Summary',
  'live/aggregates/dtef_summary.json': 'DTEF Demographics Summary',
  'live/aggregates/search-index.json': 'Search Index',
  'live/aggregates/pain-points.json': 'Pain Points',
  'live/aggregates/compass-index.json': 'Compass Index',
  'live/aggregates/macro/index.json': 'Macro Canvas Index',
  'live/models/ndeltas/manifest.json': 'N-Deltas Manifest',
  'live/models/vibes/index.json': 'Vibes Index',
};

// Pattern-based classification for files not in the known list
function classifyS3Key(key: string): string | null {
  if (key.match(/^live\/aggregates\/dtef_summary_.+\.json$/)) return 'DTEF Survey Summary (per-survey)';
  if (key.match(/^live\/models\/summaries\/.+\.json$/)) return 'Model Summary';
  if (key.match(/^live\/models\/ndeltas\/.+\.json$/) && !key.endsWith('manifest.json')) return 'Model N-Delta';
  if (key.match(/^live\/models\/cards\/.+\.json$/)) return 'Model Card';
  if (key.match(/^live\/aggregates\/macro\/configs\/.+\.json$/)) return 'Macro Config Mapping';
  if (key.match(/^live\/aggregates\/macro\/flat\//)) return 'Macro Flat Data';
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
      // Strip 'blueprints/' prefix and file extension
      const configId = node.path
        .replace(/^blueprints\//, '')
        .replace(/\.(yml|yaml|json)$/, '');
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

export async function GET() {
  const errors: string[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Three parallel data fetches
  const [githubResult, summaryResult, s3FilesResult] = await Promise.allSettled([
    fetchGitHubConfigs(),
    // Fetch both summaries for cross-referencing
    Promise.allSettled([getAllBlueprintsSummary(), getHomepageSummary()]),
    // List S3 summary/model files
    Promise.allSettled([listS3Objects('live/aggregates/'), listS3Objects('live/models/')]),
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
            runCount: 0, // runs array is empty in all_blueprints_summary
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
  for (const [filePath, purpose] of Object.entries(KNOWN_SUMMARY_FILES)) {
    const s3File = s3FileMap.get(filePath);
    summaryFiles.push({
      name: purpose,
      path: filePath,
      expectedPurpose: purpose,
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
    if (!b.lastRun) return false;
    return new Date(b.lastRun) >= sevenDaysAgo;
  }).length;
  const expectedSummaryFiles = Object.keys(KNOWN_SUMMARY_FILES).length;
  const foundSummaryFiles = Object.keys(KNOWN_SUMMARY_FILES).filter(k => s3FileMap.has(k)).length;

  const stats: ProgressStats = {
    totalGitHubConfigs: githubConfigIds.size,
    configsWithRuns,
    configsWithoutRuns,
    orphanedConfigs,
    recentRunConfigs,
    expectedSummaryFiles,
    foundSummaryFiles,
    unidentifiedFiles: unidentifiedCount,
  };

  const response: PlatformStatusResponse = {
    blueprints,
    summaryFiles,
    stats,
    generatedAt: now.toISOString(),
    errors,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
