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
import { DTEFSurveyData, DTEFBlueprintConfig } from '@/types/dtef';
import * as yaml from 'js-yaml';
import {
    convertGlobalDialogues,
    detectAvailableRounds,
    loadGlobalDialoguesRound,
    summarizeDataset,
} from '../services/adapters/globalDialoguesAdapter';

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
    .option('--batch-size <n>', 'Number of questions per batched prompt (1-5, default: 1)', '1')
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

        // Build config
        const targetQuestionIds = options.questions
            ? options.questions.split(',').map((s: string) => s.trim())
            : Object.keys(surveyData.questions);

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

        const batchSize = parseInt(options.batchSize, 10);
        if (batchSize < 1 || batchSize > 5) {
            console.error(chalk.red('--batch-size must be between 1 and 5'));
            process.exit(1);
        }

        // Generate blueprints (possibly at multiple context levels)
        console.log(chalk.gray('Generating blueprints...'));

        let allBlueprints: ReturnType<typeof DemographicBlueprintService.generateBlueprints> = [];

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
                    targetQuestionIds,
                    contextQuestionIds: levelContextIds,
                    contextQuestionCount: levelContextCount,
                    segmentSelection: options.segments ? 'specific' : 'all',
                    segmentIds: options.segments?.split(',').map((s: string) => s.trim()),
                    tokenBudget: parseInt(options.tokenBudget, 10),
                    batchSize: batchSize > 1 ? batchSize : undefined,
                    modelConfig: {
                        models: options.models.split(',').map((s: string) => s.trim()),
                        temperature: parseFloat(options.temperature),
                    },
                };

                const levelLabel = level === -1 ? 'all' : level === 0 ? '0 (baseline)' : String(level);
                console.log(chalk.gray(`  Context level ${levelLabel}...`));
                const blueprints = DemographicBlueprintService.generateBlueprints(config);
                allBlueprints.push(...blueprints);
            }
        } else {
            const config: DTEFBlueprintConfig = {
                surveyData,
                targetQuestionIds,
                contextQuestionIds,
                segmentSelection: options.segments ? 'specific' : 'all',
                segmentIds: options.segments?.split(',').map((s: string) => s.trim()),
                tokenBudget: parseInt(options.tokenBudget, 10),
                batchSize: batchSize > 1 ? batchSize : undefined,
                modelConfig: {
                    models: options.models.split(',').map((s: string) => s.trim()),
                    temperature: parseFloat(options.temperature),
                },
            };
            allBlueprints = DemographicBlueprintService.generateBlueprints(config);
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
