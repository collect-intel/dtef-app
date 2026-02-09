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
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';

export const maxDuration = 300; // 5 minutes max for Railway

async function runPipeline(requestPayload: any) {
  initSentry('execute-evaluation-background');

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

  const evalMethods: EvaluationMethod[] = ['embedding', 'llm-coverage'];
  const useCache = true;

  logger.info(`Executing pipeline with evalMethods: ${evalMethods.join(', ')} and cache enabled.`);

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

  // Update summaries if we have results
  if (newResultData && process.env.STORAGE_PROVIDER === 's3') {
    try {
      logger.info('New evaluation run completed. Triggering full summary backfill...');
      await actionBackfillSummary({ verbose: false, dryRun: false });
      logger.info('Homepage summary and all analytics rebuilt successfully.');
    } catch (summaryError: any) {
      logger.error('Failed to rebuild summary files', summaryError);
      captureError(summaryError, { configId: currentId, context: 'summary_rebuild' });
    }
  }

  logger.info(`Pipeline tasks completed for ${currentId}. Output: ${fileName}`);
  await flushSentry();
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

  // Fire and forget
  runPipeline(body).catch(err => {
    console.error('[execute-evaluation-background] Error:', err);
    captureError(err);
  });

  return NextResponse.json({ message: 'Accepted' }, { status: 202 });
}
