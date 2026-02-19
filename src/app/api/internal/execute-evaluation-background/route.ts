import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { ComparisonConfig, EvaluationMethod } from '@/cli/types/cli_types';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import { lightweightBackfill } from '@/cli/commands/backfill-summary';
import { normalizeTag } from '@/app/utils/tagUtils';
import { incrementalSummaryUpdate } from '@/lib/incremental-summary-update';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';
import { resolveModelsInConfig } from '@/lib/blueprint-service';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { captureError, setContext } from '@/utils/sentry';
import { enqueueEvaluation, getQueueStatus, registerBackfillHandler, registerQueueDrainedHandler } from '@/lib/evaluation-queue';
import { callBackgroundFunction } from '@/lib/background-function-client';

async function runPipeline(requestPayload: any) {
  const requestId = crypto.randomUUID();
  const logger = await getLogger(`eval:bg:${requestId}`);
  logger.info('Background evaluation started.');

  // Initialize CLI config (required before pipeline can call getConfig())
  configure({
    errorHandler: (err: Error) => {
      logger.error(`error: ${err?.message || err}`, err);
      captureError(err);
    },
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.info(msg),
    },
  });

  const config = requestPayload.config as ComparisonConfig;
  const commitSha = requestPayload.commitSha as string | undefined;

  setContext('evaluation', {
    configId: config?.id,
    commitSha,
    requestId,
  });

  // Normalize tags
  if (config.tags) {
    const originalTags = [...config.tags];
    const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
    config.tags = normalizedTags;
  }

  if (!config || typeof config !== 'object' || !config.id) {
    logger.error("Invalid or missing 'config' object in payload, or it is missing the canonical 'id'.", { payloadReceived: requestPayload });
    throw new Error("Invalid or missing 'config' object in payload.");
  }

  const currentId = config.id;
  const currentTitle = config.title || config.id;
  logger.info(`Executing evaluation for Blueprint ID: ${currentId}, Title: ${currentTitle}`);

  // Resolve model group placeholders (e.g. QUICK → individual model IDs)
  const githubToken = process.env.GITHUB_TOKEN;
  const resolvedConfig = await resolveModelsInConfig(config, githubToken, logger as any);
  Object.assign(config, resolvedConfig);

  // Custom Model Registration
  const customModelDefs = config.models.filter(m => typeof m === 'object') as CustomModelDefinition[];
  if (customModelDefs.length > 0) {
    registerCustomModels(customModelDefs);
    logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
  }
  const modelIdsToRun = config.models.map(m => (typeof m === 'string' ? m : m.id));

  // Generate runLabel from content hash
  const contentHash = generateConfigContentHash({ ...config, models: modelIdsToRun });
  const runLabel = contentHash;
  logger.info(`Generated runLabel (contentHash): ${runLabel} for Blueprint ID: ${currentId}`);
  if (commitSha) {
    logger.info(`Received commit SHA: ${commitSha}`);
  }

  // Embedding eval disabled — contributes 0% to hybrid score, adds log noise + API calls.
  // To re-enable: ['embedding', 'llm-coverage']
  const evalMethods: EvaluationMethod[] = ['llm-coverage'];
  const useCache = true;

  // Per-call timeout: defaults to 30s (HTTP client default) if not set.
  // Set GEN_TIMEOUT_MS in env to override (e.g. 15000 for CORE_FAST, 60000 for CORE_SLOW).
  const genTimeoutMs = process.env.GEN_TIMEOUT_MS ? parseInt(process.env.GEN_TIMEOUT_MS, 10) : undefined;
  const genRetries = process.env.GEN_RETRIES ? parseInt(process.env.GEN_RETRIES, 10) : undefined;
  const genOptions = (genTimeoutMs || genRetries) ? { genTimeoutMs, genRetries } : undefined;

  logger.info(`Executing pipeline with evalMethods: ${evalMethods.join(', ')}, cache enabled${genTimeoutMs ? `, timeout=${genTimeoutMs}ms` : ''}.`);

  const pipelineStartMs = Date.now();
  const pipelineConfig = { ...config, models: modelIdsToRun };
  const { fileName } = await executeComparisonPipeline(
    pipelineConfig,
    runLabel,
    evalMethods,
    logger,
    undefined,        // existingResponsesMap
    undefined,        // forcePointwiseKeyEval
    useCache,
    commitSha,
    undefined,        // blueprintFileName
    undefined,        // requireExecutiveSummary
    undefined,        // skipExecutiveSummary
    genOptions,
  );
  const pipelineDurationMs = Date.now() - pipelineStartMs;
  logger.info(`Pipeline completed for ${currentId} in ${Math.round(pipelineDurationMs / 1000)}s`);

  let newResultData: FetchedComparisonData | null = null;

  if (fileName) {
    newResultData = await getResultByFileName(currentId, fileName) as FetchedComparisonData;

    if (!newResultData) {
      logger.error(`Pipeline completed, result saved as: ${fileName}, but failed to fetch the saved data for summary update.`);
    } else {
      logger.info(`Pipeline completed successfully for ${currentId}. Result file: ${fileName}.`);
    }
  } else {
    throw new Error(`Pipeline execution for ${currentId} did not yield a valid output file.`);
  }

  // Incremental summary update — updates dashboard immediately
  // (per-config summary, all_blueprints_summary, latest_runs_summary)
  if (newResultData && process.env.STORAGE_PROVIDER === 's3') {
    try {
      await incrementalSummaryUpdate(currentId, newResultData, fileName, logger);
      logger.info(`Incremental summary update completed for ${currentId}`);
    } catch (err: any) {
      // Non-fatal: raw result already saved, drain-time rebuild will catch up
      logger.error(`Incremental summary update failed for ${currentId}: ${err.message}`);
    }
  }

  logger.info(`Pipeline tasks completed for ${currentId}. Output: ${fileName}`);
}

export async function POST(req: NextRequest) {
  const authError = checkBackgroundAuth(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }

  if (!body?.config) {
    return NextResponse.json({ error: 'Missing config in request body.' }, { status: 400 });
  }

  const configId = body.config.id || 'unknown';

  // Register lightweight backfill handler — runs when queue drains (no active evals).
  // Reads per-config summaries (~20KB each) instead of raw results (50-500KB each).
  // Memory: ~20-40MB vs 500MB+ for the old full backfill.
  registerBackfillHandler(async () => {
    const bfLogger = await getLogger('eval:backfill:lightweight');
    bfLogger.info('Running lightweight summary rebuild after eval batch...');
    await lightweightBackfill();
    bfLogger.info('Lightweight summary rebuild completed.');
  });

  // Register auto-continuation: when the queue fully drains, re-trigger
  // the scheduler to pick up any remaining unprocessed configs.
  // This makes the system self-healing after OOM crashes or partial batches.
  registerQueueDrainedHandler(async () => {
    console.log('[eval-continuation] Queue drained. Auto-triggering scheduler for remaining configs...');
    try {
      const response = await callBackgroundFunction({
        functionName: 'fetch-and-schedule-evals',
        body: {},
        timeout: 300_000, // 5 min — scheduler loops through all configs
      });
      if (response.ok) {
        const data = response.data;
        console.log(`[eval-continuation] Scheduler result: ${data?.scheduled || 0} scheduled, ${data?.skippedFresh || 0} skipped (fresh), ${data?.total || '?'} total`);
        if (data?.scheduled === 0) {
          console.log('[eval-continuation] All evaluations complete. No more configs need runs.');
        }
      } else {
        console.error(`[eval-continuation] Scheduler returned error: ${response.error}`);
      }
    } catch (err: any) {
      console.error(`[eval-continuation] Failed to call scheduler: ${err.message}`);
    }
  });

  // Enqueue with concurrency limiting
  const { position, queueLength } = enqueueEvaluation(configId, () =>
    runPipeline(body).catch(err => {
      console.error(`[execute-evaluation-background] Error for ${configId}:`, err);
      captureError(err);
    })
  );

  const status = getQueueStatus();
  return NextResponse.json({
    message: 'Accepted',
    queue: { position, active: status.active, queued: status.queued },
  }, { status: 202 });
}
