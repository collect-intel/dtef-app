import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { listRunsForConfig } from '@/lib/storageService';
import { resolveModelsInConfig, SimpleLogger } from '@/lib/blueprint-service';
import { parseAndNormalizeBlueprint, validateReservedPrefixes } from '@/lib/blueprint-parser';
import { normalizeTag } from '@/app/utils/tagUtils';
import { generateBlueprintIdFromPath } from '@/app/utils/blueprintIdUtils';
import { getLogger } from '@/utils/logger';
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';
import { callBackgroundFunction } from '@/lib/background-function-client';
import { BLUEPRINT_CONFIG_REPO_SLUG } from '@/lib/configConstants';

const GITHUB_API_BASE = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}`;
const REPO_COMMITS_API_URL = `${GITHUB_API_BASE}/commits/main`;
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  initSentry('fetch-and-schedule-evals');

  const authError = checkBackgroundAuth(req);
  if (authError) {
    await flushSentry();
    return authError;
  }

  setContext('scheduleEvals', {
    eventSource: 'cron',
  });

  const logger = await getLogger('schedule-evals:cron');
  logger.info(`Function triggered (${new Date().toISOString()})`);

  // Parse request body for force flag
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // No body or invalid JSON — not forced
  }

  if (force) {
    logger.info('Force mode enabled — skipping freshness checks');
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const githubHeaders: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };
  const rawContentHeaders: Record<string, string> = {
    'Accept': 'application/vnd.github.v3.raw',
  };

  if (githubToken) {
    logger.info('Using GITHUB_TOKEN for API calls.');
    githubHeaders['Authorization'] = `token ${githubToken}`;
    rawContentHeaders['Authorization'] = `token ${githubToken}`;
  } else {
    logger.warn('GITHUB_TOKEN not set. Making anonymous calls to GitHub API.');
  }

  try {
    // Fetch the latest commit SHA
    let latestCommitSha: string | null = null;
    try {
      const commitResponse = await axios.get(REPO_COMMITS_API_URL, { headers: githubHeaders });
      latestCommitSha = commitResponse.data.sha;
      if (latestCommitSha) {
        logger.info(`Latest commit SHA for ${BLUEPRINT_CONFIG_REPO_SLUG}@main: ${latestCommitSha}`);
      }
    } catch (commitError: any) {
      logger.error(`Failed to fetch latest commit SHA: ${commitError.message}`);
      captureError(commitError, { context: 'fetch-commit-sha' });
    }

    const treeApiUrl = `${GITHUB_API_BASE}/git/trees/main?recursive=1`;
    logger.info(`Fetching file tree from: ${treeApiUrl}`);
    const treeResponse = await axios.get(treeApiUrl, { headers: githubHeaders });

    const filesInBlueprintDir = treeResponse.data.tree.filter(
      (node: any) => node.type === 'blob' && node.path.startsWith('blueprints/') && (node.path.endsWith('.yml') || node.path.endsWith('.yaml') || node.path.endsWith('.json'))
    );

    if (!Array.isArray(filesInBlueprintDir)) {
      logger.error('Failed to fetch or filter file list from GitHub repo tree.');
      captureError(new Error('Failed to process file list from GitHub repo'), { treeData: treeResponse.data });
      await flushSentry();
      return NextResponse.json({ error: 'Failed to process file list from GitHub repo.' }, { status: 500 });
    }

    logger.info(`Found ${filesInBlueprintDir.length} blueprint files in the repo tree.`);

    for (const file of filesInBlueprintDir) {
      const blueprintPath = file.path.startsWith('blueprints/')
        ? file.path.substring('blueprints/'.length)
        : file.path;

      logger.info(`Processing config file: ${file.path} (path for ID: ${blueprintPath})`);

      try {
        const configFileResponse = await axios.get(file.url, { headers: rawContentHeaders });

        const fileType = (file.path.endsWith('.yaml') || file.path.endsWith('.yml')) ? 'yaml' : 'json';
        const configContent = typeof configFileResponse.data === 'string' ? configFileResponse.data : JSON.stringify(configFileResponse.data);

        let config: ComparisonConfig = parseAndNormalizeBlueprint(configContent, fileType);

        // Normalize tags
        if (config.tags) {
          const originalTags = [...config.tags];
          const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
          config.tags = normalizedTags;
        }

        if (config.id) {
          logger.warn(`Blueprint '${file.path}' contains deprecated 'id' field ('${config.id}').`);
        }

        const id = generateBlueprintIdFromPath(blueprintPath);
        logger.info(`Derived ID from path '${blueprintPath}': '${id}'`);

        try {
          validateReservedPrefixes(id);
        } catch (error: any) {
          logger.warn(`Skipping blueprint '${file.path}': ${error.message}`);
          continue;
        }

        config.id = id;

        if (!config.title) {
          config.title = config.id;
        }

        if (!config.tags || !config.tags.includes('_periodic')) {
          logger.info(`Blueprint ${config.id} does not have '_periodic' tag. Skipping.`);
          continue;
        }

        if (!config.id || !config.prompts) {
          logger.warn(`Blueprint ${file.path} is missing essential fields. Skipping.`);
          continue;
        }

        if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
          config.models = ['CORE'];
        }

        const currentId = config.id!;

        config = await resolveModelsInConfig(config, githubToken, logger as any);
        logger.info(`Models for ${currentId} after resolution: ${config.models.length}`);

        if (config.models.length === 0) {
          logger.warn(`Blueprint ${file.path} (id: ${currentId}) has no models after resolution. Skipping.`);
          continue;
        }

        const contentHash = generateConfigContentHash(config);
        const baseRunLabelForCheck = contentHash;

        const existingRuns = await listRunsForConfig(currentId);
        let needsRun = true;

        if (force) {
          logger.info(`Force mode: scheduling run for ${currentId} regardless of history.`);
        } else if (existingRuns && existingRuns.length > 0) {
          const matchingExistingRuns = existingRuns.filter(run => run.runLabel === baseRunLabelForCheck);
          if (matchingExistingRuns.length > 0) {
            const latestMatchingRun = matchingExistingRuns[0];
            if (latestMatchingRun.timestamp) {
              const runAge = Date.now() - new Date(latestMatchingRun.timestamp).getTime();
              if (runAge < ONE_WEEK_IN_MS) {
                logger.info(`Blueprint ${currentId} has a recent run. Skipping.`);
                needsRun = false;
              } else {
                logger.info(`Blueprint ${currentId} has an old run. Scheduling new run.`);
              }
            }
          } else {
            logger.info(`No existing run with hash ${contentHash} for ${currentId}. Scheduling new run.`);
          }
        } else {
          logger.info(`No existing runs for ${currentId}. Scheduling new run.`);
        }

        if (needsRun) {
          if (config.models.length === 0) {
            logger.warn(`Blueprint ${currentId} still has no models. Skipping.`);
            continue;
          }
          logger.info(`Triggering evaluation for ${currentId} from ${file.path}`);

          try {
            const response = await callBackgroundFunction({
              functionName: 'execute-evaluation-background',
              body: {
                config: { ...config, id: currentId },
                commitSha: latestCommitSha
              }
            });

            if (response.ok) {
              logger.info(`Successfully invoked background function for ${currentId}`);
            } else {
              logger.error(`Background function failed for ${currentId}: ${response.status} - ${response.error}`);
              captureError(new Error(`Background function failed: ${response.error}`), { currentId, file: file.path });
            }
          } catch (invokeError: any) {
            logger.error(`Error invoking background function for ${file.path}: ${invokeError.message}`, invokeError);
            captureError(invokeError, { currentId, file: file.path });
          }
        }
      } catch (fetchConfigError: any) {
        logger.error(`Error fetching or processing blueprint file ${file.path}: ${fetchConfigError?.message || fetchConfigError}`, fetchConfigError?.stack);
        captureError(fetchConfigError, { file: file.path });
      }
    }

    logger.info('Scheduled eval check completed successfully');
    await flushSentry();
    return NextResponse.json({ message: 'Scheduled eval check completed.' });
  } catch (error: any) {
    logger.error('Error in handler', error);
    captureError(error, { handler: 'fetch-and-schedule-evals' });
    await flushSentry();
    return NextResponse.json({ error: 'Error processing scheduled eval check.' }, { status: 500 });
  }
}
