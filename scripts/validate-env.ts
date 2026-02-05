#!/usr/bin/env tsx
/**
 * DTEF Environment Variable Validation Script
 *
 * Validates that all required environment variables are set for DTEF operation.
 * Run with: pnpm validate:env
 */

import 'dotenv/config';

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  validate?: (value: string) => boolean;
}

const envVars: EnvVar[] = [
  // Model Evaluation - At least one API key required
  {
    name: 'OPENROUTER_API_KEY',
    required: true,
    description: 'OpenRouter API key for model evaluation (primary)',
    validate: (v) => v.length > 10,
  },
  {
    name: 'ANTHROPIC_API_KEY',
    required: false,
    description: 'Anthropic API key (optional if using OpenRouter)',
  },
  {
    name: 'OPENAI_API_KEY',
    required: false,
    description: 'OpenAI API key (optional if using OpenRouter)',
  },

  // Storage (S3)
  {
    name: 'APP_S3_BUCKET_NAME',
    required: true,
    description: 'S3 bucket name for storing evaluation results',
  },
  {
    name: 'APP_S3_REGION',
    required: true,
    description: 'AWS region for S3 bucket (e.g., us-east-1)',
  },
  {
    name: 'APP_AWS_ACCESS_KEY_ID',
    required: true,
    description: 'AWS access key ID for S3 access',
  },
  {
    name: 'APP_AWS_SECRET_ACCESS_KEY',
    required: true,
    description: 'AWS secret access key for S3 access',
  },

  // GitHub Integration
  {
    name: 'GITHUB_TOKEN',
    required: true,
    description: 'GitHub personal access token for accessing dtef-configs repo',
    validate: (v) => v.startsWith('ghp_') || v.startsWith('github_pat_') || v.length > 20,
  },

  // Scheduled Functions
  {
    name: 'BACKGROUND_FUNCTION_AUTH_TOKEN',
    required: true,
    description: 'Authentication token for Netlify background functions',
    validate: (v) => v.length >= 32,
  },

  // App URL
  {
    name: 'URL',
    required: false,
    description: 'Netlify site URL (set automatically in production)',
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    required: false,
    description: 'Public app URL (fallback for local development)',
  },

  // DTEF-specific
  {
    name: 'NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG',
    required: false,
    description: 'Blueprint config repository (defaults to collect-intel/dtef-configs)',
  },

  // Storage Provider
  {
    name: 'STORAGE_PROVIDER',
    required: false,
    description: 'Storage provider: "s3" or "local" (defaults based on NODE_ENV)',
  },
];

interface ValidationResult {
  name: string;
  status: 'ok' | 'missing' | 'invalid' | 'optional-missing';
  message: string;
}

function validateEnvironment(): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const envVar of envVars) {
    const value = process.env[envVar.name];

    if (!value) {
      if (envVar.required) {
        results.push({
          name: envVar.name,
          status: 'missing',
          message: `Missing required: ${envVar.description}`,
        });
      } else {
        results.push({
          name: envVar.name,
          status: 'optional-missing',
          message: `Optional (not set): ${envVar.description}`,
        });
      }
    } else if (envVar.validate && !envVar.validate(value)) {
      results.push({
        name: envVar.name,
        status: 'invalid',
        message: `Invalid value: ${envVar.description}`,
      });
    } else {
      results.push({
        name: envVar.name,
        status: 'ok',
        message: `✓ Set: ${envVar.description}`,
      });
    }
  }

  return results;
}

async function testConnections(): Promise<void> {
  console.log('\n🔌 Testing Connections...\n');

  // Test OpenRouter API
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
      });
      if (response.ok) {
        console.log('  ✅ OpenRouter API: Connected');
      } else {
        console.log(`  ❌ OpenRouter API: Failed (${response.status})`);
      }
    } catch (error) {
      console.log(`  ❌ OpenRouter API: Error - ${(error as Error).message}`);
    }
  }

  // Test GitHub API
  if (process.env.GITHUB_TOKEN) {
    try {
      const repoSlug = process.env.NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG || 'collect-intel/dtef-configs';
      const response = await fetch(`https://api.github.com/repos/${repoSlug}`, {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      if (response.ok) {
        console.log(`  ✅ GitHub API: Connected to ${repoSlug}`);
      } else if (response.status === 404) {
        console.log(`  ⚠️  GitHub API: Repository ${repoSlug} not found (may need to create it)`);
      } else {
        console.log(`  ❌ GitHub API: Failed (${response.status})`);
      }
    } catch (error) {
      console.log(`  ❌ GitHub API: Error - ${(error as Error).message}`);
    }
  }

  // Test S3 connection (basic check - just verify credentials format)
  if (process.env.APP_S3_BUCKET_NAME && process.env.APP_AWS_ACCESS_KEY_ID) {
    console.log(`  ℹ️  S3: Configured for bucket "${process.env.APP_S3_BUCKET_NAME}" in ${process.env.APP_S3_REGION}`);
    console.log('      (Full S3 test requires AWS SDK - run actual evaluation to verify)');
  }
}

async function main(): Promise<void> {
  console.log('🔍 DTEF Environment Validation\n');
  console.log('=' .repeat(60) + '\n');

  const results = validateEnvironment();

  // Group by status
  const required = results.filter(r => r.status === 'ok' || r.status === 'missing' || r.status === 'invalid');
  const optional = results.filter(r => r.status === 'optional-missing');

  console.log('📋 Required Variables:\n');
  for (const result of required) {
    const icon = result.status === 'ok' ? '✅' : result.status === 'missing' ? '❌' : '⚠️';
    console.log(`  ${icon} ${result.name}`);
    if (result.status !== 'ok') {
      console.log(`     ${result.message}`);
    }
  }

  console.log('\n📋 Optional Variables:\n');
  for (const result of optional) {
    console.log(`  ⬜ ${result.name}`);
    console.log(`     ${result.message}`);
  }

  // Summary
  const errors = results.filter(r => r.status === 'missing' || r.status === 'invalid');
  const warnings = results.filter(r => r.status === 'optional-missing');

  console.log('\n' + '=' .repeat(60));
  console.log('\n📊 Summary:\n');
  console.log(`  ✅ Valid: ${results.filter(r => r.status === 'ok').length}`);
  console.log(`  ❌ Missing/Invalid: ${errors.length}`);
  console.log(`  ⬜ Optional (not set): ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Environment validation FAILED');
    console.log('\nPlease set the missing required variables in your .env.local file.');
    console.log('See .env.template for a complete list with descriptions.\n');
    process.exit(1);
  }

  // Test connections if validation passes
  await testConnections();

  console.log('\n✅ Environment validation PASSED\n');
}

main().catch((error) => {
  console.error('Error running validation:', error);
  process.exit(1);
});
