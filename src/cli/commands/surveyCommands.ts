import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SurveyBlueprintService } from '../services/surveyBlueprintService';
import { SurveyValidator } from '../services/surveyValidator';
import { SurveyEvaluationStrategies } from '../services/surveyEvaluationStrategies';
import { SurveyBlueprintConfig, Survey } from '@/types/survey';
import { IterativeProfileHoldoutConfig } from '@/types/surveyEvaluationStrategies';
import { WevalConfig } from '@/types/shared';
import chalk from 'chalk';

export function registerSurveyCommands(program: Command) {
    const surveyCommand = program
        .command('survey')
        .description('Commands for working with survey data and blueprint generation');

    surveyCommand
        .command('generate')
        .description('Generate Weval blueprints from survey data')
        .requiredOption('-s, --survey <path>', 'Path to survey data JSON file')
        .option('-c, --config <path>', 'Path to survey blueprint configuration YAML/JSON file')
        .option('-o, --output <directory>', 'Output directory for generated blueprints', './generated-blueprints')
        .option('-t, --target-questions <ids...>', 'Target question IDs to predict')
        .option('-x, --context-questions <ids...>', 'Context question IDs to include')
        .option('-d, --demographics [fields...]', 'Include demographics (all or specific fields)')
        .option('-p, --participants <selection>', 'Participant selection: all, random, first, specific', 'all')
        .option('-n, --count <number>', 'Number of participants to include', parseInt)
        .option('--participant-ids <ids...>', 'Specific participant IDs to include')
        .option('-m, --models <models...>', 'Models to evaluate')
        .option('--temperature <number>', 'Temperature for model responses', parseFloat)
        .option('--judge-models <models...>', 'Judge models for evaluation')
        .option('--dry-run', 'Preview blueprints without saving')
        .action(async (options) => {
            try {
                console.log(chalk.blue('🔄 Loading survey data...'));
                
                // Load survey data
                const surveyPath = path.resolve(options.survey);
                const surveyContent = await fs.readFile(surveyPath, 'utf-8');
                const survey: Survey = JSON.parse(surveyContent);
                
                console.log(chalk.green(`✓ Loaded survey: ${survey.title}`));
                console.log(chalk.gray(`  - ${survey.participants.length} participants`));
                console.log(chalk.gray(`  - ${survey.surveyQuestions.length} survey questions`));
                console.log(chalk.gray(`  - ${survey.demographicQuestions.length} demographic questions`));

                // Build configuration
                let config: SurveyBlueprintConfig;

                if (options.config) {
                    // Load config from file
                    const configPath = path.resolve(options.config);
                    const configContent = await fs.readFile(configPath, 'utf-8');
                    const configData = configPath.endsWith('.yaml') || configPath.endsWith('.yml')
                        ? yaml.load(configContent)
                        : JSON.parse(configContent);
                    
                    config = {
                        survey,
                        ...configData
                    };
                } else {
                    // Build config from command line options
                    config = {
                        survey,
                        targetQuestionIds: options.targetQuestions || [],
                        contextQuestionIds: options.contextQuestions,
                        includeDemographics: options.demographics === true 
                            ? true 
                            : Array.isArray(options.demographics) 
                                ? options.demographics 
                                : false,
                        participantSelection: options.participants as any,
                        participantCount: options.count,
                        participantIds: options.participantIds,
                        modelConfig: {
                            models: options.models,
                            temperature: options.temperature,
                            judgeModels: options.judgeModels
                        }
                    };
                }

                // Validate configuration
                if (!config.targetQuestionIds || config.targetQuestionIds.length === 0) {
                    throw new Error('No target questions specified. Use --target-questions or provide a config file.');
                }

                console.log(chalk.blue('🔧 Generating blueprints...'));
                console.log(chalk.gray(`  - Target questions: ${config.targetQuestionIds.join(', ')}`));
                console.log(chalk.gray(`  - Participant selection: ${config.participantSelection}`));
                if (config.participantCount) {
                    console.log(chalk.gray(`  - Participant count: ${config.participantCount}`));
                }

                // Generate blueprints
                const blueprints = await SurveyBlueprintService.generateBlueprints(config);

                console.log(chalk.green(`✓ Generated ${blueprints.length} blueprints`));

                if (options.dryRun) {
                    console.log(chalk.yellow('\n📋 Preview (dry run - not saved):'));
                    console.log(JSON.stringify(blueprints[0], null, 2));
                    console.log(chalk.gray(`\n... and ${blueprints.length - 1} more blueprints`));
                } else {
                    // Save blueprints
                    const outputDir = path.resolve(options.output);
                    await fs.mkdir(outputDir, { recursive: true });

                    for (const blueprint of blueprints) {
                        const filename = `${blueprint.configId}.yaml`;
                        const filepath = path.join(outputDir, filename);
                        const content = yaml.dump(blueprint);
                        await fs.writeFile(filepath, content);
                    }

                    console.log(chalk.green(`✓ Saved blueprints to ${outputDir}`));

                    // Create index file
                    const indexPath = path.join(outputDir, 'index.json');
                    const index = {
                        surveyId: survey.id,
                        surveyTitle: survey.title,
                        generated: new Date().toISOString(),
                        blueprints: blueprints.map(b => ({
                            id: b.configId,
                            title: b.configTitle,
                            file: `${b.configId}.yaml`
                        }))
                    };
                    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
                    console.log(chalk.green(`✓ Created index at ${indexPath}`));
                }

            } catch (error) {
                console.error(chalk.red('Error generating blueprints:'), error);
                process.exit(1);
            }
        });

    surveyCommand
        .command('validate')
        .description('Validate survey data structure')
        .requiredOption('-s, --survey <path>', 'Path to survey data JSON file')
        .option('--strict', 'Exit with error code if validation fails')
        .action(async (options) => {
            try {
                console.log(chalk.blue('🔍 Validating survey data...'));
                
                const surveyPath = path.resolve(options.survey);
                const surveyContent = await fs.readFile(surveyPath, 'utf-8');
                
                // First try to parse the survey
                let survey: Survey;
                try {
                    survey = SurveyBlueprintService.importSurveyData(surveyContent);
                } catch (parseError: any) {
                    console.error(chalk.red('❌ Failed to parse survey data:'), parseError.message);
                    if (options.strict) process.exit(1);
                    return;
                }
                
                // Run comprehensive validation
                const validator = new SurveyValidator();
                const issues = validator.validate(survey);
                const { errors, warnings, isValid } = SurveyValidator.formatResults(issues);
                
                // Display results
                if (errors.length > 0) {
                    console.log(chalk.red(`\n❌ Found ${errors.length} error(s):`));
                    errors.forEach((error, idx) => {
                        console.log(chalk.red(`  ${idx + 1}. ${error.message}`));
                        if (error.details) {
                            console.log(chalk.gray(`     Details: ${JSON.stringify(error.details)}`));
                        }
                    });
                }
                
                if (warnings.length > 0) {
                    console.log(chalk.yellow(`\n⚠️  Found ${warnings.length} warning(s):`));
                    warnings.forEach((warning, idx) => {
                        console.log(chalk.yellow(`  ${idx + 1}. ${warning.message}`));
                        if (warning.details) {
                            console.log(chalk.gray(`     Details: ${JSON.stringify(warning.details)}`));
                        }
                    });
                }
                
                if (isValid && warnings.length === 0) {
                    console.log(chalk.green('\n✅ Survey data is perfectly valid!'));
                } else if (isValid) {
                    console.log(chalk.green('\n✅ Survey data is valid (with warnings)'));
                } else {
                    console.log(chalk.red('\n❌ Survey data has errors that must be fixed'));
                }

                // Print summary
                console.log(chalk.blue('\n📊 Survey Summary:'));
                console.log(chalk.gray(`  Title: ${survey.title}`));
                console.log(chalk.gray(`  ID: ${survey.id}`));
                console.log(chalk.gray(`  Participants: ${survey.participants.length}`));
                console.log(chalk.gray(`  Demographic Questions: ${survey.demographicQuestions.length}`));
                console.log(chalk.gray(`  Survey Questions: ${survey.surveyQuestions.length}`));
                
                // Question type breakdown
                const typeCount: Record<string, number> = {};
                [...survey.demographicQuestions, ...survey.surveyQuestions].forEach(q => {
                    typeCount[q.type] = (typeCount[q.type] || 0) + 1;
                });
                console.log(chalk.gray('\n  Question Types:'));
                Object.entries(typeCount).forEach(([type, count]) => {
                    console.log(chalk.gray(`    - ${type}: ${count}`));
                });
                
                // Response completeness (only survey questions, not demographics)
                const allNonTextSurveyQuestions = survey.surveyQuestions
                    .filter(q => q.type !== 'text-content');
                const expectedResponses = allNonTextSurveyQuestions.length;
                
                console.log(chalk.gray('\n  Response Completeness:'));
                survey.participants.forEach(p => {
                    const responseCount = p.responses.length;
                    const percentage = Math.round((responseCount / expectedResponses) * 100);
                    const status = percentage === 100 ? chalk.green('✓') : chalk.yellow('⚠');
                    console.log(chalk.gray(`    - Participant ${p.id}: ${responseCount}/${expectedResponses} (${percentage}%) ${status}`));
                });
                
                // Exit with error if strict mode and validation failed
                if (options.strict && !isValid) {
                    process.exit(1);
                }

            } catch (error) {
                console.error(chalk.red('Error validating survey:'), error);
                process.exit(1);
            }
        });

    surveyCommand
        .command('example')
        .description('Generate an example survey data file')
        .option('-o, --output <path>', 'Output path for example file', './example-survey.json')
        .action(async (options) => {
            try {
                const exampleSurvey: Survey = {
                    id: 'example-survey-001',
                    title: 'AI Companion Acceptance Survey',
                    description: 'A survey exploring attitudes towards emotional connections with various entities',
                    demographicQuestions: [
                        {
                            id: 'demo-age',
                            type: 'single-select',
                            text: 'What is your age group?',
                            order: 0,
                            options: ['18-25', '26-35', '36-45', '46-55', '56-65', '66+']
                        },
                        {
                            id: 'demo-gender',
                            type: 'single-select',
                            text: 'What is your gender?',
                            order: 0,
                            options: ['Male', 'Female', 'Non-binary', 'Prefer not to say']
                        },
                        {
                            id: 'demo-country',
                            type: 'open-ended',
                            text: 'What country do you live in?',
                            order: 0
                        }
                    ],
                    surveyQuestions: [
                        {
                            id: 'q1',
                            type: 'single-select',
                            text: 'How acceptable is it for people to develop emotional connections with pets?',
                            order: 1,
                            options: [
                                'Completely Acceptable',
                                'Mostly Acceptable',
                                'Neutral / No Opinion',
                                'Mostly Unacceptable',
                                'Completely Unacceptable'
                            ]
                        },
                        {
                            id: 'q2',
                            type: 'single-select',
                            text: 'How acceptable is it for people to develop emotional connections with plants?',
                            order: 2,
                            options: [
                                'Completely Acceptable',
                                'Mostly Acceptable',
                                'Neutral / No Opinion',
                                'Mostly Unacceptable',
                                'Completely Unacceptable'
                            ]
                        },
                        {
                            id: 'q3',
                            type: 'single-select',
                            text: 'How acceptable is it for people to develop emotional connections with AI chatbots?',
                            order: 3,
                            options: [
                                'Completely Acceptable',
                                'Mostly Acceptable',
                                'Neutral / No Opinion',
                                'Mostly Unacceptable',
                                'Completely Unacceptable'
                            ]
                        }
                    ],
                    participants: [
                        {
                            id: 'p001',
                            demographics: {
                                age_group: '18-25',
                                gender: 'Female',
                                country: 'United States'
                            },
                            responses: [
                                { questionId: 'demo-age', answer: '18-25' },
                                { questionId: 'demo-gender', answer: 'Female' },
                                { questionId: 'demo-country', answer: 'United States' },
                                { questionId: 'q1', answer: 'Completely Acceptable' },
                                { questionId: 'q2', answer: 'Mostly Acceptable' },
                                { questionId: 'q3', answer: 'Neutral / No Opinion' }
                            ]
                        },
                        {
                            id: 'p002',
                            demographics: {
                                age_group: '36-45',
                                gender: 'Male',
                                country: 'Canada'
                            },
                            responses: [
                                { questionId: 'demo-age', answer: '36-45' },
                                { questionId: 'demo-gender', answer: 'Male' },
                                { questionId: 'demo-country', answer: 'Canada' },
                                { questionId: 'q1', answer: 'Completely Acceptable' },
                                { questionId: 'q2', answer: 'Neutral / No Opinion' },
                                { questionId: 'q3', answer: 'Mostly Unacceptable' }
                            ]
                        }
                    ]
                };

                const outputPath = path.resolve(options.output);
                await fs.writeFile(outputPath, JSON.stringify(exampleSurvey, null, 2));
                
                console.log(chalk.green(`✓ Created example survey at ${outputPath}`));
                console.log(chalk.gray('\nYou can now use this example with:'));
                console.log(chalk.cyan(`  pnpm cli survey generate -s ${options.output} -t q3 -d`));

            } catch (error) {
                console.error(chalk.red('Error creating example:'), error);
                process.exit(1);
            }
        });

    surveyCommand
        .command('strategy')
        .description('Generate evaluations using advanced survey strategies')
        .requiredOption('-s, --survey <path>', 'Path to survey data JSON file')
        .requiredOption('--strategy <type>', 'Strategy type: iterative-profile-holdout')
        .option('-c, --config <path>', 'Path to strategy configuration YAML/JSON file')
        .option('-o, --output <directory>', 'Output directory for generated blueprints', './strategy-blueprints')
        .option('--anchor <ids...>', 'Anchor question IDs to predict (for iterative-profile-holdout)')
        .option('--stages <json>', 'Stage configuration as JSON string')
        .option('-p, --participants <selection>', 'Participant selection: all, random, first, specific', 'all')
        .option('-n, --count <number>', 'Number of participants to include', parseInt)
        .option('--participant-ids <ids...>', 'Specific participant IDs to include')
        .option('-m, --models <models...>', 'Models to evaluate')
        .option('--temperature <number>', 'Temperature for model responses', parseFloat)
        .option('--judge-models <models...>', 'Judge models for evaluation')
        .option('--dry-run', 'Preview strategy without generating files')
        .action(async (options) => {
            try {
                console.log(chalk.blue('🔄 Loading survey data...'));
                
                // Load survey data
                const surveyPath = path.resolve(options.survey);
                const surveyContent = await fs.readFile(surveyPath, 'utf-8');
                const survey: Survey = JSON.parse(surveyContent);
                
                console.log(chalk.green(`✓ Loaded survey: ${survey.title}`));

                let strategyConfig: IterativeProfileHoldoutConfig;

                if (options.config) {
                    // Load config from file
                    const configPath = path.resolve(options.config);
                    const configContent = await fs.readFile(configPath, 'utf-8');
                    const configData = configPath.endsWith('.yaml') || configPath.endsWith('.yml')
                        ? yaml.load(configContent)
                        : JSON.parse(configContent);
                    
                    strategyConfig = {
                        survey,
                        strategy: 'iterative-profile-holdout',
                        ...configData
                    } as IterativeProfileHoldoutConfig;
                } else if (options.strategy === 'iterative-profile-holdout') {
                    // Build config from command line options
                    if (!options.anchor || options.anchor.length === 0) {
                        throw new Error('--anchor question IDs required for iterative-profile-holdout strategy');
                    }

                    // Parse stages if provided
                    let stages;
                    if (options.stages) {
                        try {
                            stages = JSON.parse(options.stages);
                        } catch (e) {
                            throw new Error('Invalid JSON for --stages option');
                        }
                    } else {
                        // Default stages
                        stages = [
                            {
                                name: 'First Impression',
                                includeDemographics: true,
                                contextSelection: { type: 'cumulative', addCount: 0 }
                            },
                            {
                                name: 'Developing View',
                                includeDemographics: true,
                                contextSelection: { type: 'cumulative', addCount: 5 }
                            },
                            {
                                name: 'Final Prediction',
                                includeDemographics: true,
                                contextSelection: { type: 'all-available' }
                            }
                        ];
                    }

                    strategyConfig = {
                        survey,
                        strategy: 'iterative-profile-holdout',
                        anchorQuestionIds: options.anchor,
                        stages,
                        participantSelection: options.participants as any,
                        participantCount: options.count,
                        participantIds: options.participantIds,
                        modelConfig: {
                            models: options.models,
                            temperature: options.temperature,
                            judgeModels: options.judgeModels
                        }
                    };
                } else {
                    throw new Error(`Unknown strategy: ${options.strategy}`);
                }

                console.log(chalk.blue('🔧 Generating evaluation strategy...'));
                console.log(chalk.gray(`  - Strategy: ${strategyConfig.strategy}`));
                console.log(chalk.gray(`  - Anchor questions: ${strategyConfig.anchorQuestionIds.join(', ')}`));
                console.log(chalk.gray(`  - Stages: ${strategyConfig.stages.length}`));
                console.log(chalk.gray(`  - Participant selection: ${strategyConfig.participantSelection || 'all'}`));

                // Generate evaluations
                const result = await SurveyEvaluationStrategies.generateEvaluations(strategyConfig);

                console.log(chalk.green(`✓ Generated ${result.blueprints.length} blueprints`));
                console.log(chalk.gray(`  - Participants: ${result.metadata.participantCount}`));
                console.log(chalk.gray(`  - Stages: ${result.metadata.stageCount}`));
                console.log(chalk.gray(`  - Total evaluations: ${result.metadata.totalEvaluations}`));

                if (options.dryRun) {
                    console.log(chalk.yellow('\n📋 Preview (dry run - not saved):'));
                    
                    // Show first blueprint as example
                    console.log('\nFirst blueprint:');
                    console.log(JSON.stringify(result.blueprints[0], null, 2));
                    
                    // Show mapping summary
                    console.log(chalk.gray(`\n... and ${result.blueprints.length - 1} more blueprints`));
                    
                    // Show stage breakdown
                    const stageBreakdown: Record<string, number> = {};
                    result.metadata.blueprintMapping.forEach(m => {
                        stageBreakdown[m.stageName || 'unknown'] = (stageBreakdown[m.stageName || 'unknown'] || 0) + 1;
                    });
                    
                    console.log('\nBlueprints per stage:');
                    Object.entries(stageBreakdown).forEach(([stage, count]) => {
                        console.log(chalk.gray(`  - ${stage}: ${count}`));
                    });
                } else {
                    // Save blueprints
                    const outputDir = path.resolve(options.output);
                    await fs.mkdir(outputDir, { recursive: true });

                    for (const blueprint of result.blueprints) {
                        const filename = `${blueprint.configId}.yaml`;
                        const filepath = path.join(outputDir, filename);
                        const content = yaml.dump(blueprint);
                        await fs.writeFile(filepath, content);
                    }

                    console.log(chalk.green(`✓ Saved blueprints to ${outputDir}`));

                    // Save metadata
                    const metadataPath = path.join(outputDir, 'strategy-metadata.json');
                    await fs.writeFile(metadataPath, JSON.stringify(result.metadata, null, 2));
                    console.log(chalk.green(`✓ Saved metadata to ${metadataPath}`));

                    // Create index file
                    const indexPath = path.join(outputDir, 'index.json');
                    const index = {
                        strategy: strategyConfig.strategy,
                        surveyId: survey.id,
                        surveyTitle: survey.title,
                        generated: result.metadata.generatedAt,
                        totalEvaluations: result.metadata.totalEvaluations,
                        stages: strategyConfig.stages.map(s => s.name),
                        anchorQuestions: strategyConfig.anchorQuestionIds,
                        blueprints: result.blueprints.map(b => ({
                            id: b.configId,
                            title: b.configTitle,
                            file: `${b.configId}.yaml`
                        }))
                    };
                    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
                    console.log(chalk.green(`✓ Created index at ${indexPath}`));
                }

            } catch (error) {
                console.error(chalk.red('Error generating strategy:'), error);
                process.exit(1);
            }
        });
}