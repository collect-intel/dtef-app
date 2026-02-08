import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';
import { trackStatus } from '@/lib/status-tracker';
import { configure } from '@/cli/config';
import { ComparisonConfig, EvaluationMethod } from '@/cli/types/cli_types';
import { resolveModelsInConfig } from '@/lib/blueprint-service';
import { getLogger } from '@/utils/logger';
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';

export const maxDuration = 300;

const STORAGE_PREFIX = 'api-runs';

async function runAPIPipeline(requestPayload: { runId: string; config: ComparisonConfig }) {
  initSentry('execute-api-evaluation-background');

  const { runId, config } = requestPayload;

  setContext('apiEval', {
    runId,
    configId: config?.id,
  });

  const logger = await getLogger(`api-eval:bg:${runId}`);

  if (!runId || !config || typeof config !== 'object') {
    logger.error("Invalid or missing 'runId' or 'config' in payload.", { payloadReceived: requestPayload });
    captureError(new Error("Invalid or missing 'runId' or 'config' in payload"), { payloadReceived: requestPayload });
    await flushSentry();
    return;
  }

  const statusTracker = trackStatus(STORAGE_PREFIX, runId, logger as any);

  // Initialize CLI config
  try {
    configure({
      errorHandler: (err: Error) => {
        logger.error(`error: ${err?.message || err}`, err);
        if (err instanceof Error) {
          captureError(err, { runId, configId: config?.id });
        }
      },
      logger: {
        info: (msg: string) => logger.info(msg),
        warn: (msg: string) => logger.warn(msg),
        error: (msg: string) => logger.error(msg),
        success: (msg: string) => logger.info(msg),
      },
    });
  } catch {}

  try {
    logger.info(`Starting API evaluation for runId: ${runId}`);
    await statusTracker.running();
    await statusTracker.saveBlueprint(config);

    const configIdForStorage = `api-run-${runId.split('-')[0]}`;
    config.id = configIdForStorage;

    // Normalize prompts
    try {
      if (Array.isArray(config?.prompts)) {
        config.prompts = config.prompts.map((p: any) => {
          if (!p) return p;
          if (!Array.isArray(p.messages) || p.messages.length === 0) {
            const text = typeof p.prompt === 'string' ? p.prompt : (typeof p.promptText === 'string' ? p.promptText : undefined);
            if (typeof text === 'string' && text.trim().length > 0) {
              p.messages = [{ role: 'user', content: text }];
            }
          }
          return p;
        });
      }
    } catch (normErr: any) {
      logger.warn?.(`Prompt normalization failed: ${normErr?.message || normErr}`);
    }

    const contentHash = generateConfigContentHash(config);
    const runLabel = contentHash;

    logger.info(`Executing pipeline for runId: ${runId} with derived configId: ${configIdForStorage} and runLabel: ${runLabel}`);

    // Resolve model group placeholders (e.g. QUICK → individual model IDs)
    const resolvedConfig = await resolveModelsInConfig(config, process.env.GITHUB_TOKEN, logger as any);
    Object.assign(config, resolvedConfig);

    // Custom Model Registration
    const customModelDefs = config.models.filter(m => typeof m === 'object') as CustomModelDefinition[];
    if (customModelDefs.length > 0) {
      registerCustomModels(customModelDefs);
      logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
    }
    const modelIdsToRun = config.models.map(m => (typeof m === 'string' ? m : m.id));

    const skipSummary = (config as any).skipExecutiveSummary === true;
    const evalMethods = (config as any)._api_defaults_applied
      ? ['llm-coverage']
      : ['embedding', 'llm-coverage'];

    if ((config as any)._api_defaults_applied) {
      logger.info('API defaults applied: forcing llm-coverage and skipping executive summary.');
    }

    const { fileName } = await executeComparisonPipeline(
      { ...config, models: modelIdsToRun },
      runLabel,
      evalMethods as EvaluationMethod[],
      logger,
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      false,
      skipSummary,
    );

    if (fileName) {
      logger.success(`Pipeline for runId: ${runId} completed. Output file: ${fileName}`);

      const timestamp = path.basename(fileName).split('_')[1];
      const resultUrl = `${process.env.NEXT_PUBLIC_APP_URL}/analysis/${configIdForStorage}/${runLabel}/${timestamp}`;

      await statusTracker.completed({
        message: 'Evaluation completed successfully.',
        output: `live/blueprints/${configIdForStorage}/${fileName}`,
        resultUrl: resultUrl,
      });

      logger.info('API evaluation completed successfully');
    } else {
      throw new Error('Pipeline execution did not return a valid output key.');
    }
  } catch (error: any) {
    logger.error(`Unhandled error during pipeline execution for runId: ${runId}`, error);
    captureError(error, {
      runId,
      configId: config?.id,
      message: error.message,
    });

    await statusTracker.failed({
      error: 'An unexpected error occurred during the evaluation pipeline.',
      details: error.message,
    });
  }

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

  // Fire and forget
  runAPIPipeline(body).catch(err => {
    console.error('[execute-api-evaluation-background] Error:', err);
    captureError(err);
  });

  return NextResponse.json({ message: 'Accepted' }, { status: 202 });
}
