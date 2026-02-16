import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { getAuthenticatedOctokit, logAuthConfig } from '@/lib/github-auth';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { resolveModelsInConfig, SimpleLogger } from '@/lib/blueprint-service';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { ComparisonConfig, EvaluationMethod } from '@/cli/types/cli_types';
import { normalizeTag } from '@/app/utils/tagUtils';
import { configure } from '@/cli/config';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';
import { getLogger, Logger } from '@/utils/logger';
import { captureError, setContext } from '@/utils/sentry';
import { applyPREvalLimits, checkPREvalLimits } from '@/lib/pr-eval-limiter';
import { getConfigSummary, saveConfigSummary, updateSummaryDataWithNewRun } from '@/lib/storageService';
import { BLUEPRINT_CONFIG_UPSTREAM_OWNER, BLUEPRINT_CONFIG_UPSTREAM_REPO } from '@/lib/configConstants';

const UPSTREAM_OWNER = BLUEPRINT_CONFIG_UPSTREAM_OWNER;
const UPSTREAM_REPO = BLUEPRINT_CONFIG_UPSTREAM_REPO;

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

function sanitizeBlueprintPath(blueprintPath: string): string {
  return blueprintPath
    .replace(/^blueprints\/users\//, '')
    .replace(/\.ya?ml$/, '')
    .replace(/\//g, '-');
}

function generatePRConfigId(prNumber: number, blueprintPath: string): string {
  const sanitized = sanitizeBlueprintPath(blueprintPath);
  return `_pr_${prNumber}_${sanitized}`;
}

function getPRStoragePath(prNumber: number, blueprintPath: string): string {
  const sanitized = sanitizeBlueprintPath(blueprintPath);
  return `live/pr-evals/${prNumber}/${sanitized}`;
}

const getStatusUpdater = (basePath: string, runId: string, logger: Logger) => {
  return async (status: string, message: string, extraData: object = {}) => {
    logger.info(`Updating status for ${runId}: ${status} - ${message}`, extraData);
    const statusKey = `${basePath}/status.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
      Body: JSON.stringify({ status, message, updatedAt: new Date().toISOString(), ...extraData }),
      ContentType: 'application/json',
    }));
  };
};

async function postCompletionComment(
  prNumber: number,
  blueprintPath: string,
  success: boolean,
  basePath: string,
  configId?: string,
  error?: string,
  octokit?: Awaited<ReturnType<typeof getAuthenticatedOctokit>>
): Promise<void> {
  try {
    const octokitInstance = octokit || await getAuthenticatedOctokit();
    if (!octokit) {
      logAuthConfig();
    }
    const resultsUrl = `https://digitaltwinseval.org/pr-eval/${prNumber}/${encodeURIComponent(blueprintPath)}`;
    const analysisUrl = configId ? `https://digitaltwinseval.org/analysis/${configId}` : null;

    let commentBody: string;

    if (success) {
      commentBody =
        `✅ **Evaluation complete for \`${blueprintPath}\`**\n\n` +
        `[View evaluation status →](${resultsUrl})` +
        (analysisUrl ? ` | [**View full analysis →**](${analysisUrl})` : '') +
        `\n\n` +
        `The blueprint has been successfully evaluated against all configured models.`;
    } else {
      commentBody =
        `❌ **Evaluation failed for \`${blueprintPath}\`**\n\n` +
        `[View status →](${resultsUrl})\n\n` +
        `Error: ${error || 'Unknown error'}\n\n` +
        `Please check the blueprint syntax and try again.`;
    }

    await octokitInstance.issues.createComment({
      owner: UPSTREAM_OWNER,
      repo: UPSTREAM_REPO,
      issue_number: prNumber,
      body: commentBody,
    });
    console.log(`[PR Eval] Posted completion comment to PR #${prNumber}`);
  } catch (err: any) {
    console.error(`[PR Eval] Failed to post completion comment:`, err.message);
  }
}

async function runPRPipeline(body: any) {
  const { runId, prNumber, blueprintPath, blueprintContent, commitSha, author } = body;

  setContext('prEvaluation', {
    runId,
    prNumber,
    blueprintPath,
    commitSha,
    author,
  });

  const logger = await getLogger(`pr-eval:${prNumber}:${runId}`);

  configure({
    errorHandler: (error: Error) => {
      logger.error(`CLI Error: ${error.message}`, error);
      if (error instanceof Error) {
        captureError(error, { runId, prNumber, blueprintPath });
      }
    },
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.info(msg),
    }
  });

  if (!runId || !prNumber || !blueprintPath || !blueprintContent) {
    const errorMsg = 'Missing required parameters';
    logger.error(errorMsg, { runId, prNumber, blueprintPath });
    captureError(new Error(errorMsg), { runId, prNumber, blueprintPath, body });
    return;
  }

  const basePath = getPRStoragePath(prNumber, blueprintPath);
  const updateStatus = getStatusUpdater(basePath, runId, logger);

  try {
    // Save blueprint to S3
    await updateStatus('pending', 'Saving blueprint...');
    const blueprintKey = `${basePath}/blueprint.yml`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: blueprintKey,
      Body: blueprintContent,
      ContentType: 'application/x-yaml',
    }));

    // Save PR metadata
    const metadataKey = `${basePath}/pr-metadata.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: metadataKey,
      Body: JSON.stringify({
        prNumber,
        blueprintPath,
        commitSha,
        author,
        runId,
        startedAt: new Date().toISOString(),
      }),
      ContentType: 'application/json',
    }));

    // Parse blueprint
    await updateStatus('validating', 'Validating blueprint structure...');
    let config = parseAndNormalizeBlueprint(blueprintContent, 'yaml');

    // Strip deprecated 'id' field before assigning PR-specific ID
    if (config.id) {
      delete config.id;
    }
    const prConfigId = generatePRConfigId(prNumber, blueprintPath);
    logger.info(`Generated PR config ID: '${prConfigId}'`);
    config.id = prConfigId;

    if (!config.title) {
      config.title = config.id;
    }

    if (!config.models || config.models.length === 0) {
      logger.info('No models specified. Defaulting to CORE collection for PR evaluation.');
      config.models = ['CORE'];
    }

    logger.info(`Resolving model collections for PR #${prNumber}...`);
    config = await resolveModelsInConfig(config, process.env.GITHUB_TOKEN, logger as SimpleLogger);
    logger.info(`Models after resolution: ${config.models?.length || 0} models`);

    if (!config.models || config.models.length === 0) {
      throw new Error('No models available after resolution.');
    }

    // Apply PR evaluation limits
    const githubToken = process.env.GITHUB_TOKEN;
    const limitCheck = await checkPREvalLimits(config, githubToken);

    if (!limitCheck.allowed) {
      logger.info(`Blueprint exceeds PR limits. Applying limits...`);
      config = await applyPREvalLimits(config, githubToken);
      logger.info(`After limits: ${config.prompts?.length || 0} prompts, ${config.models?.length || 0} models`);
      await updateStatus('validating', `Blueprint trimmed to fit PR evaluation limits`);
    }

    // Register custom models
    const customModelDefs = config.models?.filter(m => typeof m === 'object') as CustomModelDefinition[] || [];
    if (customModelDefs.length > 0) {
      registerCustomModels(customModelDefs);
      logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
    }

    // Sanitize system prompts
    if (Array.isArray(config.system)) {
      if (config.systems && config.systems.length > 0) {
        logger.warn(`Both 'system' (as array) and 'systems' defined. Using 'systems'.`);
      } else {
        config.systems = config.system;
      }
      config.system = undefined;
    }

    // Normalize tags
    if (config.tags) {
      const originalTags = [...config.tags];
      config.tags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
    }

    // Add PR-specific tags
    config.tags = config.tags || [];
    config.tags.push('_pr_evaluation');
    config.tags.push(`_pr_${prNumber}`);
    config.tags.push(`_author_${author}`);

    logger.info(`Starting evaluation for blueprint: ${config.id || 'unnamed'}`);
    logger.info(`Models: ${config.models?.length || 0}, Prompts: ${config.prompts?.length || 0}`);

    const evalMethods: EvaluationMethod[] = ['llm-coverage'];
    const runLabel = `pr-${prNumber}`;

    await updateStatus('running_pipeline', 'Starting evaluation pipeline...');

    const progressCallback = async (completed: number, total: number): Promise<void> => {
      try {
        await updateStatus('running_pipeline', `Processing... (${completed}/${total})`, {
          progress: { completed, total }
        });
      } catch (err) {
        logger.error('Failed to update progress:', err);
      }
    };

    const { data: finalOutput, fileName } = await executeComparisonPipeline(
      config,
      runLabel,
      evalMethods,
      logger,
      undefined,
      undefined,
      false,
      commitSha,
      undefined,
      false,
      true,
      undefined,
      undefined,
      undefined,
      false,
      progressCallback,
      basePath,
    );

    logger.info(`Pipeline complete.`);

    await updateStatus('saving', 'Finalizing...');

    // Update config summary
    try {
      const existingConfigSummary = await getConfigSummary(prConfigId);
      const existingConfigsArray = existingConfigSummary ? [existingConfigSummary] : null;
      const updatedConfigArray = updateSummaryDataWithNewRun(
        existingConfigsArray,
        finalOutput,
        fileName || `pr-${prNumber}_${finalOutput.timestamp}_comparison.json`
      );
      const newConfigSummary = updatedConfigArray[0];
      await saveConfigSummary(prConfigId, newConfigSummary);
      logger.info(`Config summary saved for ${prConfigId}`);
    } catch (summaryError: any) {
      logger.error(`Failed to update config summary: ${summaryError.message}`);
    }

    // Post completion comment
    logger.info('Pre-authenticating GitHub for final operations...');
    const octokit = await getAuthenticatedOctokit();
    logAuthConfig();

    const completedAt = new Date().toISOString();
    const resultUrl = `https://digitaltwinseval.org/pr-eval/${prNumber}/${encodeURIComponent(blueprintPath)}`;

    await Promise.all([
      updateStatus('complete', 'Evaluation complete!', { completedAt, resultUrl }),
      postCompletionComment(prNumber, blueprintPath, true, basePath, prConfigId, undefined, octokit),
    ]);

    logger.info(`PR evaluation complete for ${blueprintPath}`);

  } catch (error: any) {
    logger.error(`PR evaluation failed:`, error);
    captureError(error, { runId, prNumber, blueprintPath });

    try {
      await updateStatus('error', `Evaluation failed: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        failedAt: new Date().toISOString(),
      });
      await postCompletionComment(prNumber, blueprintPath, false, basePath, error.message);
    } catch (statusError: any) {
      logger.error('Failed to update error status:', statusError);
    }

  }
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
  runPRPipeline(body).catch(err => {
    console.error('[execute-pr-evaluation-background] Error:', err);
    captureError(err);
  });

  return NextResponse.json({ message: 'Accepted' }, { status: 202 });
}
