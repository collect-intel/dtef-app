# DTEF Detailed Task Plan

*Comprehensive, actionable task breakdown for implementing the Digital Twin Evaluation Framework*

**Last Updated:** 2025-01-27  
**Status:** Active Development

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 0: Infrastructure Setup](#phase-0-infrastructure-setup)
3. [Phase 1: Evaluate & Adapt Existing Code](#phase-1-evaluate--adapt-existing-code)
4. [Phase 2: Demographic Blueprint Generation](#phase-2-demographic-blueprint-generation)
5. [Phase 3: Results Storage & Aggregation](#phase-3-results-storage--aggregation)
6. [Phase 4: MVP Leaderboard UI](#phase-4-mvp-leaderboard-ui)
7. [Phase 5: Testing with Real Data](#phase-5-testing-with-real-data)
8. [Phase 6: Polish & Documentation](#phase-6-polish--documentation)
9. [Task Status Tracking](#task-status-tracking)

---

## Overview

This document provides a granular, step-by-step task breakdown for implementing DTEF. Each task includes:
- **Objective**: What needs to be accomplished
- **Acceptance Criteria**: How to verify completion
- **Dependencies**: Prerequisites that must be completed first
- **Estimated Complexity**: Simple, Medium, or Complex
- **Files Involved**: Specific files to create or modify

**For Coding Agents:** Start with Phase 0, complete each task in order, and verify acceptance criteria before moving to the next task.

---

## Phase 0: Infrastructure Setup

**Goal:** Get DTEF running as an independent weval-like platform

### Task 0.1: Environment Configuration Setup

**Objective:** Create and verify all required environment variables for DTEF operation.

**Acceptance Criteria:**
- [ ] All environment variables listed below are set in `.env.local` (or deployment environment)
- [ ] Environment variable validation script runs without errors
- [ ] Can successfully connect to OpenRouter API
- [ ] Can successfully connect to S3 bucket
- [ ] Can successfully authenticate with GitHub API

**Dependencies:** None (first task)

**Complexity:** Simple

**Files to Create:**
- `.env.local.example` - Template with all required variables
- `scripts/validate-env.ts` - Script to check environment setup

**Files to Modify:**
- `.gitignore` - Ensure `.env.local` is ignored

**Environment Variables Required:**
```bash
# Model Evaluation
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=          # Optional if using OpenRouter
OPENAI_API_KEY=             # Optional if using OpenRouter

# Storage
APP_S3_REGION=
APP_AWS_ACCESS_KEY_ID=
APP_AWS_SECRET_ACCESS_KEY=
APP_S3_BUCKET_NAME=

# GitHub Integration
GITHUB_TOKEN=

# Scheduled Functions
BACKGROUND_FUNCTION_AUTH_TOKEN=
URL=                        # Netlify site URL

# DTEF-specific
NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG=collect-intel/dtef-configs
```

**Implementation Steps:**
1. Create `.env.local.example` with all variables and descriptions
2. Create `scripts/validate-env.ts` that checks each required variable
3. Add validation script to `package.json` scripts as `validate:env`
4. Document where to obtain each API key/token

---

### Task 0.2: Repository Configuration

**Objective:** Configure DTEF to use the dtef-configs repository for blueprints.

**Acceptance Criteria:**
- [ ] `configConstants.ts` reads from `NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG` environment variable
- [ ] Default value is `collect-intel/dtef-configs` if env var not set
- [ ] Can successfully fetch repository info via GitHub API
- [ ] All references to `weval/configs` are updated to use configurable repo slug

**Dependencies:** Task 0.1

**Complexity:** Simple

**Files to Modify:**
- `src/lib/configConstants.ts` - Update repo slug constant
- Search codebase for hardcoded `weval/configs` references and update

**Implementation Steps:**
1. Read `src/lib/configConstants.ts` to understand current structure
2. Update `BLUEPRINT_CONFIG_REPO_SLUG` to read from env var with fallback
3. Use `grep` to find all references to `weval/configs` or `weval-org/configs`
4. Update each reference to use the configurable constant
5. Test by fetching a blueprint from dtef-configs repo (if it exists)

---

### Task 0.3: Create dtef-configs Repository Structure

**Objective:** Set up the dtef-configs repository with proper directory structure.

**Acceptance Criteria:**
- [ ] Repository exists (create if needed)
- [ ] Directory structure matches: `/blueprints/`, `/models/`, `/surveys/`
- [ ] `CORE.json` model collection file exists with target models
- [ ] README.md explains repository purpose and structure

**Dependencies:** Task 0.2

**Complexity:** Simple

**Files to Create (in dtef-configs repo):**
- `README.md` - Repository documentation
- `models/CORE.json` - Core model collection
- `.gitignore` - Standard ignores
- `blueprints/.gitkeep` - Ensure directory exists
- `surveys/.gitkeep` - Ensure directory exists

**Implementation Steps:**
1. Check if `dtef-configs` repository exists (via GitHub API or manual check)
2. If not exists, create repository (manual step or via GitHub API)
3. Create directory structure
4. Create `models/CORE.json` with initial model list:
   ```json
   {
     "models": [
       "openrouter:openai/gpt-4o",
       "openrouter:openai/gpt-4o-mini",
       "openrouter:anthropic/claude-3.5-haiku",
       "openrouter:google/gemini-2.5-flash"
     ]
   }
   ```
5. Create README explaining repository structure

---

### Task 0.4: Enable Scheduled Evaluation Functions

**Objective:** Configure Netlify to run scheduled evaluation fetches.

**Acceptance Criteria:**
- [ ] `netlify.toml` has scheduled function configuration
- [ ] Schedule is set to weekly (or appropriate interval)
- [ ] Function can be manually triggered for testing
- [ ] Function successfully fetches blueprints from dtef-configs

**Dependencies:** Task 0.2, Task 0.3

**Complexity:** Medium

**Files to Modify:**
- `netlify.toml` - Uncomment and configure schedule
- `netlify/functions/fetch-and-schedule-evals.ts` - Review and test

**Implementation Steps:**
1. Read `netlify.toml` to understand current configuration
2. Uncomment or add schedule configuration:
   ```toml
   [functions."fetch-and-schedule-evals"]
   schedule = "0 0 * * 0"  # Weekly on Sunday at midnight UTC
   ```
3. Review `fetch-and-schedule-evals.ts` to ensure it works with dtef-configs
4. Test function manually via Netlify dashboard or local testing
5. Verify function can fetch blueprints from dtef-configs repo

---

### Task 0.5: Infrastructure Validation Checkpoint

**Objective:** Verify the entire infrastructure pipeline works end-to-end.

**Acceptance Criteria:**
- [ ] Can fetch blueprints from dtef-configs via GitHub API
- [ ] Can execute a simple weval blueprint manually via CLI
- [ ] Can store results to S3 successfully
- [ ] Scheduled function triggers (test with short interval or manual trigger)
- [ ] Results are readable from S3

**Dependencies:** All Phase 0 tasks

**Complexity:** Medium

**Files to Create:**
- `scripts/test-infrastructure.ts` - End-to-end infrastructure test script

**Implementation Steps:**
1. Create test script that:
   - Fetches a blueprint from dtef-configs
   - Executes it via CLI (`pnpm cli run-config`)
   - Verifies results are stored in S3
   - Reads results back from S3
2. Run test script and verify all steps pass
3. Document any issues found and fix them
4. Create a simple test blueprint in dtef-configs for validation

**Decision Point:** Do not proceed to Phase 1 until this checkpoint passes.

---

## Phase 1: Evaluate & Adapt Existing Code

**Goal:** Decide what to keep, modify, or replace from previous iteration

### Task 1.1: Review Current Survey Types

**Objective:** Understand existing survey type definitions and determine what needs to change.

**Acceptance Criteria:**
- [ ] Documented analysis of `src/types/survey.ts`
- [ ] Identified which types are needed for demographic aggregates
- [ ] Identified which types can be kept for future individual prediction
- [ ] Decision documented on whether to extend or create new types

**Dependencies:** Phase 0 complete

**Complexity:** Simple

**Files to Read:**
- `src/types/survey.ts`

**Files to Create:**
- `docs/PHASE1_ANALYSIS.md` - Analysis document

**Implementation Steps:**
1. Read `src/types/survey.ts` completely
2. Document each type and its purpose
3. Answer these questions:
   - Does `Survey` type support aggregate response distributions?
   - Can `SurveyQuestion` hold percentage breakdowns by demographic?
   - Is `Participant` structure needed for demographic-aggregate approach?
4. Create analysis document with findings
5. Make recommendation: extend existing types vs. create new types

---

### Task 1.2: Design Demographic Distribution Data Structure

**Objective:** Design and implement TypeScript types for demographic aggregate survey data.

**Acceptance Criteria:**
- [ ] New types defined in `src/types/dtef.ts`
- [ ] Types support demographic segments with response distributions
- [ ] Types are well-documented with JSDoc comments
- [ ] Types exported and importable
- [ ] Example data structure created for testing

**Dependencies:** Task 1.1

**Complexity:** Medium

**Files to Create:**
- `src/types/dtef.ts` - DTEF-specific types
- `examples/dtef-survey-example.json` - Example data structure

**Implementation Steps:**
1. Create `src/types/dtef.ts` with these types:
   ```typescript
   interface DemographicSegment {
     id: string;
     label: string;
     attributes: Record<string, string>;
     sampleSize: number;
   }

   interface DTEFSurveyData {
     surveyId: string;
     surveyName: string;
     questions: Record<string, {
       text: string;
       options: string[];
     }>;
     segments: {
       id: string;
       attributes: Record<string, string>;
       responses: Record<string, number[]>;
     }[];
   }
   ```
2. Add comprehensive JSDoc comments
3. Export types
4. Create example JSON file with realistic data
5. Validate example JSON matches type definitions

---

### Task 1.3: Assess Blueprint Generation Service

**Objective:** Review existing blueprint generation service and plan new demographic service.

**Acceptance Criteria:**
- [ ] Documented analysis of `surveyBlueprintService.ts`
- [ ] Identified key differences between participant-based and demographic-based generation
- [ ] Decision made: new service vs. modify existing
- [ ] Architecture plan for new service created

**Dependencies:** Task 1.1

**Complexity:** Simple

**Files to Read:**
- `src/cli/services/surveyBlueprintService.ts`

**Files to Create:**
- `docs/DEMOGRAPHIC_BLUEPRINT_ARCHITECTURE.md` - Architecture plan

**Implementation Steps:**
1. Read `surveyBlueprintService.ts` completely
2. Document current behavior (per-participant blueprints)
3. Document needed behavior (demographic distribution blueprints)
4. Create architecture plan for new service
5. Decision: Create `demographicBlueprintService.ts` (recommended) or modify existing

---

### Task 1.4: Mark Legacy Code

**Objective:** Mark existing participant-based code as legacy without breaking it.

**Acceptance Criteria:**
- [ ] `surveyBlueprintService.ts` marked with `@deprecated` or legacy comment
- [ ] Legacy code still functional (tests pass)
- [ ] Documentation updated to indicate legacy status
- [ ] Migration path documented

**Dependencies:** Task 1.3

**Complexity:** Simple

**Files to Modify:**
- `src/cli/services/surveyBlueprintService.ts` - Add legacy marker
- `docs/SURVEY_MODULE.md` - Update to indicate legacy status

**Implementation Steps:**
1. Add JSDoc `@deprecated` tag to `SurveyBlueprintService` class
2. Add comment explaining it's for individual participant prediction
3. Add note about new demographic service
4. Ensure all tests still pass
5. Update documentation

---

### Task 1.5: Create Data Validation Service

**Objective:** Create validator for DTEF survey data format.

**Acceptance Criteria:**
- [ ] `DTEFSurveyValidator` class created
- [ ] Validates all required fields
- [ ] Validates response distributions sum to 100% (within tolerance)
- [ ] Validates question IDs match between segments and questions
- [ ] Comprehensive error messages
- [ ] Tests written and passing

**Dependencies:** Task 1.2

**Complexity:** Medium

**Files to Create:**
- `src/cli/services/dtefSurveyValidator.ts`
- `src/cli/services/__tests__/dtefSurveyValidator.test.ts`

**Implementation Steps:**
1. Create validator class with methods:
   - `validateStructure(data: DTEFSurveyData): ValidationResult`
   - `validateDistributions(data: DTEFSurveyData): ValidationResult`
   - `validateQuestionReferences(data: DTEFSurveyData): ValidationResult`
2. Implement validation logic
3. Create comprehensive test suite
4. Test with example data and edge cases

---

## Phase 2: Demographic Blueprint Generation

**Goal:** Generate weval-compatible blueprints from demographic survey data

### Task 2.1: Create Global Dialogues Adapter

**Objective:** Build adapter to convert Global Dialogues data format to DTEF format.

**Acceptance Criteria:**
- [ ] Adapter class created
- [ ] Can parse Global Dialogues CSV/JSON format
- [ ] Converts to `DTEFSurveyData` format
- [ ] Handles missing data gracefully
- [ ] Tests written with sample GD data

**Dependencies:** Task 1.2, Task 1.5

**Complexity:** Complex

**Files to Create:**
- `src/cli/services/adapters/globalDialoguesAdapter.ts`
- `src/cli/services/adapters/__tests__/globalDialoguesAdapter.test.ts`
- `examples/global-dialogues-sample.csv` - Sample data for testing

**Implementation Steps:**
1. Research Global Dialogues data format (if not already known)
2. Create adapter class with method:
   ```typescript
   convertToDTEFSurveyData(gdData: GlobalDialoguesData): DTEFSurveyData
   ```
3. Implement parsing logic
4. Handle edge cases (missing demographics, incomplete responses)
5. Create test data and write tests
6. Document data format assumptions

---

### Task 2.2: Create Demographic Blueprint Service - Core Structure

**Objective:** Create the main service class for generating demographic blueprints.

**Acceptance Criteria:**
- [ ] `DemographicBlueprintService` class created
- [ ] Main method signature defined
- [ ] Service structure and architecture in place
- [ ] Basic skeleton compiles and can be imported

**Dependencies:** Task 1.2, Task 1.5

**Complexity:** Simple

**Files to Create:**
- `src/cli/services/demographicBlueprintService.ts`

**Implementation Steps:**
1. Create service class with structure:
   ```typescript
   export class DemographicBlueprintService {
     static generateBlueprints(
       surveyData: DTEFSurveyData,
       config: DemographicBlueprintConfig
     ): WevalConfig[] {
       // Implementation
     }
   }
   ```
2. Define `DemographicBlueprintConfig` interface
3. Create placeholder implementation
4. Export class and types

---

### Task 2.3: Implement Token Budget Management

**Objective:** Implement token counting and context window management.

**Acceptance Criteria:**
- [ ] Token counting function implemented
- [ ] Context window limit enforced (default 4096 tokens)
- [ ] Automatic context question reduction if limit exceeded
- [ ] Configurable token limit for high-context models
- [ ] Tests written

**Dependencies:** Task 2.2

**Complexity:** Medium

**Files to Modify:**
- `src/cli/services/demographicBlueprintService.ts`

**Files to Create:**
- `src/cli/utils/tokenCounter.ts` - Token counting utility
- `src/cli/utils/__tests__/tokenCounter.test.ts`

**Implementation Steps:**
1. Install or use token counting library (e.g., `gpt-tokenizer` or similar)
2. Create `tokenCounter.ts` with function to count tokens in text
3. Implement logic to:
   - Count tokens in demographic context + context questions
   - If exceeds limit, reduce context question count
   - Log reduction decision
4. Add to blueprint generation service
5. Write tests

---

### Task 2.4: Implement Demographic Segment Selection

**Objective:** Generate demographic segments from survey data based on configuration.

**Acceptance Criteria:**
- [ ] Can generate single-attribute segments (e.g., just "age")
- [ ] Can generate multi-attribute segments (e.g., "age+gender")
- [ ] Segments have unique IDs
- [ ] Segments include sample sizes
- [ ] Configurable detail levels

**Dependencies:** Task 2.2

**Complexity:** Medium

**Files to Modify:**
- `src/cli/services/demographicBlueprintService.ts`

**Implementation Steps:**
1. Implement segment generation logic:
   ```typescript
   function generateSegments(
     surveyData: DTEFSurveyData,
     detailLevels: string[]
   ): DemographicSegment[]
   ```
2. Handle single attributes (age, gender, country, etc.)
3. Handle combinations (age+gender, age+gender+country)
4. Calculate sample sizes for each segment
5. Generate unique IDs and labels
6. Test with example data

---

### Task 2.5: Implement Blueprint Prompt Generation

**Objective:** Generate the actual prompt text for demographic distribution prediction.

**Acceptance Criteria:**
- [ ] Prompts include demographic profile
- [ ] Prompts include context question distributions
- [ ] Prompts include target question and options
- [ ] Prompts request percentage distribution output
- [ ] Prompts are clear and well-formatted

**Dependencies:** Task 2.2, Task 2.4

**Complexity:** Medium

**Files to Modify:**
- `src/cli/services/demographicBlueprintService.ts`

**Implementation Steps:**
1. Create prompt template function:
   ```typescript
   function generatePrompt(
     segment: DemographicSegment,
     contextQuestions: QuestionContext[],
     targetQuestion: Question,
     config: DemographicBlueprintConfig
   ): string
   ```
2. Format demographic profile section
3. Format context questions with distributions
4. Format target question
5. Add instructions for output format
6. Test prompt generation with various inputs

---

### Task 2.6: Implement WevalConfig Generation

**Objective:** Convert demographic prompts into valid WevalConfig YAML structure.

**Acceptance Criteria:**
- [ ] Generated configs are valid WevalConfig format
- [ ] Configs include proper metadata (name, description, tags)
- [ ] Configs include system prompts
- [ ] Configs include evaluation points (placeholder for now)
- [ ] Configs can be serialized to YAML

**Dependencies:** Task 2.5

**Complexity:** Medium

**Files to Modify:**
- `src/cli/services/demographicBlueprintService.ts`

**Files to Read:**
- `src/types/shared.ts` - WevalConfig type definition
- Example blueprint files in `examples/blueprints/`

**Implementation Steps:**
1. Study WevalConfig structure
2. Create function to build WevalConfig from demographic data:
   ```typescript
   function buildWevalConfig(
     segment: DemographicSegment,
     targetQuestion: Question,
     prompt: string,
     config: DemographicBlueprintConfig
   ): WevalConfig
   ```
3. Set config metadata (name, description, tags)
4. Set system prompt
5. Set user prompt
6. Add placeholder evaluation points (will be implemented in Task 2.8)
7. Test config generation and YAML serialization

---

### Task 2.7: Create Distribution Metric Point Function

**Objective:** Create custom evaluator for comparing predicted vs actual distributions.

**Acceptance Criteria:**
- [ ] `distribution_metric` point function created
- [ ] Supports MAE (Mean Absolute Error) calculation
- [ ] Supports JSD (Jensen-Shannon Divergence) calculation
- [ ] Can parse percentage distributions from model responses
- [ ] Normalizes distributions to sum to 100%
- [ ] Returns score and details
- [ ] Registered in point-functions index
- [ ] Tests written

**Dependencies:** Task 1.2

**Complexity:** Complex

**Files to Create:**
- `src/point-functions/distribution_metric.ts`
- `src/point-functions/__tests__/distribution_metric.test.ts`

**Files to Modify:**
- `src/point-functions/index.ts` - Register new function

**Implementation Steps:**
1. Study existing point functions to understand pattern
2. Create `distribution_metric.ts` with function:
   ```typescript
   export function distributionMetric(
     response: string,
     args: { actualDistribution: number[], metric: 'mae' | 'jsd' },
     context: PointFunctionContext
   ): PointFunctionResult
   ```
3. Implement percentage parsing (regex or structured output)
4. Implement normalization (ensure sum = 100%)
5. Implement MAE calculation
6. Implement JSD calculation (may need library)
7. Register function in index
8. Write comprehensive tests

---

### Task 2.8: Integrate Distribution Metric into Blueprints

**Objective:** Add distribution metric evaluation points to generated blueprints.

**Acceptance Criteria:**
- [ ] Blueprints include `distribution_metric` evaluation points
- [ ] Evaluation points reference actual distribution from survey data
- [ ] Evaluation points specify metric type (MAE or JSD)
- [ ] Blueprints are valid and executable

**Dependencies:** Task 2.6, Task 2.7

**Complexity:** Medium

**Files to Modify:**
- `src/cli/services/demographicBlueprintService.ts`

**Implementation Steps:**
1. Update `buildWevalConfig` to include evaluation points
2. Add evaluation point with:
   - Type: `distribution_metric`
   - Params: `actualDistribution` and `metric`
   - Actual distribution from survey data
3. Test blueprint generation
4. Verify blueprints can be executed in weval pipeline

---

### Task 2.9: Implement CLI Commands for Demographic Generation

**Objective:** Add CLI commands to generate and manage demographic blueprints.

**Acceptance Criteria:**
- [ ] `survey generate-demographic` command created
- [ ] Command accepts input file and output directory
- [ ] Command accepts configuration options
- [ ] Command generates blueprints to output directory
- [ ] Command provides progress feedback
- [ ] Command validates input data

**Dependencies:** Task 2.8

**Complexity:** Medium

**Files to Modify:**
- `src/cli/commands/surveyCommands.ts`

**Implementation Steps:**
1. Add new command:
   ```bash
   pnpm cli survey generate-demographic \
     --input survey-data.json \
     --output ./blueprints/ \
     --context-questions 5 \
     --detail-levels age age+gender
   ```
2. Implement command handler
3. Add input validation
4. Add progress logging
5. Generate blueprints to output directory
6. Create index file listing all generated blueprints

---

### Task 2.10: Create Blueprint Publishing Helper

**Objective:** Create helper script to transfer blueprints to dtef-configs repository.

**Acceptance Criteria:**
- [ ] `survey publish` command created
- [ ] Command copies blueprints from source to target
- [ ] Command validates blueprints before copying
- [ ] Command can add tags/metadata
- [ ] Command provides dry-run mode

**Dependencies:** Task 2.9

**Complexity:** Medium

**Files to Modify:**
- `src/cli/commands/surveyCommands.ts`

**Implementation Steps:**
1. Add `survey publish` command:
   ```bash
   pnpm cli survey publish \
     --source ./local-blueprints/ \
     --target ../dtef-configs/blueprints/ \
     --tag "global-dialogues-v1" \
     --dry-run
   ```
2. Implement file copying logic
3. Add validation before copying
4. Add tag/metadata injection
5. Add dry-run mode
6. Test with sample blueprints

---

### Task 2.11: Phase 2 Validation Checkpoint

**Objective:** Verify demographic blueprint generation works end-to-end.

**Acceptance Criteria:**
- [ ] Can convert raw survey data to DTEF format
- [ ] Can generate valid weval blueprints from demographic data
- [ ] Blueprints execute successfully in weval pipeline
- [ ] Distribution accuracy scoring works correctly
- [ ] Generated blueprints produce meaningful results

**Dependencies:** All Phase 2 tasks

**Complexity:** Medium

**Files to Create:**
- `scripts/test-blueprint-generation.ts` - End-to-end test

**Implementation Steps:**
1. Create test script that:
   - Loads example survey data
   - Generates blueprints
   - Validates blueprint format
   - Executes one blueprint via weval pipeline
   - Verifies results include distribution scores
2. Run test and verify all steps pass
3. Document any issues and fix them

**Decision Point:** Do not proceed to Phase 3 until this checkpoint passes.

---

## Phase 3: Results Storage & Aggregation

**Goal:** Store and aggregate evaluation results by demographic segment

### Task 3.1: Extend Results Metadata

**Objective:** Add DTEF-specific metadata to evaluation results.

**Acceptance Criteria:**
- [ ] `DTEFEvaluationResult` type extends `WevalResult`
- [ ] Results include segment ID, label, and attributes
- [ ] Results include survey ID and question ID
- [ ] Results include actual distribution
- [ ] Metadata is preserved through pipeline

**Dependencies:** Phase 2 complete, Task 1.2

**Complexity:** Medium

**Files to Create:**
- `src/types/dtef.ts` - Add DTEFEvaluationResult type (if not already)

**Files to Modify:**
- `src/cli/services/comparison-pipeline-service.ts` - Preserve DTEF metadata
- `src/cli/services/demographicBlueprintService.ts` - Include metadata in config

**Implementation Steps:**
1. Define `DTEFEvaluationResult` interface extending `WevalResult`
2. Update blueprint generation to include metadata in config
3. Update pipeline service to preserve metadata in results
4. Test metadata preservation through full pipeline

---

### Task 3.2: Create Demographic Aggregation Service

**Objective:** Create service to aggregate results by demographic segment.

**Acceptance Criteria:**
- [ ] `DemographicAggregationService` class created
- [ ] Can aggregate results by segment
- [ ] Can aggregate results by survey
- [ ] Calculates average scores per segment
- [ ] Calculates model rankings per segment
- [ ] Handles missing data gracefully

**Dependencies:** Task 3.1

**Complexity:** Complex

**Files to Create:**
- `src/cli/services/demographicAggregationService.ts`
- `src/cli/services/__tests__/demographicAggregationService.test.ts`

**Implementation Steps:**
1. Create service with methods:
   ```typescript
   aggregateByDemographic(results: DTEFEvaluationResult[]): DemographicLeaderboard[]
   aggregateBySurvey(results: DTEFEvaluationResult[]): SurveyLeaderboard[]
   ```
2. Implement aggregation logic:
   - Group results by segment
   - Calculate average MAE/JSD per model per segment
   - Rank models by performance
   - Calculate statistics (min, max, std dev)
3. Write comprehensive tests
4. Handle edge cases (no results, single result, etc.)

---

### Task 3.3: Extend Summary Calculation Utils

**Objective:** Integrate demographic aggregation into summary calculation pipeline.

**Acceptance Criteria:**
- [ ] Summary calculation includes demographic leaderboards
- [ ] Demographic summaries stored in S3
- [ ] Summaries update when new results arrive
- [ ] Summaries include cross-segment consistency metrics

**Dependencies:** Task 3.2

**Complexity:** Complex

**Files to Modify:**
- `src/cli/utils/summaryCalculationUtils.ts`

**Files to Read:**
- `src/cli/utils/summaryCalculationUtils.ts` - Understand current structure

**Implementation Steps:**
1. Study existing summary calculation logic
2. Add demographic aggregation calls
3. Create demographic summary structure
4. Integrate with homepage summary pipeline
5. Test summary generation and storage

---

## Phase 4: MVP Leaderboard UI

**Goal:** Display demographic-specific model performance

### Task 4.1: Create Demographic Leaderboard API Endpoint

**Objective:** Create API endpoint to serve demographic leaderboard data.

**Acceptance Criteria:**
- [ ] API endpoint created at `/api/demographic-leaderboards`
- [ ] Endpoint returns all leaderboards
- [ ] Endpoint accepts segment filter parameter
- [ ] Endpoint returns proper JSON structure
- [ ] Endpoint handles errors gracefully

**Dependencies:** Task 3.3

**Complexity:** Medium

**Files to Create:**
- `src/app/api/demographic-leaderboards/route.ts`

**Implementation Steps:**
1. Create Next.js API route
2. Implement GET handler:
   - Read demographic summaries from S3
   - Filter by segment if parameter provided
   - Return JSON response
3. Add error handling
4. Add response caching if appropriate
5. Test endpoint with sample data

---

### Task 4.2: Create Demographic Leaderboard Component

**Objective:** Create React component to display demographic leaderboards.

**Acceptance Criteria:**
- [ ] Component displays segment selector
- [ ] Component displays model ranking table
- [ ] Component shows scores (MAE/JSD)
- [ ] Component shows evaluation counts
- [ ] Component is responsive
- [ ] Component handles loading and error states

**Dependencies:** Task 4.1

**Complexity:** Medium

**Files to Create:**
- `src/app/components/dtef/DemographicLeaderboard.tsx`

**Files to Read:**
- `src/app/components/home/CapabilityLeaderboardDisplay.tsx` - For reference

**Implementation Steps:**
1. Study existing leaderboard component
2. Create new component with:
   - Segment dropdown selector
   - Table showing models, scores, counts
   - Proper styling
3. Add loading states
4. Add error handling
5. Make responsive
6. Test with sample data

---

### Task 4.3: Create Demographics Page

**Objective:** Create dedicated page for demographic leaderboards.

**Acceptance Criteria:**
- [ ] Page created at `/demographics`
- [ ] Page displays leaderboard component
- [ ] Page has proper layout and styling
- [ ] Page is accessible
- [ ] Page links to detailed results

**Dependencies:** Task 4.2

**Complexity:** Simple

**Files to Create:**
- `src/app/(standard)/demographics/page.tsx`

**Implementation Steps:**
1. Create Next.js page component
2. Import and use DemographicLeaderboard component
3. Add page layout and styling
4. Add navigation links
5. Test page rendering

---

### Task 4.4: Integrate into Homepage

**Objective:** Add demographic section to homepage.

**Acceptance Criteria:**
- [ ] Homepage includes "Demographic Prediction Accuracy" section
- [ ] Section shows top models across segments
- [ ] Section links to full demographics page
- [ ] Section is visually appealing

**Dependencies:** Task 4.2

**Complexity:** Simple

**Files to Modify:**
- `src/app/(standard)/page.tsx`

**Implementation Steps:**
1. Read homepage component
2. Add new section for demographic predictions
3. Fetch and display top models
4. Add link to demographics page
5. Style section appropriately

---

## Phase 5: Testing with Real Data

**Goal:** Validate system with Global Dialogues data

### Task 5.1: Prepare Global Dialogues Data

**Objective:** Convert Global Dialogues data to DTEF format and prepare for evaluation.

**Acceptance Criteria:**
- [ ] Global Dialogues data downloaded
- [ ] Data converted to DTEF format
- [ ] Data validated
- [ ] Meaningful demographic segments defined
- [ ] Data ready for blueprint generation

**Dependencies:** Task 2.1, Task 1.5

**Complexity:** Complex

**Files to Create:**
- `data/global-dialogues/dtef-format.json` - Converted data
- `data/global-dialogues/segments-config.json` - Segment definitions

**Implementation Steps:**
1. Obtain Global Dialogues data
2. Use adapter to convert to DTEF format
3. Validate converted data
4. Define demographic segments (start simple: age, gender, country)
5. Document segment definitions
6. Store converted data

---

### Task 5.2: Generate Blueprints from Real Data

**Objective:** Generate evaluation blueprints from Global Dialogues data.

**Acceptance Criteria:**
- [ ] Blueprints generated for selected segments
- [ ] Blueprints validated
- [ ] Blueprints uploaded to dtef-configs
- [ ] Blueprints tagged appropriately

**Dependencies:** Task 5.1, Task 2.9

**Complexity:** Medium

**Implementation Steps:**
1. Run blueprint generation command
2. Review sample blueprints
3. Validate all blueprints
4. Upload to dtef-configs repository
5. Tag with `_periodic` for scheduled runs
6. Document blueprint set

---

### Task 5.3: Execute Initial Evaluation Run

**Objective:** Run evaluations on real data and verify results.

**Acceptance Criteria:**
- [ ] Manual evaluation run executed
- [ ] Results stored successfully
- [ ] Results include distribution scores
- [ ] Results are reasonable and interpretable
- [ ] Any issues documented

**Dependencies:** Task 5.2

**Complexity:** Medium

**Implementation Steps:**
1. Trigger manual evaluation run
2. Monitor execution
3. Verify results stored in S3
4. Review sample results
5. Check for errors or anomalies
6. Document findings

---

### Task 5.4: Analysis and Iteration

**Objective:** Analyze results and iterate on system based on findings.

**Acceptance Criteria:**
- [ ] Results analyzed for patterns
- [ ] Questions answered:
   - Are distribution predictions reasonable?
   - Which models perform best?
   - Which segments are hardest to predict?
   - Is the scoring metric appropriate?
- [ ] Iterations made based on findings
- [ ] Findings documented

**Dependencies:** Task 5.3

**Complexity:** Complex

**Files to Create:**
- `docs/ANALYSIS_FINDINGS.md` - Analysis document

**Implementation Steps:**
1. Review all results
2. Calculate statistics (average scores, model rankings, segment difficulty)
3. Identify patterns and anomalies
4. Answer key questions
5. Make improvements based on findings
6. Document analysis and changes

---

## Phase 6: Polish & Documentation

**Goal:** Finalize system for production use

### Task 6.1: UI Polish

**Objective:** Improve UI with error handling, loading states, and responsiveness.

**Acceptance Criteria:**
- [ ] All UI components have loading states
- [ ] All UI components have error handling
- [ ] UI is mobile responsive
- [ ] UI is accessible (WCAG compliance)
- [ ] UI has consistent styling

**Dependencies:** Phase 4 complete

**Complexity:** Medium

**Files to Modify:**
- All UI components created in Phase 4

**Implementation Steps:**
1. Add loading states to all async operations
2. Add error boundaries and error messages
3. Test mobile responsiveness
4. Run accessibility audit
5. Fix accessibility issues
6. Ensure consistent styling

---

### Task 6.2: Documentation Updates

**Objective:** Update all documentation to reflect demographic approach.

**Acceptance Criteria:**
- [ ] `SURVEY_MODULE.md` updated
- [ ] API documentation created
- [ ] User guide for uploading survey data created
- [ ] Architecture documentation updated
- [ ] All documentation is accurate and complete

**Dependencies:** All phases complete

**Complexity:** Medium

**Files to Modify:**
- `docs/SURVEY_MODULE.md`
- `docs/ARCHITECTURE.md` (if exists)

**Files to Create:**
- `docs/API.md` - API documentation
- `docs/USER_GUIDE.md` - User guide

**Implementation Steps:**
1. Update SURVEY_MODULE.md with demographic approach
2. Create API documentation
3. Create user guide
4. Update architecture docs
5. Review all docs for accuracy

---

### Task 6.3: Code Cleanup

**Objective:** Remove or archive legacy code and clean up unused files.

**Acceptance Criteria:**
- [ ] Legacy participant-based code marked or archived
- [ ] Unused prompt files archived
- [ ] Dead code removed
- [ ] Code is well-organized
- [ ] No unused imports or dependencies

**Dependencies:** All phases complete

**Complexity:** Simple

**Files to Archive:**
- `dtef_prompt.txt`
- `dtef_prompt_revision.md`
- `survey-data-conversion-prompt.md` (if not needed)

**Implementation Steps:**
1. Identify legacy code
2. Archive or remove unused files
3. Remove dead code
4. Clean up unused imports
5. Organize code structure

---

### Task 6.4: Final Project Context Update

**Objective:** Update PROJECT_CONTEXT.md with final architecture.

**Acceptance Criteria:**
- [ ] PROJECT_CONTEXT.md reflects final implementation
- [ ] Architecture is accurately documented
- [ ] Key decisions are documented
- [ ] Future work is outlined

**Dependencies:** All phases complete

**Complexity:** Simple

**Files to Modify:**
- `PROJECT_CONTEXT.md`

**Implementation Steps:**
1. Review PROJECT_CONTEXT.md
2. Update with final architecture
3. Document key decisions made
4. Outline future enhancements
5. Ensure accuracy

---

## Task Status Tracking

Use this section to track progress on tasks. Update status as you complete tasks.

### Phase 0: Infrastructure Setup
- [x] Task 0.1: Environment Configuration Setup
- [x] Task 0.2: Repository Configuration (extended to include all API routes, webhooks, and Netlify functions)
- [x] Task 0.3: Create dtef-configs Repository Structure (repo already has blueprints/, models/CORE.json)
- [x] Task 0.4: Enable Scheduled Evaluation Functions (enabled in netlify.toml, pending dtef-configs repo for full testing)
- [x] Task 0.5: Infrastructure Validation Checkpoint (scripts/test-infrastructure.ts, all 10 tests pass)

### Phase 1: Evaluate & Adapt Existing Code
- [x] Task 1.1: Review Current Survey Types
- [x] Task 1.2: Design Demographic Distribution Data Structure
- [x] Task 1.3: Assess Blueprint Generation Service
- [x] Task 1.4: Mark Legacy Code
- [x] Task 1.5: Create Data Validation Service

### Phase 2: Demographic Blueprint Generation
- [x] Task 2.1: Create Global Dialogues Adapter (globalDialoguesAdapter.ts + `dtef import-gd` CLI command)
- [x] Task 2.2: Create Demographic Blueprint Service - Core Structure
- [x] Task 2.3: Implement Token Budget Management (tokenCounter.ts + integrated into blueprint service)
- [x] Task 2.4: Implement Demographic Segment Selection
- [x] Task 2.5: Implement Blueprint Prompt Generation
- [x] Task 2.6: Implement WevalConfig Generation
- [x] Task 2.7: Create Distribution Metric Point Function
- [x] Task 2.8: Integrate Distribution Metric into Blueprints
- [x] Task 2.9: Implement CLI Commands for Demographic Generation
- [x] Task 2.10: Create Blueprint Publishing Helper (dtef publish command)
- [x] Task 2.11: Phase 2 Validation Checkpoint (covered by test:infra script)

### Phase 3: Results Storage & Aggregation
- [x] Task 3.1: Extend Results Metadata (DTEFResultMetadata in shared.ts, context in blueprints)
- [x] Task 3.2: Create Demographic Aggregation Service (demographicAggregationService.ts)
- [x] Task 3.3: Extend Summary Calculation Utils (dtefSummaryUtils.ts)

### Phase 4: MVP Leaderboard UI
- [x] Task 4.1: Create Demographic Leaderboard API Endpoint (src/app/api/demographics/route.ts)
- [x] Task 4.2: Create Demographic Leaderboard Component (DemographicLeaderboard.tsx with score bars, fairness analysis)
- [x] Task 4.3: Create Demographics Page (src/app/(standard)/demographics/page.tsx)
- [x] Task 4.4: Integrate into Homepage (demographics section with link added to page.tsx)

### Phase 5: Testing with Real Data
- [ ] Task 5.1: Prepare Global Dialogues Data
- [ ] Task 5.2: Generate Blueprints from Real Data
- [ ] Task 5.3: Execute Initial Evaluation Run
- [ ] Task 5.4: Analysis and Iteration

### Phase 6: Polish & Documentation
- [ ] Task 6.1: UI Polish
- [ ] Task 6.2: Documentation Updates
- [ ] Task 6.3: Code Cleanup
- [ ] Task 6.4: Final Project Context Update

---

## Notes for Coding Agents

1. **Always start with Phase 0** - Infrastructure must be working before building features
2. **Complete tasks in order** - Dependencies are clearly marked
3. **Verify acceptance criteria** - Don't mark tasks complete until all criteria are met
4. **Update task status** - Keep the tracking section updated
5. **Document decisions** - If you make architectural decisions, document them
6. **Test incrementally** - Test each component as you build it
7. **Ask for clarification** - If a task is unclear, ask before proceeding

---

**End of Task Plan**
