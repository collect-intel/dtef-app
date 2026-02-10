# DTEF Implementation Plan

*For Claude Code agents and developers working on the Digital Twin Evaluation Framework*

---

## Current State Assessment

### Existing DTEF Code (from previous iteration)

| Component | Status | Notes |
|-----------|--------|-------|
| `src/types/survey.ts` | ✅ Functional | Survey data types, participant structures |
| `src/cli/services/surveyBlueprintService.ts` | ⚠️ Needs Adaptation | Generates **per-participant** blueprints (not demographic aggregates) |
| `src/cli/services/surveyValidator.ts` | ✅ Functional | Comprehensive validation |
| `src/cli/services/surveyEvaluationStrategies.ts` | ⚠️ Partial | Iterative holdout implemented; others stubbed |
| `src/cli/commands/surveyCommands.ts` | ✅ Functional | CLI interface |
| `docs/SURVEY_MODULE.md` | ✅ Good | Documentation |
| Tests in `__tests__/` | ✅ Passing | Good coverage |

**Key Gap:** Current implementation is designed for **individual participant prediction** (predict what one person will answer). The updated goal is **demographic segment distribution prediction** (predict what % of a demographic group will select each answer).

### Weval Infrastructure Available

| Component | Location | Status |
|-----------|----------|--------|
| Scheduled evaluation trigger | `netlify/functions/fetch-and-schedule-evals.ts` | Ready (schedule commented out) |
| Background execution | `netlify/functions/execute-evaluation-background.ts` | Ready |
| Blueprint service | `src/lib/blueprint-service.ts` | Ready |
| Comparison pipeline | `src/cli/services/comparison-pipeline-service.ts` | Ready |
| S3 storage | `src/lib/storageService.ts` | Ready |
| Leaderboard components | `src/app/components/home/*.tsx` | Ready to adapt |

---

## Phase 0: Infrastructure Setup

**Goal:** Get DTEF running as an independent weval-like platform

### 0.1 Environment Configuration

Create/verify these environment variables:

```bash
# Required for model evaluation
OPENROUTER_API_KEY=          # Primary model access
ANTHROPIC_API_KEY=           # For Claude models (optional if using OpenRouter)
OPENAI_API_KEY=              # For OpenAI models (optional if using OpenRouter)

# Required for storage
APP_S3_REGION=
APP_AWS_ACCESS_KEY_ID=
APP_AWS_SECRET_ACCESS_KEY=
APP_S3_BUCKET_NAME=

# Required for GitHub integration
GITHUB_TOKEN=                # Access to dtef-configs repo

# Required for scheduled functions
BACKGROUND_FUNCTION_AUTH_TOKEN=
URL=                         # Netlify site URL

# DTEF-specific
NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG=collect-intel/dtef-configs  # Or your org
```

### 0.2 Repository Setup

1. **Create dtef-configs repository** (if not exists)
   - Structure: `/blueprints/`, `/models/`, `/surveys/`
   - Add `CORE.json` model collection with target models

2. **Update configConstants.ts** to point to dtef-configs:
   ```typescript
   export const BLUEPRINT_CONFIG_REPO_SLUG = process.env.NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG || 'collect-intel/dtef-configs';
   ```

### 0.3 Enable Scheduled Evaluations

In `netlify.toml`, uncomment and configure:
```toml
[functions."fetch-and-schedule-evals"]
schedule = "0 0 * * 0"  # Weekly, or adjust as needed
```

### 0.4 Validation Checkpoint

- [ ] Can fetch blueprints from dtef-configs via GitHub API
- [ ] Can execute a simple weval blueprint manually
- [ ] Can store results to S3
- [ ] Scheduled function triggers (test with short interval)

**Decision Point:** Before proceeding, verify the basic weval pipeline works end-to-end with DTEF infrastructure.

---

## Phase 1: Evaluate & Adapt Existing DTEF Code

**Goal:** Decide what to keep, modify, or replace from previous iteration

### 1.1 Review Current Survey Types

Read and evaluate `src/types/survey.ts`:

**Questions to answer:**
- Does the `Survey` type support aggregate response distributions?
- Can `SurveyQuestion` hold percentage breakdowns by demographic?
- Is `Participant` structure needed for demographic-aggregate approach?

**Likely outcome:** Need to add new types for aggregate data while potentially keeping participant types for future individual-prediction features.

### 1.2 Design Demographic Distribution Data Structure

**Proposed new types** (add to `src/types/survey.ts` or new `src/types/dtef.ts`):

```typescript
interface DemographicSegment {
  id: string;                           // e.g., "age_18-25_gender_female"
  label: string;                        // e.g., "Age 18-25, Female"
  attributes: Record<string, string>;   // { age: "18-25", gender: "Female" }
  sampleSize: number;
}

// Normalized structure to avoid duplication
interface DTEFSurveyData {
  surveyId: string;
  surveyName: string;
  // Map questionId -> Definition
  questions: Record<string, {
    text: string;
    options: string[];
  }>;
  // Segments containing response data
  segments: {
    id: string; // references segment defined in metadata or inline
    attributes: Record<string, string>;
    // Map questionId -> distribution (percentages matching options order)
    responses: Record<string, number[]>;
  }[];
}
```

### 1.3 Assess Blueprint Generation Service

Review `src/cli/services/surveyBlueprintService.ts`:

**Current behavior:** Creates one blueprint per participant with their individual responses as evaluation targets.

**Needed behavior:** Creates blueprints that:
1. Present demographic context + question distributions
2. Ask model to predict distribution for target question
3. Compare predicted distribution to actual

**Decision:** Create new service (`demographicBlueprintService.ts`) or heavily modify existing?

**Recommendation:** Create new service to avoid breaking existing functionality; mark old service as legacy.

### 1.4 Cleanup Tasks

| File | Action | Reason |
|------|--------|--------|
| `surveyBlueprintService.ts` | Keep, mark legacy | May be useful for individual prediction research |
| `surveyEvaluationStrategies.ts` | Review | Iterative holdout concept may adapt to demographic context |
| `surveyCommands.ts` | Extend | Add new commands for demographic blueprint generation |
| `example-survey.json` | Replace | Need demographic aggregate example data |
| `dtef_prompt.txt`, `dtef_prompt_revision.md` | Archive | Historical context, not needed for implementation |
| `survey-data-conversion-prompt.md` | Review | May need update for new data format |

---

## Phase 2: Demographic Blueprint Generation

**Goal:** Generate weval-compatible blueprints from demographic survey data

### 2.1 Survey Data Ingestion & Conversion

**Strategy:**
1. **Strict Schema:** Define the `DTEFSurveyData` JSON schema as the required input format.
2. **Adapters:** Build specific adapters for known formats (e.g., Global Dialogues).
3. **LLM Conversion Assistant:** (Future/Parallel) A tool to help users convert arbitrary CSVs to our schema.

**Component 1: Global Dialogues Adapter**
`src/cli/services/adapters/globalDialoguesAdapter.ts`
- Specific logic to parse GD-formatted CSV/JSON.

**Component 2: LLM Conversion Pipeline (Experimental)**
- **Input:** Raw data file + Description
- **Process:** LLM writes a Python/TS script to map raw data -> `DTEFSurveyData`
- **Validation:** Run script, validate output against schema.

### 2.2 Create Demographic Blueprint Generator

**New file:** `src/cli/services/demographicBlueprintService.ts`

**Token Budget Strategy:**
- **Baseline Limit:** Enforce a strict token limit (e.g., 4096 tokens) for the context window to ensure compatibility with most "Core" models.
- **Adaptive:** (Future) Allow overriding limit for high-context models.
- **Mechanism:** Count tokens in context questions; if limit exceeded, reduce `contextQuestionCount`.

**Core function:**
```typescript
function generateDemographicBlueprints(
  surveyData: DTEFSurveyData,
  config: DemographicBlueprintConfig
): WevalConfig[]
```

**Config options:**
```typescript
interface DemographicBlueprintConfig {
  contextQuestionCount: number;      // How many questions to provide as context
  targetQuestionCount: number;       // How many to ask model to predict (usually 1)
  demographicDetailLevels: string[]; // ['age', 'age+gender', 'age+gender+country']
  outputFormat: 'percentage' | 'distribution';
}
```

**Blueprint structure:**
```yaml
name: "DTEF: Survey X - Age 18-25 Female - Q5"
description: "Predict response distribution for demographic segment"
prompts:
  - id: predict_q5
    messages:
      - role: system
        content: |
          You are predicting survey response distributions for demographic groups.
          Given information about how a demographic segment answered previous questions,
          predict the percentage distribution of their responses to a new question.
      - role: user
        content: |
          Demographic: Age 18-25, Female

          Previous responses from this demographic:
          Q1: "Should AI be used in hiring?" → Strongly Agree: 15%, Agree: 25%, Neutral: 30%, Disagree: 20%, Strongly Disagree: 10%
          Q2: "Do you trust AI recommendations?" → Strongly Agree: 10%, Agree: 35%, Neutral: 25%, Disagree: 20%, Strongly Disagree: 10%

          Predict the distribution for:
          Q5: "Would you use an AI therapist?"
          Options: Strongly Agree, Agree, Neutral, Disagree, Strongly Disagree

          Respond with percentages that sum to 100%.
    evaluationPoints:
      - name: distribution_accuracy
        type: distribution_metric  # Custom type, NOT 'js'
        params:
           actualDistribution: [12, 28, 30, 22, 8] # Injected ground truth
           metric: 'mae' # or 'jsd'
```

### 2.3 Create Distribution Metric Point Function

**New file:** `src/point-functions/distribution_metric.ts`
**Register in:** `src/point-functions/index.ts`

**Why:** The standard `js` evaluator can't easily access the "ground truth" distribution unless we inject it. A custom evaluator type is cleaner.

```typescript
// Calculates MAE or JSD between predicted and actual distributions
// defined in params
function evaluateDistributionMetric(
  response: string,
  args: { actualDistribution: number[], metric: 'mae' | 'jsd' },
  context: PointFunctionContext
): { score: number; details: object }
```

**Parsing logic:**
- Extract percentages from model response (regex or structured output)
- Normalize to ensure sum = 100%
- Calculate MAE: `mean(|predicted[i] - actual[i]|)`
- Calculate JSD: Jensen-Shannon Divergence

### 2.4 Context-Level Blueprint Strategy

**Core Research Design:** Generate multiple blueprint sets for the same segment + question combinations at different context levels to measure evidence-adaptation vs. stereotype-holding.

**Blueprint naming convention:**
- `dtef-global-dialogues-gd4-country:australia.yml` — zero-context (no other question distributions)
- `dtef-global-dialogues-gd4-country:australia-ctx.yml` — full-context (all available question distributions, up to token budget)

**Generating context-enriched blueprints:**
```bash
# Zero-context (baseline): only demographic + target question
pnpm cli dtef generate -i output/gd4.json -o ./output/dtef-blueprints/gd4/

# Full-context: all other questions' distributions provided as context
pnpm cli dtef generate -i output/gd4.json -o ./output/dtef-blueprints/gd4-ctx/ \
  --context-questions all --token-budget 16384
```

When `--context-questions all` is specified, the generator automatically uses all non-target questions as context for each prompt. The token budget controls how many context questions fit — with a 16K budget, most or all of a round's questions will fit as context.

**Research analysis:** By comparing the same model's JSD score on zero-context vs. full-context blueprints for the same question and segment:
- **Improvement** = model is evidence-adapting (uses provided distributions to inform prediction)
- **No change** = model is stereotype-holding (ignores context, relies on priors)
- **Degradation** = model is confused by additional context (potential noise sensitivity)

### 2.5 CLI Commands & Workflow

`src/cli/commands/dtef-commands.ts`:

**Workflow:**
1. **Import:** Convert survey data to DTEF format (e.g., `import-gd` for Global Dialogues)
2. **Generate:** Run CLI to generate YAML files in a local `output/` directory (gitignored)
3. **Review:** User manually checks a few blueprints
4. **Publish:** Copy valid blueprints to the `dtef-configs` repo (assumed sibling directory)

```bash
# Import GD4 data
pnpm cli dtef import-gd -r GD4 -o output/gd4.json

# Generate zero-context blueprints
pnpm cli dtef generate -i output/gd4.json -o ./output/dtef-blueprints/gd4/

# Generate full-context blueprints
pnpm cli dtef generate -i output/gd4.json -o ./output/dtef-blueprints/gd4-ctx/ \
  --context-questions all --token-budget 16384

# Publish to config repo
pnpm cli dtef publish \
  --source ./output/dtef-blueprints/gd4-ctx/ \
  --target ../dtef-configs/blueprints/gd4-ctx/ \
  --tag "global-dialogues-v1"
```

### 2.5 Validation Checkpoint

- [ ] Can convert raw survey data to `DTEFSurveyData` format
- [ ] Can generate valid weval blueprints from demographic data
- [ ] Blueprints execute successfully in weval pipeline
- [ ] Distribution accuracy scoring works correctly

**Test with:** Small synthetic survey data before using real Global Dialogues data

---

## Phase 3: Results Storage & Aggregation

**Goal:** Store and aggregate evaluation results by demographic segment

### 3.1 Extend Results Metadata

When saving evaluation results, include demographic segment info:

```typescript
interface DTEFEvaluationResult extends WevalResult {
  dtef?: {
    segmentId: string;
    segmentLabel: string;
    segmentAttributes: Record<string, string>;
    surveyId: string;
    questionId: string;
    actualDistribution: number[];
  };
}
```

### 3.2 Create Aggregation Service

**New file:** `src/cli/services/demographicAggregationService.ts`

```typescript
function aggregateByDemographic(
  results: DTEFEvaluationResult[]
): DemographicLeaderboard[]

function aggregateBySurvey(
  results: DTEFEvaluationResult[]
): SurveyLeaderboard[]
```

### 3.3 Extend Summary Calculation

Modify `src/cli/utils/summaryCalculationUtils.ts`:

- Add demographic leaderboard generation
- Add cross-segment consistency metrics
- Integrate with homepage summary pipeline

---

## Phase 4: MVP Leaderboard UI

**Goal:** Display demographic-specific model performance

### 4.1 API Endpoint

**New file:** `src/app/api/demographic-leaderboards/route.ts`

```typescript
// GET /api/demographic-leaderboards
// Returns: { leaderboards: DemographicLeaderboard[], segments: string[] }

// GET /api/demographic-leaderboards?segment=age_18-25
// Returns: { leaderboard: DemographicLeaderboard }
```

### 4.2 Leaderboard Component

**New file:** `src/app/components/dtef/DemographicLeaderboard.tsx`

Adapt from `CapabilityLeaderboardDisplay.tsx`:
- Segment selector (dropdown)
- Model ranking table
- Score display (lower MAE = better, so invert color coding)
- Evaluation count per model

### 4.3 Leaderboard Page

**New file:** `src/app/(standard)/demographics/page.tsx`

- Route: `/demographics`
- Shows segment selector
- Displays leaderboard for selected segment
- Links to detailed results

### 4.4 Homepage Integration

Modify `src/app/(standard)/page.tsx`:
- Add "Demographic Prediction Accuracy" section
- Show top models across segments
- Link to full demographics page

---

## Phase 5: Testing with Real Data

**Goal:** Validate system with Global Dialogues data

### 5.1 Prepare GD Data

1. Download Global Dialogues GD4 data
2. Convert to `DTEFSurveyData` format
3. Define meaningful demographic segments
4. Generate blueprints

### 5.2 Initial Evaluation Run

1. Upload blueprints to dtef-configs
2. Tag with `_periodic` for scheduled runs
3. Execute manual run first to verify
4. Review results and scoring

### 5.3 Analysis & Iteration

**Questions to answer:**
- Are distribution predictions reasonable?
- Which models perform best?
- Which segments are hardest to predict?
- Is the scoring metric (MAE/JSD) appropriate?

**Iterate based on findings.**

---

## Phase 6: Polish & Documentation

### 6.1 UI Polish

- Error handling and loading states
- Mobile responsiveness
- Accessibility

### 6.2 Documentation

- Update `SURVEY_MODULE.md` for demographic approach
- Add API documentation
- Create user guide for uploading survey data

### 6.3 Cleanup

- Remove or archive legacy participant-based code
- Clean up unused prompt files
- Update `PROJECT_CONTEXT.md` with final architecture

---

## Decision Points & Open Questions

### Decision 1: Scoring Metric
**Options:**
- MAE (Mean Absolute Error) - simple, interpretable
- JSD (Jensen-Shannon Divergence) - better for distributions
- Both (show JSD, rank by MAE)

**Recommendation:** Start with MAE for simplicity, add JSD later.

### Decision 2: Output Format
**Options:**
- Free-form text parsing (flexible, error-prone)
- Structured JSON output (reliable, limits models)
- Hybrid (try JSON, fall back to parsing)

**Recommendation:** Hybrid approach with strong parsing.

### Decision 3: Demographic Granularity
**Question:** How many segment combinations to generate?

Example: 4 age groups × 2 genders × 5 countries = 40 segments

**Consideration:** More segments = more evaluations = more cost + time

**Recommendation:** Start with single-attribute segments, add combinations incrementally.

### Decision 4: Context Question Selection
**Question:** Which questions to include as context?

**Options:**
- All available questions (`--context-questions all`) — maximizes evidence provided to the model
- Random selection — useful for studying which questions provide the most informative context
- Semantically similar questions — test whether topically related context helps
- Questions with highest demographic variance — context that most differentiates this segment
- User-configurable — explicit question IDs

**Recommendation:** Start with `all` (all non-target questions as context) for the primary evidence-adapting evaluation. This provides the maximum amount of evidence to the model and establishes the upper bound on context-informed performance. Random or variance-based selection can be explored later for more granular analysis.

### Decision 5: Context-Level Comparison Strategy
**Question:** How to structure the varying-context comparison for measuring evidence-adaptation vs. stereotype-holding?

**Approach (implemented):**
- **Zero-context blueprints**: Existing baseline — only demographic attributes + target question
- **Full-context blueprints** (suffix `-ctx`): All non-target question distributions provided, up to token budget
- Compare the same model's scores on zero-context vs. full-context for the same segment + question
- The delta is the "evidence-adaptation" measure

**Future extensions:**
- Intermediate context levels (5, 10, 25, 50 questions) to plot a learning curve
- Context ordering experiments (random vs. semantic similarity vs. variance-based)
- Per-question analysis of which context questions are most informative

---

## File Summary

### New Files to Create

```
src/types/dtef.ts                                    # DTEF-specific types
src/cli/services/adapters/globalDialoguesAdapter.ts  # GD data specific adapter
src/cli/services/demographicBlueprintService.ts      # Blueprint generation
src/cli/services/demographicAggregationService.ts    # Results aggregation
src/point-functions/distribution_metric.ts           # Scoring function (custom type)
src/app/api/demographic-leaderboards/route.ts        # API endpoint
src/app/components/dtef/DemographicLeaderboard.tsx   # UI component
src/app/(standard)/demographics/page.tsx             # Leaderboard page
```

### Files to Modify

```
src/types/survey.ts                                  # Add aggregate types
src/cli/commands/surveyCommands.ts                   # Add new commands
src/cli/utils/summaryCalculationUtils.ts             # Add demographic aggregation
src/lib/configConstants.ts                           # Update repo slug
netlify.toml                                         # Enable scheduled functions
```

### Files to Archive/Remove

```
dtef_prompt.txt                                      # Archive
dtef_prompt_revision.md                              # Archive
survey-data-conversion-prompt.md                     # Review, possibly archive
```

---

## Getting Started Checklist

**For coding agents:** Use the detailed task plan and agent architecture first:

1. **Read `AGENT_ARCHITECTURE.md`** — orientation, file map, conventions, handoff.
2. **Read `TASK_PLAN.md`** — current focus, next task, dependencies, status.
3. Then use this checklist for high-level alignment:
   - [ ] Read `DTEF_OVERVIEW.md` and `PROJECT_CONTEXT.md`
   - [ ] Review existing survey code in `src/cli/services/survey*.ts`
   - [ ] Set up environment variables (Phase 0.1)
   - [ ] Verify weval pipeline works (Phase 0.4)
   - [ ] Start with Phase 1 — evaluate existing code
   - [ ] Create `src/types/dtef.ts` with new type definitions
   - [ ] Build incrementally, test each component

**First concrete task (from TASK_PLAN):** Complete T0.1–T0.4 if needed, then T1.1–T1.2. Create `src/types/dtef.ts` with the demographic data structures; optionally add a small test script that generates one blueprint manually.
