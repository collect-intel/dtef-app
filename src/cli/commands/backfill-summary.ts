import { Command } from 'commander';
import { getConfig } from '../config';
import pLimit from '@/lib/pLimit';

import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
    HomepageSummaryFileContent,
    saveConfigSummary,
    saveLatestRunsSummary,
    LatestRunSummaryItem,
    saveModelSummary,
    saveAllBlueprintsSummary,
    buildModelCardMappings,
} from '../../lib/storageService';
import { EnhancedComparisonConfigInfo, EnhancedRunInfo } from '../../app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift,
    calculatePerModelScoreStatsForRun,
    calculateAverageHybridScoreForRun,
    calculateTopicChampions,
    processExecutiveSummaryGrades,
    processTopicData,
} from '../utils/summaryCalculationUtils';
import { calculateStandardDeviation } from '../../app/utils/calculationUtils';
import { fromSafeTimestamp } from '../../lib/timestampUtils';
import { ModelRunPerformance, ModelSummary } from '@/types/shared';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { normalizeTag } from '@/app/utils/tagUtils';
import { buildDTEFSummary, buildAllDTEFSummaries } from '@/cli/utils/dtefSummaryUtils';
import { saveJsonFile } from '@/lib/storageService';

async function actionBackfillSummary(options: { verbose?: boolean; configId?: string; dryRun?: boolean }) {
    const { logger } = getConfig();
    logger.info('Starting homepage summary backfill process (v3 hybrid summary)...');
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE --- No files will be written.');
    }

    let allConfigsForHomepage: EnhancedComparisonConfigInfo[] = [];
    let totalConfigsProcessed = 0;
    let totalRunsProcessed = 0;
    let totalRunsFailed = 0;
    const allDTEFResults: FetchedComparisonData[] = [];
    const modelDimensionGrades = new Map<string, Map<string, { totalScore: number; count: number; uniqueConfigs: Set<string>; scores: Array<{ score: number; configTitle: string; runLabel: string; timestamp: string; configId: string; }> }>>();
    const topicModelScores = new Map<string, Map<string, { scores: Array<{ score: number; configId: string; configTitle: string; runLabel: string; timestamp: string; }>; uniqueConfigs: Set<string> }>>();

    try {
        const configIds = options.configId ? [options.configId] : await listConfigIds();
        if (!configIds || configIds.length === 0) {
            logger.warn('No configuration IDs found. Nothing to backfill.');
            return;
        }

        logger.info(`Found ${configIds.length} configuration IDs to process.`);

        for (const configId of configIds) {
            const runs = await listRunsForConfig(configId);
            if (runs.length === 0) {
                if (options.verbose) logger.info(`- No runs found for config ${configId}, skipping.`);
                continue;
            }

            // For populating the pairs queue, we only care about the latest run.
            // listRunsForConfig returns runs sorted by date, so the first one is the latest.
            const latestRunInfo = runs[0];
            
            totalConfigsProcessed++;
            logger.info(`Processing ${runs.length} runs for config: ${configId}...`);
            
            // --- Step 1: Fetch all run data in parallel ---
            const limit = pLimit(10); // Limit concurrency to 10 parallel downloads

            const fetchPromises = runs.map(runInfo => 
                limit(async () => {
                    try {
                        const resultData = await getResultByFileName(configId, runInfo.fileName) as FetchedComparisonData;
                        if (resultData) {
                            if (runInfo.timestamp) {
                                // Prefer filename-derived timestamp (canonical source)
                                resultData.timestamp = runInfo.timestamp;
                            } else if (!resultData.timestamp) {
                                // Neither filename nor result data has a timestamp —
                                // last resort: try to extract from the filename more leniently
                                const isoMatch = runInfo.fileName.match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z)/);
                                if (isoMatch) {
                                    resultData.timestamp = isoMatch[1];
                                    logger.warn(`  Extracted timestamp from filename fallback for ${runInfo.fileName}: ${isoMatch[1]}`);
                                }
                            }
                            // If resultData.timestamp existed already and runInfo.timestamp was null,
                            // we keep the existing resultData.timestamp as-is.
                        }
                        return { resultData, runInfo };
                    } catch (error: any) {
                        logger.error(`  Error processing run file ${runInfo.fileName}: ${error.message}`);
                        totalRunsFailed++;
                        return { resultData: null, runInfo };
                    }
                })
            );
            
            const allRunResults = await Promise.all(fetchPromises);

            // --- Step 2: Process the fetched data into EnhancedRunInfo objects ---
            const processedRuns: EnhancedRunInfo[] = [];
            let latestResultDataForConfig: FetchedComparisonData | null = null;
            
            for (const { resultData, runInfo } of allRunResults) {
                if (resultData) {
                     // --- NORMALIZE TAGS ---
                    if (resultData.config?.tags) {
                        const originalTags = [...resultData.config.tags];
                        const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
                        resultData.config.tags = normalizedTags;
                    }
                    // --- END NORMALIZE TAGS ---

                    // --- Accumulate DTEF results ---
                    if (resultData.config?.tags?.includes('dtef') && runInfo.fileName === latestRunInfo.fileName) {
                        allDTEFResults.push(resultData);
                    }

                    // --- Process Executive Summary Grades ---
                    // Only process grades from the latest run per config for dimension leaderboards
                    if (resultData.executiveSummary?.structured?.grades && runInfo.fileName === latestRunInfo.fileName) {
                        processExecutiveSummaryGrades(resultData, modelDimensionGrades, logger);
                    }

                    // --- Process All Tags for Topic Champions ---
                    const manualTags = resultData.config?.tags || [];
                    const autoTags = resultData.executiveSummary?.structured?.autoTags || [];
                    const allTags = [...new Set([...manualTags, ...autoTags].map(tag => normalizeTag(tag)).filter(Boolean))];

                    if (allTags.length > 0 && runInfo.fileName === latestRunInfo.fileName) {
                        const perModelScores = calculatePerModelScoreStatsForRun(resultData);
                        
                        if (options.verbose) {
                            const logLines: string[] = [];
                            logLines.push(`  [VERBOSE] Tags for ${runInfo.fileName}:`);
                            logLines.push(`    - Manual: [${manualTags.join(', ')}]`);
                            logLines.push(`    - Auto:   [${(autoTags || []).join(', ')}]`);
                            logLines.push(`    - Unified: [${allTags.join(', ')}]`);
                            logger.info(logLines.join('\n'));
                        }

                        processTopicData(resultData, perModelScores, topicModelScores, logger);
                    }


                    if (!resultData.configId || !resultData.runLabel || !resultData.timestamp) {
                        logger.warn(`  Skipping run file ${runInfo.fileName} due to missing essential fields (configId, runLabel, or timestamp).`);
                        totalRunsFailed++;
                        continue;
                    }
                    totalRunsProcessed++;

                    // --- Calculate stats for this run ---
                    const perModelScores = calculatePerModelScoreStatsForRun(resultData);
                    const hybridScoreStats = calculateAverageHybridScoreForRun(resultData);

                    // --- Create a "lite" version of coverage scores for the summary to avoid bloat ---
                    const fullCoverageScores = resultData.evaluationResults?.llmCoverageScores;
                    let liteCoverageScores: typeof fullCoverageScores | null = null;
                    if (fullCoverageScores) {
                        liteCoverageScores = {};
                        for (const promptId in fullCoverageScores) {
                            if (Object.prototype.hasOwnProperty.call(fullCoverageScores, promptId)) {
                                liteCoverageScores[promptId] = {};
                                const models = fullCoverageScores[promptId];
                                for (const modelId in models) {
                                    if (Object.prototype.hasOwnProperty.call(models, modelId)) {
                                        const result = models[modelId];
                                        if (result && !('error' in result)) {
                                            // Strip out the heavy pointAssessments array
                                            liteCoverageScores[promptId][modelId] = {
                                                keyPointsCount: result.keyPointsCount,
                                                avgCoverageExtent: result.avgCoverageExtent,
                                            };
                                        } else if (result) {
                                            liteCoverageScores[promptId][modelId] = result; // Keep error objects
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // --- End "lite" coverage scores ---

                    // Build timing summary from pipeline timing data if available
                    const timing = (resultData as any).timing;
                    let timingSummary: EnhancedRunInfo['timingSummary'] = undefined;
                    if (timing?.phases) {
                        const sorted = timing.perModelTiming?.length > 0
                            ? [...timing.perModelTiming].sort((a: any, b: any) => b.avgMs - a.avgMs)
                            : [];
                        timingSummary = {
                            totalDurationMs: timing.totalDurationMs,
                            generationDurationMs: timing.phases.generation?.durationMs,
                            evaluationDurationMs: timing.phases.evaluation?.durationMs,
                            saveDurationMs: timing.phases.save?.durationMs,
                            slowestModel: sorted.length > 0 ? { modelId: sorted[0].modelId, avgMs: sorted[0].avgMs } : undefined,
                            fastestModel: sorted.length > 0 ? { modelId: sorted[sorted.length - 1].modelId, avgMs: sorted[sorted.length - 1].avgMs } : undefined,
                        };
                    }

                    processedRuns.push({
                        runLabel: resultData.runLabel,
                        timestamp: resultData.timestamp,
                        fileName: runInfo.fileName,
                        temperature: resultData.config.temperature || 0,
                        numPrompts: resultData.promptIds.length,
                        numModels: resultData.effectiveModels.filter(m => m !== 'ideal').length,
                        totalModelsAttempted: resultData.config.models.length,
                        hybridScoreStats: hybridScoreStats,
                        perModelScores: perModelScores,
                        allCoverageScores: liteCoverageScores,
                        tags: resultData.config.tags,
                        models: resultData.effectiveModels,
                        promptIds: resultData.promptIds,
                        timingSummary,
                    });

                    // Track the latest result data to use for top-level config metadata
                    if (!latestResultDataForConfig || fromSafeTimestamp(resultData.timestamp) > fromSafeTimestamp(latestResultDataForConfig.timestamp)) {
                        latestResultDataForConfig = resultData;
                    }
                    
                } else {
                    logger.warn(`  Could not fetch or parse result data for run file: ${runInfo.fileName}`);
                    totalRunsFailed++;
                }
            }

            // --- Step 3: Assemble the final summary for this config ---
            if (processedRuns.length > 0 && latestResultDataForConfig) {
                 // Sort runs from newest to oldest
                processedRuns.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime());
                
                // Calculate overall stats for the config from all its processed runs
                const allHybridScoresForConfig = processedRuns
                    .map(run => run.hybridScoreStats?.average)
                    .filter(score => score !== null && score !== undefined) as number[];

                let overallAverageHybridScore: number | null = null;
                let hybridScoreStdDev: number | null = null;
                if (allHybridScoresForConfig.length > 0) {
                    const totalScore = allHybridScoresForConfig.reduce((sum, score) => sum + score, 0);
                    overallAverageHybridScore = totalScore / allHybridScoresForConfig.length;
                    hybridScoreStdDev = calculateStandardDeviation(allHybridScoresForConfig);
                }

                const finalConfigSummary: EnhancedComparisonConfigInfo = {
                    configId: configId,
                    configTitle: latestResultDataForConfig.configTitle || latestResultDataForConfig.config.title || configId,
                    id: configId,
                    title: latestResultDataForConfig.configTitle || latestResultDataForConfig.config.title || configId,
                    description: latestResultDataForConfig.config?.description || '',
                    runs: processedRuns,
                    latestRunTimestamp: processedRuns[0].timestamp,
                    tags: (() => {
                        // Combine manual config tags with auto tags from executive summary
                        const configTags = latestResultDataForConfig.config.tags || [];
                        const autoTags = latestResultDataForConfig.executiveSummary?.structured?.autoTags || [];
                        const allTags = [...configTags, ...autoTags];
                        const uniqueTags = allTags.filter((tag, index, arr) => 
                            arr.findIndex(t => t.toLowerCase() === tag.toLowerCase()) === index
                        );
                        return uniqueTags;
                    })(),
                    overallAverageHybridScore,
                    hybridScoreStdDev,
                };
                
                if (options.dryRun) {
                    logger.info(`[DRY RUN] Would save per-config summary for ${configId}.`);
                    const latestRun = finalConfigSummary.runs[0];
                    const summaryToLog = {
                        ...finalConfigSummary,
                        runs: `(${finalConfigSummary.runs.length} runs processed, showing latest run details below)`,
                        latestRun: latestRun ? {
                            runLabel: latestRun.runLabel,
                            timestamp: latestRun.timestamp,
                            hasPerModelScores: !!latestRun.perModelScores,
                            perModelScoresCount: latestRun.perModelScores?.size || 0,
                            serializationNote: (!!latestRun.perModelScores) ? "Legacy 'perModelHybridScores' field will be generated from this for backward compatibility during save." : "No new scores to generate."
                        } : 'N/A'
                    };
                    // Using console.log for direct, unformatted output of the object
                    console.log(JSON.stringify(summaryToLog, null, 2));
                } else {
                    logger.info(`Saving per-config summary for ${configId}...`);
                    await saveConfigSummary(configId, finalConfigSummary);
                }

                // Add the completed summary to our list for the homepage summary generation,
                // ONLY if it's not a run from the public API.
                const isPublicApiRun = finalConfigSummary.tags?.includes('_public_api');
                if (!isPublicApiRun) {
                    allConfigsForHomepage.push(finalConfigSummary);
                } else {
                    if (options.verbose) {
                        logger.info(`  Excluding config ${configId} from homepage summary because it has the '_public_api' tag.`);
                    }
                }
            }
        }

        // Now, build and save the main homepage summary from the collected configs
        if (allConfigsForHomepage.length > 0) {
            logger.info(`Backfill data compiled. Found ${allConfigsForHomepage.length} total configs to process for homepage summary.`);
            
            // 1. Create the hybrid array for the homepage summary file itself.
            const homepageConfigs = allConfigsForHomepage.map(config => {
                // For featured, include the latest run which contains the 'lite' heatmap data
                if (config.tags?.includes('_featured')) {
                    // Ensure we only pass the latest run
                    const latestRun = config.runs.length > 0 ? [config.runs[0]] : [];
                    return { ...config, runs: latestRun };
                }
                // For non-featured, strip all run data.
                return { ...config, runs: [] }; 
            });

            // 1b. Create the lean array for the all_blueprints_summary.json file
            const allBlueprintsSummaryConfigs = allConfigsForHomepage.map(config => {
                // For this summary, we only need the single latest run for its metadata (e.g. top model)
                // but we don't need its bulky heatmap data.
                const latestRun = config.runs.length > 0 ? { ...config.runs[0] } : null;
                let leanLatestRun = null;
                if (latestRun) {
                    const { allCoverageScores, ...restOfRun } = latestRun;
                    leanLatestRun = restOfRun;
                }
                return { 
                    ...config, 
                    runs: leanLatestRun ? [leanLatestRun] : [],
                };
            });

            // 2. Calculate stats based on ALL configs.
            // The calculation functions will internally filter out any configs with the 'test' tag.
            logger.info(`Headline stats will be calculated based on all ${allConfigsForHomepage.length} configs (excluding 'test' tag).`);

            const headlineStats = calculateHeadlineStats(allConfigsForHomepage, modelDimensionGrades, topicModelScores, logger);

            const driftDetectionResult = calculatePotentialModelDrift(allConfigsForHomepage);
            const topicChampions = calculateTopicChampions(topicModelScores);

            // Build model card mappings for linking leaderboard entries to model cards
            logger.info('Building model card mappings for leaderboard links...');
            const modelCardMappings = await buildModelCardMappings();
            logger.info(`Built mappings for ${Object.keys(modelCardMappings).length} model variants to ${new Set(Object.values(modelCardMappings)).size} model cards.`);

            // --- BEGIN: DTEF Summary Generation ---
            let combinedDTEFSummary = null;
            if (allDTEFResults.length > 0) {
                logger.info(`Building DTEF summaries from ${allDTEFResults.length} DTEF-tagged results...`);
                const perSurveySummaries = buildAllDTEFSummaries(allDTEFResults);
                combinedDTEFSummary = buildDTEFSummary(allDTEFResults);
                logger.info(`Built ${perSurveySummaries.size} per-survey summaries and 1 combined summary.`);

                if (!options.dryRun) {
                    for (const [surveyId, summary] of perSurveySummaries) {
                        await saveJsonFile(`live/aggregates/dtef_summary_${surveyId}.json`, summary);
                        logger.info(`Saved DTEF summary for survey: ${surveyId}`);
                    }
                    if (combinedDTEFSummary) {
                        await saveJsonFile('live/aggregates/dtef_summary.json', combinedDTEFSummary);
                        logger.info('Saved combined DTEF summary.');
                    }
                } else {
                    logger.info(`[DRY RUN] Would save ${perSurveySummaries.size} per-survey DTEF summaries.`);
                    if (combinedDTEFSummary) {
                        logger.info(`[DRY RUN] Would save combined DTEF summary with ${combinedDTEFSummary.topModels.length} top models.`);
                    }
                }
            } else {
                logger.info('No DTEF-tagged results found. Skipping DTEF summary generation.');
            }
            // --- END: DTEF Summary Generation ---

            const finalHomepageSummaryObject: HomepageSummaryFileContent = {
                configs: homepageConfigs, // The hybrid array
                headlineStats: headlineStats,
                driftDetectionResult: driftDetectionResult,
                topicChampions: topicChampions,
                dtefSummary: combinedDTEFSummary,
                modelCardMappings: Object.keys(modelCardMappings).length > 0 ? modelCardMappings : undefined,
                lastUpdated: new Date().toISOString(),
            };

            // --- BEGIN: Backfill Latest Runs Summary ---
            const allRunsFlat: LatestRunSummaryItem[] = allConfigsForHomepage.flatMap(config =>
                config.runs.map(run => {
                    // Create a lean run object, explicitly excluding the bulky allCoverageScores field.
                    const { allCoverageScores, ...leanRun } = run;
                    return {
                        ...leanRun,
                        configId: config.configId,
                        configTitle: config.title || config.configTitle,
                    };
                })
            );
            const sortedRuns = allRunsFlat.sort((a, b) => 
                new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime()
            );
            const latest50Runs = sortedRuns.slice(0, 50);
            // --- END: Backfill Latest Runs Summary ---

            // --- BEGIN: Backfill Model Summaries ---
            const modelRunData = new Map<string, ModelRunPerformance[]>();
            const modelSummariesToSave: { baseModelId: string, modelSummary: ModelSummary }[] = [];

            allConfigsForHomepage.forEach(config => {
                config.runs.forEach(run => {
                    // Defensive coding: Ensure perModelScores is a Map, as JSON operations can convert it to an object.
                    if (run.perModelScores && !(run.perModelScores instanceof Map)) {
                        run.perModelScores = new Map(Object.entries(run.perModelScores));
                    }
                    
                    if (run.perModelScores) {
                        run.perModelScores.forEach((scoreData, effectiveModelId) => {
                            if (scoreData.hybrid.average !== null && scoreData.hybrid.average !== undefined) {
                                const { baseId } = parseModelIdForDisplay(effectiveModelId);
                                const currentRuns = modelRunData.get(baseId) || [];
                                currentRuns.push({
                                    configId: config.configId,
                                    configTitle: config.title || config.configTitle,
                                    runLabel: run.runLabel,
                                    timestamp: run.timestamp,
                                    hybridScore: scoreData.hybrid.average,
                                });
                                modelRunData.set(baseId, currentRuns);
                            }
                        });
                    }
                });
            });

            for (const [baseModelId, runs] of modelRunData.entries()) {
                const totalRuns = runs.length;
                const blueprintsParticipated = new Set(runs.map(r => r.configId));
                const totalBlueprints = blueprintsParticipated.size;

                const validScores = runs.map(r => r.hybridScore).filter(s => s !== null) as number[];
                const averageHybridScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;

                // Strengths & Weaknesses
                const blueprintScores = new Map<string, { scores: number[], title: string }>();
                runs.forEach(run => {
                    if (run.hybridScore !== null) {
                        const existing = blueprintScores.get(run.configId) || { scores: [], title: run.configTitle };
                        existing.scores.push(run.hybridScore);
                        blueprintScores.set(run.configId, existing);
                    }
                });
                
                const avgBlueprintScores = Array.from(blueprintScores.entries()).map(([configId, data]) => ({
                    configId,
                    configTitle: data.title,
                    score: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
                })).sort((a, b) => b.score - a.score);

                const modelSummary: ModelSummary = {
                    modelId: baseModelId,
                    displayName: getModelDisplayLabel(baseModelId),
                    provider: baseModelId.split(':')[0] || 'unknown',
                    overallStats: {
                        averageHybridScore,
                        totalRuns,
                        totalBlueprints,
                    },
                    strengthsAndWeaknesses: {
                        topPerforming: avgBlueprintScores.slice(0, 3),
                        weakestPerforming: avgBlueprintScores.slice(-3).reverse(),
                    },
                    runs: runs.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime()),
                    lastUpdated: new Date().toISOString(),
                };
                
                modelSummariesToSave.push({ baseModelId, modelSummary });
            }
            // --- END: Backfill Model Summaries ---

            const finalAllBlueprintsSummaryObject = {
                configs: allBlueprintsSummaryConfigs,
                lastUpdated: new Date().toISOString(),
            };

            if (options.dryRun) {
                logger.info(`[DRY RUN] Would save comprehensive homepage summary. Stats calculated:`);
                console.log(JSON.stringify(finalHomepageSummaryObject.headlineStats, null, 2));
                logger.info(`[DRY RUN] Would save topic champions data. Topics found: ${Object.keys(topicChampions).length}`);
                console.log(JSON.stringify(topicChampions, null, 2));

                logger.info(`[DRY RUN] Would save latest runs summary (${latest50Runs.length} runs).`);
                
                logger.info(`[DRY RUN] Would save all blueprints summary (${finalAllBlueprintsSummaryObject.configs.length} blueprints).`);

                const modelNames = modelSummariesToSave.map(m => m.baseModelId);
                logger.info(`[DRY RUN] Would save ${modelSummariesToSave.length} model summaries for models: ${modelNames.join(', ')}`);

            } else {
                logger.info('Saving comprehensive homepage summary...');
                if (options.verbose) {
                    logger.info('--- Verbose Logging: Data being saved to homepage_summary.json ---');
                    logger.info('--- Headline Stats ---');
                    console.log(JSON.stringify(finalHomepageSummaryObject.headlineStats, null, 2));
                    logger.info('--- Topic Champions ---');
                    console.log(JSON.stringify(topicChampions, null, 2));
                    logger.info('--- End Verbose Logging ---');
                }
                await saveHomepageSummary(finalHomepageSummaryObject);
                logger.info('Comprehensive homepage summary saved successfully.');

                await saveAllBlueprintsSummary(finalAllBlueprintsSummaryObject);
                logger.info('All blueprints summary saved successfully.');

                await saveLatestRunsSummary({
                    runs: latest50Runs,
                    lastUpdated: new Date().toISOString(),
                });
                logger.info(`Latest runs summary saved successfully with ${latest50Runs.length} runs.`);

                logger.info(`Generating and saving ${modelSummariesToSave.length} model summaries...`);
                for (const { baseModelId, modelSummary } of modelSummariesToSave) {
                    await saveModelSummary(baseModelId, modelSummary);
                }
                logger.info(`Finished generating and saving model summaries.`);
            }

        } else {
            logger.warn('No data was compiled for the summary. Summary file not saved.');
        }

        logger.info('--- Backfill Summary ---');
        logger.info(`Total Configuration IDs found: ${configIds.length}`);
        logger.info(`Configuration IDs processed (with runs): ${totalConfigsProcessed}`);
        logger.info(`Total run files processed successfully: ${totalRunsProcessed}`);
        logger.info(`Total run files failed to process: ${totalRunsFailed}`);
        logger.info('------------------------');

    } catch (error: any) {
        logger.error(`An error occurred during the backfill process: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    }
}

export const backfillSummaryCommand = new Command('backfill-summary')
    .description('Rebuilds all summary files. Creates a summary.json for each config and a hybrid homepage_summary.json (metadata for all, runs for featured).')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .option('--config-id <id>', 'Only backfill for a specific configuration ID.')
    .option('--dry-run', 'Log what would be saved without writing any files.')
    .action(actionBackfillSummary);

// Export the core function so other commands can use the exact same logic
export { actionBackfillSummary }; 