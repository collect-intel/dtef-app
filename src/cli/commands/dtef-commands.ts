/**
 * DTEF CLI Commands
 *
 * Commands for generating and managing demographic evaluation blueprints.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { DemographicBlueprintService } from '../services/demographicBlueprintService';
import { validateDTEFSurveyData } from '@/lib/dtef-validation';
import { DTEFSurveyData, DTEFBlueprintConfig, DTEFEvalType, DTEFContextFormat, DTEFReasoningMode } from '@/types/dtef';
import * as yaml from 'js-yaml';
import {
    convertGlobalDialogues,
    detectAvailableRounds,
    loadGlobalDialoguesRound,
    summarizeDataset,
} from '../services/adapters/globalDialoguesAdapter';
import {
    generateBaselineResults,
    getBaselineMeanScore,
    BASELINE_MODEL_IDS,
    BaselineType,
} from '../services/baselineGeneratorService';
import { saveResult, getJsonFile, saveJsonFile } from '@/lib/storageService';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import type {
    ExperimentRecord,
    ExperimentIndex,
    ExperimentStatus,
    ExperimentConclusion,
} from '@/types/experiment';
import {
    buildCurationPrompt,
    parseCurationResponse,
    buildCurationResult,
    loadCurationResult,
    applyCuration,
} from '../services/questionCurationService';
import { welchTTest, cohensD, stddev, interpretEffectSize } from '../utils/statisticalTests';
import { getConfigSummary } from '@/lib/storageService';

export const dtefCommand = new Command('dtef')
    .description('DTEF: Generate and manage demographic evaluation blueprints');

/**
 * dtef generate - Generate blueprints from demographic survey data
 */
dtefCommand
    .command('generate')
    .description('Generate demographic evaluation blueprints from survey data')
    .requiredOption('-i, --input <path>', 'Path to DTEF survey data JSON file')
    .option('-o, --output <dir>', 'Output directory for generated blueprints', './output/dtef-blueprints')
    .option('-f, --format <type>', 'Output format: yaml or json', 'yaml')
    .option('--questions <ids>', 'Comma-separated list of question IDs to include (default: all)')
    .option('--segments <ids>', 'Comma-separated list of segment IDs to include (default: all)')
    .option('--models <models>', 'Comma-separated list of models or model collections', 'CORE_CHEAP')
    .option('--temperature <temp>', 'Model temperature', '0.3')
    .option('--context-questions <ids>', 'Comma-separated question IDs to use as context, or "all" for all non-target questions')
    .option('--context-levels <levels>', 'Generate blueprints at multiple context levels (e.g., "0,5,10,all")')
    .option('--token-budget <tokens>', 'Token budget per prompt (controls context question inclusion)', '4096')
    .option('--batch-size <n>', 'Number of questions per batched prompt (sugar for --batch-sizes N)')
    .option('--batch-sizes <sizes>', 'Comma-separated batch sizes for generation matrix (e.g., "1,2,3")', '1')
    .option('--num-evals <n>', 'Number of evaluation prompts per batch size (default: all questions / batch_size)')
    .option('--eval-type <type>', 'Evaluation type: distribution, shift, synthetic-individual, or individual-answer', 'distribution')
    .option('--context-format <format>', 'Context format: attribute-label, distribution-context, or narrative')
    .option('--reasoning-mode <mode>', 'Reasoning mode: standard or cot', 'standard')
    .option('--synthetic-n <n>', 'Number of synthetic individuals (for synthetic-individual eval type)', '20')
    .option('--experiment <id>', 'Tag blueprints with experiment ID')
    .option('--experiment-id <id>', 'Auto-populate experiment conditionMap with generated configIds')
    .option('--condition-name <name>', 'Condition name for --experiment-id mapping')
    .option('--dry-run', 'Validate and preview without writing files')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nDTEF Blueprint Generator\n'));

        // Read input file
        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(chalk.red(`Input file not found: ${inputPath}`));
            process.exit(1);
        }

        let surveyData: DTEFSurveyData;
        try {
            const raw = fs.readFileSync(inputPath, 'utf-8');
            surveyData = JSON.parse(raw);
        } catch (e: any) {
            console.error(chalk.red(`Failed to parse input file: ${e.message}`));
            process.exit(1);
        }

        // Validate
        console.log(chalk.gray('Validating survey data...'));
        const validation = validateDTEFSurveyData(surveyData);

        if (validation.warnings.length > 0) {
            console.log(chalk.yellow(`\n${validation.warnings.length} warning(s):`));
            for (const w of validation.warnings) {
                console.log(chalk.yellow(`  - ${w.path}: ${w.message}`));
            }
        }

        if (!validation.valid) {
            console.error(chalk.red(`\n${validation.errors.length} error(s):`));
            for (const e of validation.errors) {
                console.error(chalk.red(`  - ${e.path}: ${e.message}`));
            }
            process.exit(1);
        }

        console.log(chalk.green(`Validation passed: ${validation.summary.questionCount} questions, ${validation.summary.segmentCount} segments, ${validation.summary.totalResponses} responses\n`));

        // Build config — determine target question IDs
        let targetQuestionIds: string[];

        if (options.questions) {
            // Explicit --questions overrides curation entirely
            targetQuestionIds = options.questions.split(',').map((s: string) => s.trim());
        } else {
            // Try auto-loading curation
            const curation = loadCurationResult(surveyData.surveyId);
            if (curation) {
                const allIds = Object.keys(surveyData.questions);
                const result = applyCuration(allIds, curation);
                targetQuestionIds = result.questionIds;
                console.log(chalk.cyan(`Curation loaded: ${result.excludedCount} excluded, ${result.rankedCount} ranked, ${targetQuestionIds.length} included`));
            } else {
                targetQuestionIds = Object.keys(surveyData.questions);
            }
        }

        const contextQuestionIds = options.contextQuestions
            ? (options.contextQuestions.toLowerCase() === 'all'
                ? Object.keys(surveyData.questions)
                : options.contextQuestions.split(',').map((s: string) => s.trim()))
            : undefined;

        // Parse --context-levels if specified
        const contextLevels: number[] | undefined = options.contextLevels
            ? options.contextLevels.split(',').map((s: string) => {
                const trimmed = s.trim().toLowerCase();
                if (trimmed === 'all') return -1; // -1 sentinel for "all available"
                const n = parseInt(trimmed, 10);
                if (isNaN(n) || n < 0) {
                    console.error(chalk.red(`Invalid context level: "${s}". Use numbers or "all".`));
                    process.exit(1);
                }
                return n;
            })
            : undefined;

        // Validate --context-levels requires --context-questions
        if (contextLevels && !contextQuestionIds) {
            console.error(chalk.red('--context-levels requires --context-questions to specify the pool of context questions.'));
            console.error(chalk.gray('Example: --context-questions all --context-levels 0,5,10,all'));
            process.exit(1);
        }

        // Parse batch sizes: --batch-size N is sugar for --batch-sizes N
        const batchSizesStr = options.batchSize || options.batchSizes;
        const batchSizes = batchSizesStr.split(',').map((s: string) => {
            const n = parseInt(s.trim(), 10);
            if (isNaN(n) || n < 1 || n > 5) {
                console.error(chalk.red(`Invalid batch size "${s}". Must be 1-5.`));
                process.exit(1);
            }
            return n;
        });

        const numEvals = options.numEvals ? parseInt(options.numEvals, 10) : undefined;
        if (numEvals !== undefined && (isNaN(numEvals) || numEvals < 1)) {
            console.error(chalk.red('--num-evals must be a positive integer'));
            process.exit(1);
        }

        const evalType = options.evalType as DTEFEvalType;
        if (!['distribution', 'shift', 'synthetic-individual', 'individual-answer'].includes(evalType)) {
            console.error(chalk.red('--eval-type must be "distribution", "shift", "synthetic-individual", or "individual-answer"'));
            process.exit(1);
        }

        const reasoningMode = options.reasoningMode as DTEFReasoningMode;
        if (!['standard', 'cot'].includes(reasoningMode)) {
            console.error(chalk.red('--reasoning-mode must be "standard" or "cot"'));
            process.exit(1);
        }

        const contextFormat = options.contextFormat as DTEFContextFormat | undefined;
        if (contextFormat && !['attribute-label', 'distribution-context', 'narrative', 'raw-survey', 'interview', 'first-person'].includes(contextFormat)) {
            console.error(chalk.red('--context-format must be one of: attribute-label, distribution-context, narrative, raw-survey, interview, first-person'));
            process.exit(1);
        }

        const syntheticN = parseInt(options.syntheticN, 10);
        const experimentId = options.experiment as string | undefined;

        // Generate blueprints across batch-size matrix (and optionally context levels)
        console.log(chalk.gray('Generating blueprints...'));

        let allBlueprints: ReturnType<typeof DemographicBlueprintService.generateBlueprints> = [];

        for (const batchSize of batchSizes) {
            // Compute how many questions to consume for this batch size
            const questionsNeeded = numEvals !== undefined
                ? numEvals * batchSize
                : targetQuestionIds.length;
            const slicedQuestions = targetQuestionIds.slice(0, questionsNeeded);

            if (batchSizes.length > 1) {
                console.log(chalk.gray(`  Batch size ${batchSize}: ${slicedQuestions.length} questions → ${Math.ceil(slicedQuestions.length / batchSize)} prompts/segment`));
            }

            if (contextLevels && contextQuestionIds) {
                // Multi-level context generation
                const allContextIds = contextQuestionIds;
                for (const level of contextLevels) {
                    const levelContextIds = level === 0 ? undefined
                        : level === -1 ? allContextIds
                        : allContextIds.slice(0, level);
                    const levelContextCount = level === 0 ? undefined
                        : level === -1 ? undefined
                        : level;

                    const config: DTEFBlueprintConfig = {
                        surveyData,
                        targetQuestionIds: slicedQuestions,
                        contextQuestionIds: levelContextIds,
                        contextQuestionCount: levelContextCount,
                        segmentSelection: options.segments ? 'specific' : 'all',
                        segmentIds: options.segments?.split(',').map((s: string) => s.trim()),
                        tokenBudget: parseInt(options.tokenBudget, 10),
                        batchSize: batchSize > 1 ? batchSize : undefined,
                        evalType,
                        contextFormat,
                        reasoningMode,
                        syntheticN: evalType === 'synthetic-individual' ? syntheticN : undefined,
                        experimentId,
                        modelConfig: {
                            models: options.models.split(',').map((s: string) => s.trim()),
                            temperature: parseFloat(options.temperature),
                        },
                    };

                    const levelLabel = level === -1 ? 'all' : level === 0 ? '0 (baseline)' : String(level);
                    console.log(chalk.gray(`    Context level ${levelLabel}...`));
                    const blueprints = DemographicBlueprintService.generateBlueprints(config);
                    allBlueprints.push(...blueprints);
                }
            } else {
                const config: DTEFBlueprintConfig = {
                    surveyData,
                    targetQuestionIds: slicedQuestions,
                    contextQuestionIds,
                    segmentSelection: options.segments ? 'specific' : 'all',
                    segmentIds: options.segments?.split(',').map((s: string) => s.trim()),
                    tokenBudget: parseInt(options.tokenBudget, 10),
                    batchSize: batchSize > 1 ? batchSize : undefined,
                    evalType,
                    contextFormat,
                    reasoningMode,
                    syntheticN: evalType === 'synthetic-individual' ? syntheticN : undefined,
                    experimentId,
                    modelConfig: {
                        models: options.models.split(',').map((s: string) => s.trim()),
                        temperature: parseFloat(options.temperature),
                    },
                };
                const blueprints = DemographicBlueprintService.generateBlueprints(config);
                allBlueprints.push(...blueprints);
            }
        }

        const blueprints = allBlueprints;

        console.log(chalk.green(`Generated ${blueprints.length} blueprint(s)\n`));

        if (options.dryRun) {
            console.log(chalk.yellow('Dry run mode - not writing files\n'));
            for (const bp of blueprints) {
                console.log(chalk.white(`  ${bp.configId}: ${bp.configTitle} (${bp.prompts.length} prompts)`));
            }
            return;
        }

        // Write output files
        const outputDir = path.resolve(options.output);
        fs.mkdirSync(outputDir, { recursive: true });

        for (const blueprint of blueprints) {
            const filename = `${blueprint.configId}.${options.format === 'yaml' ? 'yml' : 'json'}`;
            const filepath = path.join(outputDir, filename);

            let content: string;
            if (options.format === 'yaml') {
                content = yaml.dump(blueprint, { lineWidth: 120, noRefs: true });
            } else {
                content = JSON.stringify(blueprint, null, 2);
            }

            fs.writeFileSync(filepath, content, 'utf-8');
            console.log(chalk.gray(`  Written: ${filepath}`));
        }

        console.log(chalk.green(`\nDone! ${blueprints.length} blueprint(s) written to ${outputDir}`));

        // Auto-populate experiment conditionMap if --experiment-id and --condition-name given
        if (options.experimentId && options.conditionName) {
            const expId = options.experimentId;
            const condName = options.conditionName;
            const configIds = blueprints.map(bp => bp.configId).filter((id): id is string => !!id);

            console.log(chalk.gray(`\nUpdating experiment "${expId}" conditionMap["${condName}"] with ${configIds.length} configIds...`));
            const record = await getJsonFile<ExperimentRecord>(`live/experiments/${expId}.json`);
            if (!record) {
                console.error(chalk.yellow(`Experiment "${expId}" not found in S3 — skipping conditionMap update`));
            } else {
                if (!record.design.conditionMap) record.design.conditionMap = {};
                const existing = record.design.conditionMap[condName] || [];
                const merged = [...new Set([...existing, ...configIds])];
                record.design.conditionMap[condName] = merged;

                // Also merge into top-level configIds
                record.configIds = [...new Set([...record.configIds, ...configIds])];

                await saveJsonFile(`live/experiments/${record.id}.json`, record);
                console.log(chalk.green(`  Updated: ${merged.length} configIds in condition "${condName}"`));
            }
        }
    });

/**
 * dtef validate - Validate a DTEF survey data file
 */
dtefCommand
    .command('validate')
    .description('Validate a DTEF survey data file')
    .requiredOption('-i, --input <path>', 'Path to DTEF survey data JSON file')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nDTEF Data Validator\n'));

        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(chalk.red(`Input file not found: ${inputPath}`));
            process.exit(1);
        }

        let data: unknown;
        try {
            const raw = fs.readFileSync(inputPath, 'utf-8');
            data = JSON.parse(raw);
        } catch (e: any) {
            console.error(chalk.red(`Failed to parse input file: ${e.message}`));
            process.exit(1);
        }

        const result = validateDTEFSurveyData(data);

        console.log(chalk.white('Summary:'));
        console.log(`  Questions: ${result.summary.questionCount}`);
        console.log(`  Segments:  ${result.summary.segmentCount}`);
        console.log(`  Responses: ${result.summary.totalResponses}\n`);

        if (result.warnings.length > 0) {
            console.log(chalk.yellow(`${result.warnings.length} Warning(s):`));
            for (const w of result.warnings) {
                console.log(chalk.yellow(`  - [${w.path}] ${w.message}`));
            }
            console.log('');
        }

        if (result.errors.length > 0) {
            console.log(chalk.red(`${result.errors.length} Error(s):`));
            for (const e of result.errors) {
                console.log(chalk.red(`  - [${e.path}] ${e.message}`));
            }
            console.log('');
        }

        if (result.valid) {
            console.log(chalk.green('Validation PASSED'));
        } else {
            console.log(chalk.red('Validation FAILED'));
            process.exit(1);
        }
    });

/**
 * dtef preview - Preview what a blueprint would look like for a segment
 */
dtefCommand
    .command('preview')
    .description('Preview a generated prompt for a specific segment and question')
    .requiredOption('-i, --input <path>', 'Path to DTEF survey data JSON file')
    .option('--segment <id>', 'Segment ID to preview (default: first)')
    .option('--question <id>', 'Question ID to preview (default: first)')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(chalk.red(`Input file not found: ${inputPath}`));
            process.exit(1);
        }

        let surveyData: DTEFSurveyData;
        try {
            const raw = fs.readFileSync(inputPath, 'utf-8');
            surveyData = JSON.parse(raw);
        } catch (e: any) {
            console.error(chalk.red(`Failed to parse: ${e.message}`));
            process.exit(1);
        }

        const segmentId = options.segment || surveyData.segments[0]?.id;
        const questionId = options.question || Object.keys(surveyData.questions)[0];

        if (!segmentId || !questionId) {
            console.error(chalk.red('No segments or questions found in data'));
            process.exit(1);
        }

        const config: DTEFBlueprintConfig = {
            surveyData,
            targetQuestionIds: [questionId],
            segmentSelection: 'specific',
            segmentIds: [segmentId],
        };

        const detailed = DemographicBlueprintService.generateDetailedBlueprints(config);
        const blueprint = detailed[0];

        if (!blueprint || blueprint.prompts.length === 0) {
            console.error(chalk.red(`No prompts generated for segment=${segmentId}, question=${questionId}`));
            process.exit(1);
        }

        const prompt = blueprint.prompts[0];

        console.log(chalk.blue('\n--- DTEF Prompt Preview ---\n'));
        console.log(chalk.white(`Segment: ${blueprint.segmentLabel}`));
        console.log(chalk.white(`Question: ${questionId}\n`));
        console.log(chalk.gray('--- System Prompt ---'));
        console.log('You are a demographic survey analyst...\n');
        console.log(chalk.gray('--- User Prompt ---'));
        console.log(prompt.promptText);
        console.log(chalk.gray('\n--- Expected Distribution ---'));
        prompt.optionLabels.forEach((label, i) => {
            const pct = prompt.expectedDistribution[i]?.toFixed(1) || '?';
            console.log(`  ${label}: ${pct}%`);
        });
        console.log('');
    });

/**
 * dtef publish - Copy blueprints to dtef-configs repository
 */
dtefCommand
    .command('publish')
    .description('Copy generated blueprints to dtef-configs repository')
    .requiredOption('-s, --source <dir>', 'Source directory containing generated blueprints')
    .requiredOption('-t, --target <dir>', 'Target directory in dtef-configs (e.g., ../dtef-configs/blueprints)')
    .option('--tag <tag>', 'Additional tag to add to all blueprints')
    .option('--validate', 'Validate blueprints before copying', true)
    .option('--dry-run', 'Show what would be copied without actually copying')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nDTEF Blueprint Publisher\n'));

        const sourceDir = path.resolve(options.source);
        const targetDir = path.resolve(options.target);

        if (!fs.existsSync(sourceDir)) {
            console.error(chalk.red(`Source directory not found: ${sourceDir}`));
            process.exit(1);
        }

        // Find all blueprint files
        const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml') || f.endsWith('.json'));

        if (files.length === 0) {
            console.error(chalk.red('No blueprint files found in source directory'));
            process.exit(1);
        }

        console.log(chalk.gray(`Found ${files.length} blueprint file(s) in ${sourceDir}\n`));

        // Validate each blueprint
        const validFiles: { name: string; content: string; parsed: any }[] = [];
        let hasErrors = false;

        for (const file of files) {
            const filepath = path.join(sourceDir, file);
            const raw = fs.readFileSync(filepath, 'utf-8');

            let parsed: any;
            try {
                if (file.endsWith('.json')) {
                    parsed = JSON.parse(raw);
                } else {
                    parsed = yaml.load(raw);
                }
            } catch (e: any) {
                console.error(chalk.red(`  INVALID: ${file} - ${e.message}`));
                hasErrors = true;
                continue;
            }

            // Basic validation: must have configId, prompts
            if (!parsed.configId || !Array.isArray(parsed.prompts)) {
                console.error(chalk.red(`  INVALID: ${file} - Missing configId or prompts`));
                hasErrors = true;
                continue;
            }

            // Strip deprecated 'id' field — scheduler derives ID from file path
            if (parsed.id) {
                delete parsed.id;
            }

            // Add tag if specified
            if (options.tag && Array.isArray(parsed.tags)) {
                if (!parsed.tags.includes(options.tag)) {
                    parsed.tags.push(options.tag);
                }
            }

            // Re-serialize with tag
            let content: string;
            if (file.endsWith('.json')) {
                content = JSON.stringify(parsed, null, 2);
            } else {
                content = yaml.dump(parsed, { lineWidth: 120, noRefs: true });
            }

            validFiles.push({ name: file, content, parsed });
            console.log(chalk.green(`  VALID: ${file} (${parsed.prompts.length} prompts)`));
        }

        if (hasErrors && options.validate) {
            console.error(chalk.red('\nSome blueprints failed validation. Fix errors and retry.'));
            process.exit(1);
        }

        if (options.dryRun) {
            console.log(chalk.yellow(`\nDry run - would copy ${validFiles.length} file(s) to ${targetDir}`));
            return;
        }

        // Create target directory
        fs.mkdirSync(targetDir, { recursive: true });

        // Copy files
        for (const { name, content } of validFiles) {
            const targetPath = path.join(targetDir, name);
            fs.writeFileSync(targetPath, content, 'utf-8');
            console.log(chalk.gray(`  Copied: ${targetPath}`));
        }

        console.log(chalk.green(`\nPublished ${validFiles.length} blueprint(s) to ${targetDir}`));
        console.log(chalk.gray('Remember to commit and push the dtef-configs repository.'));
    });

/**
 * dtef import-gd - Import Global Dialogues data into DTEF format
 */
dtefCommand
    .command('import-gd')
    .description('Import Global Dialogues CSV data into DTEF survey data format')
    .option('-d, --data-dir <path>', 'Path to Global Dialogues Data/ directory', 'data/global-dialogues/Data')
    .option('-r, --round <id>', 'Specific round to import (e.g., GD4). Omit to list available rounds.')
    .option('-o, --output <path>', 'Output JSON file path (default: ./output/<roundId>.json)')
    .option('--all', 'Import all available rounds')
    .option('--segments <categories>', 'Segment categories to include (comma-separated O2-O7)', 'O2,O3,O4,O5,O6,O7')
    .option('--include-demographic-questions', 'Include demographic-defining questions (language, age, gender, etc.)')
    .option('--min-sample-size <n>', 'Minimum sample size for segments', '10')
    .option('--questions <ids>', 'Specific question IDs to include (comma-separated)')
    .option('--dry-run', 'Show summary without writing files')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nGlobal Dialogues → DTEF Importer\n'));

        const dataDir = path.resolve(options.dataDir);
        if (!fs.existsSync(dataDir)) {
            console.error(chalk.red(`Data directory not found: ${dataDir}`));
            console.error(chalk.gray('Ensure the global-dialogues submodule is initialized:'));
            console.error(chalk.gray('  git submodule update --init'));
            process.exit(1);
        }

        // List available rounds
        const available = detectAvailableRounds(dataDir);
        if (available.length === 0) {
            console.error(chalk.red('No GD rounds with aggregate_standardized.csv found'));
            process.exit(1);
        }

        // If no round specified, just list
        if (!options.round && !options.all) {
            console.log(chalk.white('Available rounds:'));
            for (const r of available) {
                console.log(chalk.gray(`  ${r}`));
            }
            console.log(chalk.gray('\nUse --round <id> to import a specific round, or --all for all rounds'));
            return;
        }

        const segmentCategories = options.segments.split(',').map((s: string) => s.trim());
        const adapterOpts = {
            segmentCategories,
            includeDemographicQuestions: !!options.includeDemographicQuestions,
            minSampleSize: parseInt(options.minSampleSize, 10),
            questionIds: options.questions ? options.questions.split(',').map((s: string) => s.trim()) : undefined,
        };

        const roundsToImport = options.all ? available : [options.round];

        for (const roundId of roundsToImport) {
            if (!available.includes(roundId)) {
                console.error(chalk.red(`Round ${roundId} not found. Available: ${available.join(', ')}`));
                continue;
            }

            console.log(chalk.white(`Importing ${roundId}...`));

            const data = loadGlobalDialoguesRound(dataDir, roundId, adapterOpts);
            const summary = summarizeDataset(data);

            console.log(chalk.green(`  Questions:  ${summary.questionCount}`));
            console.log(chalk.green(`  Segments:   ${summary.segmentCount} (${summary.segmentCategories.join(', ')})`));
            console.log(chalk.green(`  Responses:  ${summary.totalResponses}`));
            if (summary.sampleSizeRange.max > 0) {
                console.log(chalk.green(`  Sample sizes: ${summary.sampleSizeRange.min}–${summary.sampleSizeRange.max}`));
            }

            // Validate
            const validation = validateDTEFSurveyData(data);
            if (validation.warnings.length > 0) {
                console.log(chalk.yellow(`  Warnings: ${validation.warnings.length}`));
            }
            if (!validation.valid) {
                console.log(chalk.red(`  Validation failed: ${validation.errors.length} error(s)`));
                for (const e of validation.errors.slice(0, 5)) {
                    console.log(chalk.red(`    - ${e.path}: ${e.message}`));
                }
                continue;
            }

            if (options.dryRun) {
                console.log(chalk.yellow('  Dry run - not writing file\n'));
                continue;
            }

            const outputPath = options.output
                ? path.resolve(options.output)
                : path.resolve(`./output/${roundId.toLowerCase()}.json`);

            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(chalk.gray(`  Written: ${outputPath}\n`));
        }

        console.log(chalk.green('Done!'));
    });

/**
 * dtef generate-baseline - Generate synthetic baseline results for leaderboard comparison
 */
dtefCommand
    .command('generate-baseline')
    .description('Generate synthetic baseline predictor results (population-marginal or uniform)')
    .requiredOption('-i, --input <path>', 'Path to DTEF survey data JSON file')
    .option('-o, --output <dir>', 'Output directory for generated results', './output/dtef-baselines')
    .option('-t, --type <baseline>', 'Baseline type: population-marginal or uniform', 'population-marginal')
    .option('--upload', 'Save results directly to S3 using the standard result storage path')
    .option('--force', 'Overwrite existing baseline files without prompting')
    .option('--dry-run', 'Show summary without writing files')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nDTEF Baseline Generator\n'));

        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(chalk.red(`Input file not found: ${inputPath}`));
            process.exit(1);
        }

        let surveyData: DTEFSurveyData;
        try {
            const raw = fs.readFileSync(inputPath, 'utf-8');
            surveyData = JSON.parse(raw);
        } catch (e: any) {
            console.error(chalk.red(`Failed to parse input file: ${e.message}`));
            process.exit(1);
        }

        const baselineType = options.type as BaselineType;
        if (!['population-marginal', 'uniform', 'random-dirichlet', 'shuffled'].includes(baselineType)) {
            console.error(chalk.red('--type must be "population-marginal", "uniform", "random-dirichlet", or "shuffled"'));
            process.exit(1);
        }

        console.log(chalk.gray(`Baseline type: ${baselineType}`));
        console.log(chalk.gray(`Segments: ${surveyData.segments.length}`));
        console.log(chalk.gray(`Questions: ${Object.keys(surveyData.questions).length}\n`));

        const results = generateBaselineResults(surveyData, baselineType);
        const meanScore = getBaselineMeanScore(results);

        console.log(chalk.green(`Generated ${results.length} baseline result(s)`));
        console.log(chalk.green(`Mean JSD similarity: ${meanScore.toFixed(4)}\n`));

        if (options.dryRun) {
            console.log(chalk.yellow('Dry run - not writing files\n'));
            for (const r of results) {
                const scores = r.evaluationResults?.llmCoverageScores;
                const promptScores = Object.values(scores || {}).map(ps => {
                    const ms = Object.values(ps)[0];
                    return ms?.avgCoverageExtent ?? 0;
                });
                const avg = promptScores.length > 0
                    ? promptScores.reduce((a, b) => a + b, 0) / promptScores.length
                    : 0;
                console.log(chalk.white(`  ${r.configId}: ${r.promptIds.length} prompts, avg score ${avg.toFixed(4)}`));
            }
            return;
        }

        // --upload: save directly to S3 using the standard result directory structure
        // so dtef-rebuild can discover them via listConfigIds/listRunsForConfig
        if (options.upload) {
            let uploaded = 0;
            let failed = 0;
            for (const result of results) {
                const safeTs = toSafeTimestamp(result.timestamp);
                const fileName = `${result.runLabel}_${safeTs}_comparison.json`;
                const saved = await saveResult(result.configId, fileName, result);
                if (saved) {
                    uploaded++;
                } else {
                    console.error(chalk.red(`  Failed to save: ${result.configId}`));
                    failed++;
                }
            }
            console.log(chalk.green(`\nDone! ${uploaded} result(s) saved to storage.`));
            if (failed > 0) console.log(chalk.red(`${failed} failed.`));
            console.log(chalk.gray('Run "make dtef-rebuild" to update the demographics page.'));
            return;
        }

        const outputDir = path.resolve(options.output);
        fs.mkdirSync(outputDir, { recursive: true });

        // Check for existing files
        const existingFiles: string[] = [];
        for (const result of results) {
            const filename = `${result.configId}--${result.runLabel}.json`;
            const filepath = path.join(outputDir, filename);
            if (fs.existsSync(filepath)) {
                existingFiles.push(filename);
            }
        }

        if (existingFiles.length > 0 && !options.force) {
            console.log(chalk.yellow(`${existingFiles.length} of ${results.length} baseline file(s) already exist in ${outputDir}:`));
            for (const f of existingFiles.slice(0, 5)) {
                console.log(chalk.yellow(`  ${f}`));
            }
            if (existingFiles.length > 5) {
                console.log(chalk.yellow(`  ... and ${existingFiles.length - 5} more`));
            }
            console.log(chalk.yellow('\nBaseline results are deterministic — re-running produces identical output.'));
            console.log(chalk.yellow('Use --force to overwrite, or --dry-run to preview without writing.\n'));
            process.exit(0);
        }

        let written = 0;
        for (const result of results) {
            const filename = `${result.configId}--${result.runLabel}.json`;
            const filepath = path.join(outputDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
            written++;
            console.log(chalk.gray(`  Written: ${filepath}`));
        }

        console.log(chalk.green(`\nDone! ${written} result(s) written to ${outputDir}`));
        console.log(chalk.gray('Use --upload to save directly to S3, or upload manually.'));
    });

/**
 * dtef experiment - Manage experiments
 */
const experimentCommand = dtefCommand
    .command('experiment')
    .description('Manage A/B experiments');

/**
 * dtef experiment create
 */
experimentCommand
    .command('create')
    .description('Create a new experiment')
    .requiredOption('--id <id>', 'Experiment ID (alphanumeric + hyphens)')
    .requiredOption('--title <title>', 'Experiment title')
    .requiredOption('--hypothesis <text>', 'Experiment hypothesis')
    .option('--success-criteria <text>', 'Success criteria', 'Treatment condition outperforms control')
    .option('--independent-variable <var>', 'Independent variable', 'contextFormat')
    .option('--status <status>', 'Initial status', 'planned')
    .option('--dry-run', 'Show experiment JSON without saving')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        const record: ExperimentRecord = {
            id: options.id,
            title: options.title,
            status: options.status as ExperimentStatus,
            createdAt: new Date().toISOString(),
            completedAt: null,
            hypothesis: options.hypothesis,
            successCriteria: options.successCriteria,
            design: {
                independentVariable: options.independentVariable,
                conditions: [],
                segments: 'all',
                models: 'CORE',
                subjectQuestions: 'all',
            },
            configIds: [],
            results: null,
            conclusion: null,
            notes: '',
        };

        if (options.dryRun) {
            console.log(chalk.yellow('Dry run — experiment JSON:'));
            console.log(JSON.stringify(record, null, 2));
            return;
        }

        await saveJsonFile(`live/experiments/${record.id}.json`, record);
        console.log(chalk.green(`Experiment "${record.id}" created at live/experiments/${record.id}.json`));
    });

/**
 * dtef experiment status
 */
experimentCommand
    .command('status')
    .description('Show experiment status')
    .requiredOption('--id <id>', 'Experiment ID')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        const record = await getJsonFile<ExperimentRecord>(`live/experiments/${options.id}.json`);
        if (!record) {
            console.error(chalk.red(`Experiment "${options.id}" not found`));
            process.exit(1);
        }

        console.log(chalk.blue(`\nExperiment: ${record.title}`));
        console.log(`  ID:         ${record.id}`);
        console.log(`  Status:     ${record.status}`);
        console.log(`  Hypothesis: ${record.hypothesis}`);
        console.log(`  Configs:    ${record.configIds.length}`);
        if (record.results) {
            console.log(`  Summary:    ${record.results.summary}`);
            if (record.results.conditionScores) {
                for (const [name, score] of Object.entries(record.results.conditionScores)) {
                    console.log(`  ${name}: ${score.toFixed(4)}`);
                }
            }
        }
        if (record.conclusion) {
            console.log(`  Conclusion: ${record.conclusion}`);
        }
    });

/**
 * dtef experiment conclude
 */
experimentCommand
    .command('conclude')
    .description('Set experiment conclusion')
    .requiredOption('--id <id>', 'Experiment ID')
    .requiredOption('--conclusion <conclusion>', 'Conclusion: promoted, rejected, or needs-more-data')
    .option('--summary <text>', 'Results summary')
    .option('--notes <text>', 'Additional notes')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        const validConclusions = ['promoted', 'rejected', 'needs-more-data'];
        if (!validConclusions.includes(options.conclusion)) {
            console.error(chalk.red(`--conclusion must be one of: ${validConclusions.join(', ')}`));
            process.exit(1);
        }

        const record = await getJsonFile<ExperimentRecord>(`live/experiments/${options.id}.json`);
        if (!record) {
            console.error(chalk.red(`Experiment "${options.id}" not found`));
            process.exit(1);
        }

        record.status = 'completed';
        record.completedAt = new Date().toISOString();
        record.conclusion = options.conclusion as ExperimentConclusion;
        if (options.summary) {
            record.results = record.results || { summary: '' };
            record.results.summary = options.summary;
        }
        if (options.notes) {
            record.notes = options.notes;
        }

        await saveJsonFile(`live/experiments/${record.id}.json`, record);
        console.log(chalk.green(`Experiment "${record.id}" concluded as: ${record.conclusion}`));
    });

/**
 * dtef experiment rebuild-index
 */
experimentCommand
    .command('rebuild-index')
    .description('Rebuild the experiments index from individual experiment files')
    .action(async () => {
        const chalk = (await import('chalk')).default;
        const { S3Client: S3, ListObjectsV2Command: ListCmd } = await import('@aws-sdk/client-s3');

        console.log(chalk.blue('\nRebuilding experiments index...\n'));

        // List all experiment files
        const experiments: ExperimentRecord[] = [];
        const prefix = 'live/experiments/';

        try {
            const s3Client = new S3({ region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1' });
            const bucket = process.env.APP_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
            if (!bucket) {
                console.error(chalk.red('APP_S3_BUCKET_NAME / S3_BUCKET_NAME not set'));
                process.exit(1);
            }

            let continuationToken: string | undefined;
            const keys: string[] = [];
            do {
                const resp = await s3Client.send(new ListCmd({
                    Bucket: bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }));
                for (const obj of resp.Contents || []) {
                    if (obj.Key && obj.Key.endsWith('.json')) {
                        keys.push(obj.Key);
                    }
                }
                continuationToken = resp.NextContinuationToken;
            } while (continuationToken);

            console.log(chalk.gray(`Found ${keys.length} experiment file(s)`));

            for (const key of keys) {
                const record = await getJsonFile<ExperimentRecord>(key);
                if (record && record.id) {
                    experiments.push(record);
                    console.log(chalk.gray(`  ${record.id}: ${record.status}`));
                }
            }
        } catch (err: any) {
            console.error(chalk.red(`Error listing experiments: ${err.message}`));
            process.exit(1);
        }

        const index: ExperimentIndex = {
            experiments: experiments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            lastUpdated: new Date().toISOString(),
        };

        await saveJsonFile('live/aggregates/experiments_index.json', index);
        console.log(chalk.green(`\nIndex rebuilt: ${experiments.length} experiment(s)`));
    });

/**
 * dtef experiment analyze - Aggregate eval results and compute statistics
 */
experimentCommand
    .command('analyze')
    .description('Analyze experiment results: aggregate scores by condition, compute statistics')
    .requiredOption('--id <id>', 'Experiment ID')
    .option('--dry-run', 'Show analysis without writing back to S3')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nExperiment Analysis\n'));

        const record = await getJsonFile<ExperimentRecord>(`live/experiments/${options.id}.json`);
        if (!record) {
            console.error(chalk.red(`Experiment "${options.id}" not found`));
            process.exit(1);
        }

        console.log(chalk.white(`Experiment: ${record.title}`));
        console.log(chalk.white(`Hypothesis: ${record.hypothesis}\n`));

        const conditionMap = record.design.conditionMap;
        if (!conditionMap || Object.keys(conditionMap).length === 0) {
            console.error(chalk.red('No conditionMap defined. Use --experiment-id/--condition-name with generate, or add-configs.'));
            process.exit(1);
        }

        const conditionNames = Object.keys(conditionMap);
        console.log(chalk.gray(`Conditions: ${conditionNames.join(', ')}`));

        // Collect scores per condition
        const perConditionStats: Record<string, { mean: number; stddev: number; n: number; scores: number[] }> = {};
        let totalAnalyzed = 0;
        let totalMissing = 0;

        for (const condName of conditionNames) {
            const configIds = conditionMap[condName];
            const scores: number[] = [];

            for (const configId of configIds) {
                const summary = await getConfigSummary(configId);
                if (!summary || summary.runs.length === 0) {
                    totalMissing++;
                    continue;
                }

                // Use the latest run's hybrid score
                const latestRun = summary.runs[0];
                const score = latestRun.hybridScoreStats?.average;
                if (score != null) {
                    scores.push(score);
                    totalAnalyzed++;
                } else {
                    totalMissing++;
                }
            }

            if (scores.length > 0) {
                const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
                const sd = scores.length > 1 ? stddev(scores) : 0;
                perConditionStats[condName] = { mean, stddev: sd, n: scores.length, scores };
                console.log(chalk.green(`  ${condName}: mean=${mean.toFixed(4)}, sd=${sd.toFixed(4)}, n=${scores.length}/${configIds.length}`));
            } else {
                console.log(chalk.yellow(`  ${condName}: no scores available (0/${configIds.length} configs have results)`));
            }
        }

        if (totalAnalyzed === 0) {
            console.error(chalk.red('\nNo configs have results yet. Run evaluations first.'));
            process.exit(1);
        }

        // Build conditionScores
        const conditionScores: Record<string, number> = {};
        for (const [name, stats] of Object.entries(perConditionStats)) {
            conditionScores[name] = stats.mean;
        }

        // Compute statistics if exactly 2 conditions
        let pValue: number | undefined;
        let effectSize: number | undefined;
        let summaryText: string;

        const statsEntries = Object.entries(perConditionStats);
        if (statsEntries.length === 2) {
            const [nameA, statsA] = statsEntries[0];
            const [nameB, statsB] = statsEntries[1];

            if (statsA.scores.length >= 2 && statsB.scores.length >= 2) {
                const tResult = welchTTest(statsA.scores, statsB.scores);
                const d = cohensD(statsA.scores, statsB.scores);
                pValue = tResult.pValue;
                effectSize = Math.abs(d);

                const delta = statsA.mean - statsB.mean;
                const deltaSign = delta >= 0 ? '+' : '';
                const effect = interpretEffectSize(d);

                summaryText = `${nameA} scored ${statsA.mean.toFixed(4)} vs ${nameB} at ${statsB.mean.toFixed(4)}, Δ=${deltaSign}${delta.toFixed(4)}, p=${pValue.toFixed(4)}, d=${Math.abs(d).toFixed(3)} (${effect})`;

                console.log(chalk.white(`\n  Welch's t-test: t=${tResult.t.toFixed(3)}, df=${tResult.df.toFixed(1)}, p=${pValue.toFixed(4)}`));
                console.log(chalk.white(`  Cohen's d: ${d.toFixed(3)} (${effect})`));
            } else {
                summaryText = `${nameA}: ${statsA.mean.toFixed(4)} (n=${statsA.n}), ${nameB}: ${statsB.mean.toFixed(4)} (n=${statsB.n}) — insufficient data for significance test`;
            }
        } else {
            const parts = statsEntries.map(([name, stats]) => `${name}: ${stats.mean.toFixed(4)} (n=${stats.n})`);
            summaryText = parts.join(', ');
        }

        console.log(chalk.blue(`\nSummary: ${summaryText}`));
        console.log(chalk.gray(`Configs analyzed: ${totalAnalyzed}, missing: ${totalMissing}`));

        if (options.dryRun) {
            console.log(chalk.yellow('\nDry run — not writing results to S3'));
            return;
        }

        // Write results back
        record.results = {
            summary: summaryText,
            conditionScores,
            pValue,
            effectSize,
            perConditionStats,
            analyzedAt: new Date().toISOString(),
            configsAnalyzed: totalAnalyzed,
            configsMissing: totalMissing,
        };

        if (totalMissing === 0 && totalAnalyzed > 0) {
            record.status = 'completed';
        } else if (totalAnalyzed > 0) {
            record.status = 'running';
        }

        await saveJsonFile(`live/experiments/${record.id}.json`, record);
        console.log(chalk.green(`\nResults written to live/experiments/${record.id}.json`));

        // Rebuild index
        console.log(chalk.gray('Rebuilding experiment index...'));
        const { S3Client: S3, ListObjectsV2Command: ListCmd } = await import('@aws-sdk/client-s3');
        const experiments: ExperimentRecord[] = [];
        const prefix = 'live/experiments/';

        try {
            const s3Client = new S3({ region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1' });
            const bucket = process.env.APP_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
            if (bucket) {
                let continuationToken: string | undefined;
                const keys: string[] = [];
                do {
                    const resp = await s3Client.send(new ListCmd({
                        Bucket: bucket,
                        Prefix: prefix,
                        ContinuationToken: continuationToken,
                    }));
                    for (const obj of resp.Contents || []) {
                        if (obj.Key && obj.Key.endsWith('.json')) {
                            keys.push(obj.Key);
                        }
                    }
                    continuationToken = resp.NextContinuationToken;
                } while (continuationToken);

                for (const key of keys) {
                    const exp = await getJsonFile<ExperimentRecord>(key);
                    if (exp && exp.id) experiments.push(exp);
                }

                const index: ExperimentIndex = {
                    experiments: experiments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
                    lastUpdated: new Date().toISOString(),
                };
                await saveJsonFile('live/aggregates/experiments_index.json', index);
                console.log(chalk.green(`Index rebuilt: ${experiments.length} experiment(s)`));
            }
        } catch (err: any) {
            console.log(chalk.yellow(`Warning: could not rebuild index: ${err.message}`));
        }
    });

/**
 * dtef experiment add-configs - Add configIds to an experiment condition
 */
experimentCommand
    .command('add-configs')
    .description('Add configIds to an experiment condition mapping')
    .requiredOption('--id <id>', 'Experiment ID')
    .requiredOption('--condition <name>', 'Condition name')
    .requiredOption('--configs <ids>', 'Comma-separated configIds to add')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        const record = await getJsonFile<ExperimentRecord>(`live/experiments/${options.id}.json`);
        if (!record) {
            console.error(chalk.red(`Experiment "${options.id}" not found`));
            process.exit(1);
        }

        if (!record.design.conditionMap) record.design.conditionMap = {};

        const configIds = options.configs.split(',').map((s: string) => s.trim());
        const existing = record.design.conditionMap[options.condition] || [];
        const merged = [...new Set([...existing, ...configIds])];
        record.design.conditionMap[options.condition] = merged;

        // Also merge into top-level configIds
        record.configIds = [...new Set([...record.configIds, ...configIds])];

        await saveJsonFile(`live/experiments/${record.id}.json`, record);
        console.log(chalk.green(`Added ${configIds.length} configIds to condition "${options.condition}" (total: ${merged.length})`));
        console.log(chalk.gray(`Experiment "${record.id}" now has ${record.configIds.length} total configIds`));
    });

/**
 * dtef curate-questions - LLM-powered question curation
 */
dtefCommand
    .command('curate-questions')
    .description('Use frontier LLMs to curate survey questions for evaluation')
    .requiredOption('-i, --input <path>', 'Path to DTEF survey data JSON file')
    .option('-o, --output <path>', 'Output path for curation results')
    .option('--models <list>', 'Comma-separated model IDs for curation', 'claude-sonnet-4,gpt-4.1,google/gemini-2.5-pro-preview')
    .option('--top-n <n>', 'Number of top-ranked questions to highlight', '50')
    .option('--force', 'Overwrite existing curation file')
    .option('--dry-run', 'Show the curation prompt without calling models')
    .action(async (options) => {
        const chalk = (await import('chalk')).default;

        console.log(chalk.blue('\nDTEF Question Curation\n'));

        const inputPath = path.resolve(options.input);
        if (!fs.existsSync(inputPath)) {
            console.error(chalk.red(`Input file not found: ${inputPath}`));
            process.exit(1);
        }

        let surveyData: DTEFSurveyData;
        try {
            const raw = fs.readFileSync(inputPath, 'utf-8');
            surveyData = JSON.parse(raw);
        } catch (e: any) {
            console.error(chalk.red(`Failed to parse input file: ${e.message}`));
            process.exit(1);
        }

        const questionCount = Object.keys(surveyData.questions).length;
        console.log(chalk.gray(`Survey: ${surveyData.surveyName} (${surveyData.surveyId})`));
        console.log(chalk.gray(`Questions: ${questionCount}\n`));

        const prompt = buildCurationPrompt(surveyData);

        if (options.dryRun) {
            console.log(chalk.yellow('Dry run — curation prompt:\n'));
            console.log(prompt);
            console.log(chalk.yellow(`\nPrompt length: ~${prompt.length} chars`));
            console.log(chalk.gray(`\nModels that would be queried: ${options.models}`));
            return;
        }

        // Check for existing output
        const outputPath = options.output
            ? path.resolve(options.output)
            : path.resolve(`data/question-curation/${surveyData.surveyId}.json`);

        if (fs.existsSync(outputPath) && !options.force) {
            console.log(chalk.yellow(`Curation file already exists: ${outputPath}`));
            console.log(chalk.yellow('Use --force to overwrite.'));
            process.exit(0);
        }

        // Actually call models
        const { getModelResponse } = await import('../services/llm-service');
        const modelIds = options.models.split(',').map((s: string) => s.trim());

        console.log(chalk.gray(`Querying ${modelIds.length} models for curation...\n`));

        const modelResults: import('../services/questionCurationService').ModelCurationResult[] = [];

        for (const modelId of modelIds) {
            console.log(chalk.gray(`  Querying ${modelId}...`));
            try {
                const response = await getModelResponse({
                    modelId: `openrouter:${modelId}`,
                    prompt,
                    temperature: 0.3,
                    maxTokens: 4096,
                    useCache: true,
                    timeout: 120000,
                    retries: 2,
                });
                const parsed = parseCurationResponse(response, modelId);
                modelResults.push(parsed);
                console.log(chalk.green(`    ${parsed.exclusions.length} exclusions, ${parsed.subjectRanking.length} ranked`));
            } catch (err: any) {
                console.error(chalk.red(`    Failed: ${err.message}`));
            }
        }

        if (modelResults.length === 0) {
            console.error(chalk.red('\nNo models returned valid results. Curation aborted.'));
            process.exit(1);
        }

        // Compute consensus and save
        const curationResult = buildCurationResult(surveyData, modelResults);

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(curationResult, null, 2), 'utf-8');

        console.log(chalk.green(`\nCuration complete:`));
        console.log(chalk.green(`  Models queried: ${modelResults.length}/${modelIds.length}`));
        console.log(chalk.green(`  Questions excluded: ${curationResult.excludedCount}/${curationResult.questionCount}`));
        console.log(chalk.green(`  Top ranked: ${curationResult.consensus.subjectRanking.filter(r => r.voteCount > 0).length}`));
        console.log(chalk.green(`  Saved to: ${outputPath}`));
    });
