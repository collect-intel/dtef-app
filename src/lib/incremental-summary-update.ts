/**
 * Incremental Summary Update
 *
 * Updates dashboard aggregate files immediately after each eval completes,
 * replacing the OOM-prone full backfill that downloaded all 1300+ result files.
 *
 * Three files are updated per eval:
 *   1. Per-config summary (via updateSummaryDataWithNewRun + saveConfigSummary)
 *   2. all_blueprints_summary.json (upsert this config's entry)
 *   3. latest_runs_summary.json (prepend this run, trim to 50)
 *
 * An async mutex (promise chain) prevents concurrent read-modify-write races
 * when multiple evals finish near-simultaneously.
 */

import {
  getConfigSummary,
  saveConfigSummary,
  getAllBlueprintsSummary,
  saveAllBlueprintsSummary,
  getLatestRunsSummary,
  saveLatestRunsSummary,
  updateSummaryDataWithNewRun,
  LatestRunSummaryItem,
} from '@/lib/storageService';
import { EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import { fromSafeTimestamp } from '@/lib/timestampUtils';

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

// Module-scoped promise chain prevents concurrent read-modify-write races.
// Node.js is single-threaded but async S3 operations interleave:
//   Eval A reads aggregate → Eval B reads same version → A writes → B overwrites A's update
// The mutex serializes these so each update sees the previous one's write.
let updateChain = Promise.resolve();

export async function incrementalSummaryUpdate(
  configId: string,
  resultData: FetchedComparisonData,
  fileName: string,
  logger: Logger
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    updateChain = updateChain.then(async () => {
      const startMs = Date.now();
      logger.info(`[incremental-update] Starting for ${configId}...`);

      // --- Step 1: Update per-config summary ---
      const existingSummary = await getConfigSummary(configId);
      const existingConfigs = existingSummary ? [existingSummary] : null;
      const updatedConfigs = updateSummaryDataWithNewRun(existingConfigs, resultData, fileName);
      const updatedConfig = updatedConfigs.find(c => (c.id || c.configId) === configId);
      if (updatedConfig) {
        await saveConfigSummary(configId, updatedConfig);
        logger.info(`[incremental-update] Per-config summary saved for ${configId} (${updatedConfig.runs.length} runs)`);
      }

      // --- Step 2: Upsert into all_blueprints_summary.json ---
      const bpSummary = await getAllBlueprintsSummary() ?? { configs: [], lastUpdated: '' };
      if (updatedConfig) {
        // Build lean entry: latest run only, no coverage scores
        const latestRun = updatedConfig.runs.length > 0 ? { ...updatedConfig.runs[0] } : null;
        let leanLatestRun = null;
        if (latestRun) {
          const { allCoverageScores, ...restOfRun } = latestRun;
          leanLatestRun = restOfRun;
        }
        const leanConfig: EnhancedComparisonConfigInfo = {
          ...updatedConfig,
          runs: leanLatestRun ? [leanLatestRun] : [],
          totalRunCount: updatedConfig.runs.length,
        };

        // Upsert: replace existing entry or append
        const existingIdx = bpSummary.configs.findIndex(
          (c: EnhancedComparisonConfigInfo) => c.configId === configId
        );
        if (existingIdx >= 0) {
          bpSummary.configs[existingIdx] = leanConfig;
        } else {
          bpSummary.configs.push(leanConfig);
        }
        bpSummary.lastUpdated = new Date().toISOString();

        await saveAllBlueprintsSummary(bpSummary);
        logger.info(`[incremental-update] all_blueprints_summary updated (${bpSummary.configs.length} configs)`);
      }

      // --- Step 3: Prepend to latest_runs_summary.json ---
      if (updatedConfig && updatedConfig.runs.length > 0) {
        const latestRun = updatedConfig.runs[0];
        const { allCoverageScores, ...leanRun } = latestRun;
        const newItem: LatestRunSummaryItem = {
          ...leanRun,
          configId,
          configTitle: updatedConfig.title || updatedConfig.configTitle,
        };

        const latestRunsSummary = await getLatestRunsSummary();
        // Dedup: remove any existing entry with same configId + runLabel + timestamp
        const deduped = latestRunsSummary.runs.filter(
          r => !(r.configId === configId && r.runLabel === newItem.runLabel && r.timestamp === newItem.timestamp)
        );
        // Prepend and trim to 50
        deduped.unshift(newItem);
        const trimmed = deduped.slice(0, 50);

        await saveLatestRunsSummary({
          runs: trimmed,
          lastUpdated: new Date().toISOString(),
        });
        logger.info(`[incremental-update] latest_runs_summary updated (${trimmed.length} runs)`);
      }

      const durationMs = Date.now() - startMs;
      logger.info(`[incremental-update] Completed for ${configId} in ${durationMs}ms`);
    }).then(resolve, reject);
  });
}
