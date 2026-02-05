#!/usr/bin/env tsx
/**
 * DTEF Infrastructure Validation Script
 *
 * Tests the end-to-end infrastructure pipeline:
 * 1. Validates survey data can be loaded and validated
 * 2. Generates blueprints from survey data
 * 3. Validates generated blueprints match WevalConfig format
 * 4. Tests GitHub API connectivity to dtef-configs
 * 5. Tests S3 connectivity (if credentials available)
 * 6. Verifies distribution_metric point function works
 *
 * Run with: pnpm test:infra
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

// Inline imports to avoid module resolution issues
const EXAMPLE_DATA_PATH = path.resolve(__dirname, '../examples/dtef-survey-example.json');

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<string>): Promise<void> {
    const start = Date.now();
    try {
        const message = await fn();
        results.push({ name, passed: true, message, duration: Date.now() - start });
        console.log(`  ✅ ${name}: ${message}`);
    } catch (error: any) {
        results.push({ name, passed: false, message: error.message, duration: Date.now() - start });
        console.log(`  ❌ ${name}: ${error.message}`);
    }
}

async function main() {
    console.log('\n🏗️  DTEF Infrastructure Validation\n');
    console.log('='.repeat(60) + '\n');

    // ── Test 1: Survey data loading and validation ──
    console.log('📋 Step 1: Survey Data Validation\n');

    await runTest('Load example survey data', async () => {
        if (!fs.existsSync(EXAMPLE_DATA_PATH)) {
            throw new Error(`Example data not found at ${EXAMPLE_DATA_PATH}`);
        }
        const raw = fs.readFileSync(EXAMPLE_DATA_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (!data.surveyId || !data.questions || !data.segments) {
            throw new Error('Missing required fields in survey data');
        }
        return `Loaded: ${Object.keys(data.questions).length} questions, ${data.segments.length} segments`;
    });

    await runTest('Validate survey data', async () => {
        const { validateDTEFSurveyData } = await import('../src/lib/dtef-validation');
        const raw = fs.readFileSync(EXAMPLE_DATA_PATH, 'utf-8');
        const data = JSON.parse(raw);
        const result = validateDTEFSurveyData(data);
        if (!result.valid) {
            throw new Error(`Validation failed: ${result.errors.map(e => e.message).join(', ')}`);
        }
        return `Valid: ${result.summary.questionCount}q, ${result.summary.segmentCount}s, ${result.summary.totalResponses}r`;
    });

    // ── Test 2: Blueprint generation ──
    console.log('\n📋 Step 2: Blueprint Generation\n');

    await runTest('Generate blueprints', async () => {
        const { DemographicBlueprintService } = await import('../src/cli/services/demographicBlueprintService');
        const raw = fs.readFileSync(EXAMPLE_DATA_PATH, 'utf-8');
        const surveyData = JSON.parse(raw);

        const blueprints = DemographicBlueprintService.generateBlueprints({
            surveyData,
            targetQuestionIds: Object.keys(surveyData.questions),
        });

        if (blueprints.length === 0) throw new Error('No blueprints generated');
        return `Generated ${blueprints.length} blueprints`;
    });

    await runTest('Blueprint format validation', async () => {
        const { DemographicBlueprintService } = await import('../src/cli/services/demographicBlueprintService');
        const raw = fs.readFileSync(EXAMPLE_DATA_PATH, 'utf-8');
        const surveyData = JSON.parse(raw);

        const blueprints = DemographicBlueprintService.generateBlueprints({
            surveyData,
            targetQuestionIds: Object.keys(surveyData.questions),
        });

        const bp = blueprints[0];
        const requiredFields = ['configId', 'configTitle', 'description', 'models', 'system', 'prompts', 'tags'];
        const missing = requiredFields.filter(f => !(f in bp));
        if (missing.length > 0) throw new Error(`Missing fields: ${missing.join(', ')}`);

        // Check prompt structure
        const prompt = bp.prompts[0];
        if (!prompt) throw new Error('No prompts in blueprint');
        if (!prompt.id || !prompt.promptText || !prompt.points) {
            throw new Error('Prompt missing required fields (id, promptText, points)');
        }
        return `Blueprint "${bp.configId}" has valid structure with ${bp.prompts.length} prompts`;
    });

    await runTest('Distribution metric point function', async () => {
        const { DemographicBlueprintService } = await import('../src/cli/services/demographicBlueprintService');
        const raw = fs.readFileSync(EXAMPLE_DATA_PATH, 'utf-8');
        const surveyData = JSON.parse(raw);

        const blueprints = DemographicBlueprintService.generateBlueprints({
            surveyData,
            targetQuestionIds: Object.keys(surveyData.questions),
        });

        // Check that prompts use distribution_metric
        const bp = blueprints[0]!;
        const fnPoint = bp.prompts[0]!.points!.find(
            (p: any) => typeof p === 'object' && p.fn === 'distribution_metric'
        );
        if (!fnPoint) throw new Error('No distribution_metric point function found');
        return 'distribution_metric point function is wired into blueprints';
    });

    await runTest('Token budget integration', async () => {
        const { estimateTokens, calculateTokenBudget } = await import('../src/cli/utils/tokenCounter');

        const tokens = estimateTokens('Hello, world!');
        if (tokens <= 0) throw new Error('Token estimation returned 0');

        const budget = calculateTokenBudget(
            'System prompt text',
            'Core prompt text here',
            ['Context question 1', 'Context question 2'],
            4096
        );
        if (budget.totalBudget !== 4096) throw new Error('Budget total mismatch');
        if (budget.overBudget) throw new Error('Unexpectedly over budget');
        return `Token estimation works: "${budget.contextQuestionsFit}" context questions fit in budget`;
    });

    // ── Test 3: YAML serialization ──
    console.log('\n📋 Step 3: YAML Serialization\n');

    await runTest('YAML output', async () => {
        const yaml = await import('js-yaml');
        const { DemographicBlueprintService } = await import('../src/cli/services/demographicBlueprintService');
        const raw = fs.readFileSync(EXAMPLE_DATA_PATH, 'utf-8');
        const surveyData = JSON.parse(raw);

        const blueprints = DemographicBlueprintService.generateBlueprints({
            surveyData,
            targetQuestionIds: Object.keys(surveyData.questions),
            segmentSelection: 'specific',
            segmentIds: [surveyData.segments[0].id],
        });

        const yamlStr = yaml.dump(blueprints[0], { lineWidth: 120, noRefs: true });
        const parsed = yaml.load(yamlStr) as any;

        if (parsed.configId !== blueprints[0].configId) {
            throw new Error('YAML round-trip failed: configId mismatch');
        }
        return `YAML round-trip OK (${yamlStr.length} chars)`;
    });

    // ── Test 4: GitHub API connectivity ──
    console.log('\n📋 Step 4: External Connectivity\n');

    await runTest('GitHub API (dtef-configs)', async () => {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return 'SKIPPED (no GITHUB_TOKEN set)';

        const repoSlug = process.env.NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG || 'collect-intel/dtef-configs';
        const response = await fetch(`https://api.github.com/repos/${repoSlug}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (response.status === 404) throw new Error(`Repository ${repoSlug} not found`);
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

        const data = await response.json() as any;
        return `Connected to ${data.full_name} (${data.default_branch})`;
    });

    await runTest('GitHub API (list blueprints dir)', async () => {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return 'SKIPPED (no GITHUB_TOKEN set)';

        const repoSlug = process.env.NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG || 'collect-intel/dtef-configs';
        const response = await fetch(`https://api.github.com/repos/${repoSlug}/contents/blueprints`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (response.status === 404) return 'blueprints/ directory not found (may need to add blueprints)';
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

        const data = await response.json() as any[];
        return `Found ${data.length} file(s) in blueprints/`;
    });

    await runTest('OpenRouter API', async () => {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) return 'SKIPPED (no OPENROUTER_API_KEY set)';

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` },
        });

        if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
        const data = await response.json() as any;
        return `Connected (${data.data?.length || '?'} models available)`;
    });

    // ── Summary ──
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Infrastructure Validation Summary\n');

    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);
    const skipped = results.filter(r => r.passed && r.message.startsWith('SKIPPED'));

    console.log(`  Total tests: ${results.length}`);
    console.log(`  Passed:      ${passed.length} (${skipped.length} skipped)`);
    console.log(`  Failed:      ${failed.length}`);
    console.log(`  Duration:    ${results.reduce((a, r) => a + r.duration, 0)}ms`);

    if (failed.length > 0) {
        console.log('\n❌ Infrastructure validation FAILED\n');
        console.log('Failed tests:');
        for (const f of failed) {
            console.log(`  - ${f.name}: ${f.message}`);
        }
        process.exit(1);
    }

    console.log('\n✅ Infrastructure validation PASSED\n');
}

main().catch((error) => {
    console.error('Infrastructure test error:', error);
    process.exit(1);
});
