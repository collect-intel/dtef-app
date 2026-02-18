import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { ComparisonConfig, EvaluationMethod } from '@/cli/types/cli_types';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import { actionBackfillSummary } from '@/cli/commands/backfill-summary';
import { normalizeTag } from '@/app/utils/tagUtils';
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

  logger.info(`Executing pipeline with evalMethods: ${evalMethods.join(', ')} and cache enabled.`);

  const pipelineStartMs = Date.now();
  const pipelineConfig = { ...config, models: modelIdsToRun };
  const { fileName } = await executeComparisonPipeline(
    pipelineConfig,
    runLabel,
    evalMethods,
    logger,
    undefined,
    undefined,
    useCache,
    commitSha
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

  // Register backfill handler — the eval queue will debounce it so that
  // rapid-fire eval completions trigger only one backfill instead of N.
  if (newResultData && process.env.STORAGE_PROVIDER === 's3') {
    registerBackfillHandler(async () => {
      const bfLogger = await getLogger('eval:backfill:debounced');
      bfLogger.info('Running debounced summary backfill after eval batch...');
      await actionBackfillSummary({ verbose: false, dryRun: false });
      bfLogger.info('Debounced summary backfill completed.');
    });
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
