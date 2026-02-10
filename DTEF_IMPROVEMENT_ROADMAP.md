# DTEF Improvement Roadmap

*Comprehensive audit of remaining work, transition debt, and improvement opportunities*

**Created:** 2026-02-10
**Scope:** Codebase audit covering DTEF implementation gaps, Weval→DTEF transition debt, deprecated code, and UX/backend/infrastructure improvements

---

## How to Use This Document

This roadmap is organized by **priority tier**. Each item includes context, rationale, and affected files. Future agents should:

1. Start with **Tier 1 (Critical)** items — these are blocking or high-impact
2. Work through **Tier 2 (High Value)** for substantial platform improvement
3. Reference **Tier 3 (Polish)** during Phase 6 cleanup
4. Consult **Tier 4 (Future)** only after all earlier tiers are addressed

**Related Documents:**
- `DTEF_TASK_PLAN.md` — Phase 5-6 tasks (testing with real data, polish)
- `DTEF_PROJECT_PLAN.md` — Original implementation phases
- `DTEF_AGENT_ARCHITECTURE.md` — Coding conventions and workflow
- `PROJECT_CONTEXT.md` — DTEF vs Weval context

---

## Tier 1: Critical / Blocking

### 1.1 Run First Real Evaluation (Phase 5)

**Status:** Not started (Phase 5.1-5.4 in DTEF_TASK_PLAN.md)
**Impact:** Without real evaluation data, the entire leaderboard UI shows empty states

The platform is built but has never run evaluations against real data. This is the single most important next step.

**Steps:**
1. Import Global Dialogues data: `pnpm cli dtef import-gd -r GD4 -o output/gd4.json`
2. Generate zero-context blueprints: `pnpm cli dtef generate -i output/gd4.json -o ./output/dtef-blueprints/gd4/`
3. Generate full-context blueprints: `pnpm cli dtef generate -i output/gd4.json -o ./output/dtef-blueprints/gd4-ctx/ --context-questions all --token-budget 16384`
4. Publish to dtef-configs: `pnpm cli dtef publish -s ./output/dtef-blueprints/gd4/ -t ../dtef-configs/blueprints/gd4/ --tag "global-dialogues-v1"`
5. Tag blueprints with `_periodic` for scheduled runs
6. Trigger manual evaluation run
7. Verify results populate in S3 and leaderboard UI

**Files:** `src/cli/commands/dtef-commands.ts`, dtef-configs repo
**Depends on:** Global Dialogues submodule at `data/global-dialogues`

### 1.2 Migrate Pairwise System Off @netlify/blobs

**Status:** Broken on Railway
**Impact:** Pairwise human preference voting is non-functional

The pairwise comparison system (`/pairs` route) still uses `@netlify/blobs` which only works on Netlify. Since deployment moved to Railway, this entire feature is broken.

**Options:**
- (A) Migrate to S3-based storage (align with rest of app)
- (B) Migrate to PostgreSQL (Railway offers managed Postgres)
- (C) Deprecate the feature if not needed for DTEF

**Files (9):**
- `src/cli/services/pairwise-task-queue-service.ts`
- `src/app/api/pairs/get-task/route.ts`
- `src/app/api/pairs/config/[configId]/get-task/route.ts`
- `src/app/api/pairs/config/[configId]/start-generation/route.ts`
- `src/app/api/pairs/config/[configId]/check-status/route.ts`
- `src/app/api/pairs/submit-preference/route.ts`
- `src/app/api/pairs/log/route.ts`
- Related test files

**Decision needed:** Is pairwise preference collection relevant to DTEF's mission? If not, deprecate and remove the `@netlify/blobs` dependency entirely.

### 1.3 Security: Rotate Exposed Credentials

**Status:** Credentials committed to repo
**Impact:** Security vulnerability

The `.env` and `.env.sentry-build-plugin` files contain real API keys committed to git history. Even if `.gitignore` now excludes them, they exist in git history.

**Action:**
1. Rotate all API keys: OpenRouter, OpenAI, AWS, GitHub token, Sentry auth token, background function auth token
2. Verify `.gitignore` excludes `.env`, `.env.local`, `.env.sentry-build-plugin`
3. Use `git filter-branch` or BFG Repo Cleaner to remove from history (optional but recommended)
4. Ensure all production secrets are in Railway environment variables and GitHub Actions secrets only

---

## Tier 2: High Value Improvements

### 2.1 Weval→DTEF Branding Cleanup

**Status:** Mostly cosmetic; UI is already DTEF-branded
**Impact:** Professional polish, reduces confusion for contributors

#### A. Example Blueprint Authors (6 files)
Change `author: "Weval Team"` → `author: "DTEF Team"`:
- `examples/blueprints/comprehensive.yml`
- `examples/blueprints/factcheck-test.yml`
- `examples/blueprints/call-demo.yml`
- `examples/blueprints/call-demo-simple.yml`
- `examples/blueprints/external-services-demo.yml`
- `examples/blueprints/factcheck-demo.yml`

#### B. Documentation Headers (~8 files)
Update docs that say "Weval platform" when referring to DTEF:
- `docs/OUTPUT_FORMAT.md` — title: "Weval Output JSON Format" → "DTEF Output JSON Format"
- `docs/SURVEY_MODULE.md` — "Weval Blueprints" → "DTEF Blueprints" (lines 3, 118)
- `docs/INTER_AGREEMENT_PLAN.md` — "the Weval platform" → "the DTEF platform" (line 5)
- `docs/VERCEL_DEPLOYMENT_ISSUE.md` — "at weval.org" → "at digitaltwinseval.org" (line 7)
- `docs/BLUEPRINT_FORMAT.md` — "Weval provides/supports" (lines 962, 996, 1133, 1144)
- `survey-data-conversion-prompt.md` — "The Weval system" → "The DTEF system"

#### C. JSDoc Comments (3 files)
- `src/cli/services/demographicBlueprintService.ts` — "Generates Weval blueprints" → "Generates blueprints"
- `src/cli/services/surveyBlueprintService.ts` — "Generate Weval blueprints" → "Generate blueprints"

#### D. Keep As-Is (no changes needed)
- All `WevalConfig`, `WevalResult`, `WevalArticle` type names — these represent the inherited infrastructure layer
- `docs/ARCHITECTURE.md` header note about Weval — accurate attribution
- `README.md` "Built on Weval" section — appropriate credit
- S3 storage paths with `weval` in them — changing would corrupt data
- `DeprecatedFeature.tsx` Weval attribution link — appropriate

### 2.2 Deprecated Feature Assessment & Cleanup

**Status:** Several weval features marked deprecated but still have full code
**Impact:** Reduces codebase complexity, clearer navigation for users

#### Already Deprecated (using DeprecatedFeature component)
These pages show a deprecation notice and can eventually be fully removed:
- `/vibes` — Model similarity visualization
- `/sandbox` — Blueprint sandbox (removed from nav, shows deprecated notice)

#### Should Be Deprecated/Assessed for DTEF Relevance
These are inherited weval features that may or may not serve DTEF's mission:

| Feature | Route | DTEF Relevance | Recommendation |
|---------|-------|----------------|----------------|
| **Experiments** (Guess, LIT, Macro, NDeltas, Pain Points, Redlines, Strawberry) | `/experiments/*` | Low — these are weval research tools | Deprecate or gate behind dev-only flag |
| **Workshops** | `/workshop/*` | Low — collaborative blueprint building for generic evals | Deprecate unless adapted for DTEF survey upload |
| **Pairs** | `/pairs` | Medium — could compare model predictions, but broken (Netlify blobs) | Fix or deprecate (see 1.2) |
| **Regressions** | `/regressions` | Medium — tracking model drift is useful for DTEF | Keep, adapt to demographic context |
| **Tags** | `/tags` | Medium — useful for organizing blueprints | Keep |
| **Story** | `/story` | Low — narrative eval creation for generic evals | Deprecate |
| **Model Cards** | `/models/*` | Medium — useful model metadata | Keep |
| **Public API** | `/api/v1/*` | High — external evaluation submission | Keep |

**Recommendation:** Create a `DTEF_FEATURES.md` that explicitly documents which inherited features are active, deprecated, or under evaluation.

### 2.3 Demographics Page Enhancements

**Status:** MVP functional but needs real data and UX improvements
**Impact:** Core DTEF feature — this is what users come for

**Improvements:**
1. **Empty state handling** — Currently shows nothing without data; add instructional content explaining how to run first evaluation
2. **Segment comparison view** — Allow side-by-side comparison of how models perform across segments (e.g., age 18-25 vs 55+)
3. **Question-level drill-down** — Click a segment to see per-question model accuracy
4. **Context comparison view** — Show zero-context vs full-context performance delta (the key "evidence-adapting vs stereotype-holding" metric from DTEF_OVERVIEW.md)
5. **Export/download** — CSV/JSON export of leaderboard data for researchers
6. **Confidence indicators** — Show sample size warnings for segments with few data points

**Files:**
- `src/app/(standard)/demographics/page.tsx`
- `src/app/components/demographics/DemographicLeaderboard.tsx`
- `src/app/api/demographics/route.ts`

### 2.4 Add CI/CD Pipeline

**Status:** Only a weekly cron workflow exists
**Impact:** Prevents broken code from reaching production

Currently there are no automated checks on PR/push. Need:

1. **`.github/workflows/ci.yml`** with:
   - `pnpm test:web` and `pnpm test:cli` on PR/push
   - TypeScript type checking (`pnpm typecheck`)
   - Build validation (`pnpm build`)
2. **Pre-commit hooks:** Husky is installed but lint-staged has no config. Create `.lintstagedrc.json`
3. **ESLint enforcement:** Currently disabled in builds (`ignoreDuringBuilds: true`). Add gradual enforcement

### 2.5 Evaluation Queue Persistence

**Status:** In-memory only; lost on restart
**Impact:** Queued evaluations silently disappear when Railway redeploys

The evaluation queue (`src/lib/evaluation-queue.ts`) uses an in-memory array. On server restart (Railway deploys), all pending evaluations are lost.

**Options:**
- (A) Use Railway-managed Redis for queue persistence
- (B) Use S3 as a simple queue (write pending items as JSON, poll on startup)
- (C) Accept the limitation and document it (weekly cron will re-discover unrun blueprints)

**Files:** `src/lib/evaluation-queue.ts`

### 2.6 Remove GLM-4.5 Judge Model

**Status:** Fails 100% with empty responses
**Impact:** Wastes evaluation time, always falls back to backup judge

The `z-ai/glm-4.5` model consistently returns empty responses when used as a judge. It should be removed from any judge model configurations.

**Files:** Check `models/CORE.json` in dtef-configs, any hardcoded judge model lists in `src/cli/services/llm-coverage-evaluator.ts`

---

## Tier 3: Polish & Cleanup (Phase 6)

### 3.1 Remove Obsolete Deployment Files

| File | Reason | Action |
|------|--------|--------|
| `.vercelignore` | Vercel deployment abandoned | Delete |
| `.env.example` | Outdated, superseded by `.env.local.example` | Delete or merge |
| `.env.template` | Outdated, references Netlify | Delete or merge |
| `docs/netlify-background-functions.md` | Historical; functions migrated to `/api/internal/` | Archive or add "historical" note |
| `dtef_prompt.txt` | Old prompt draft | Archive to `docs/archive/` or delete |
| `dtef_prompt_revision.md` | Old prompt draft | Archive or delete |

### 3.2 Update next.config.ts Comment

Line ~14 says "Reduce Netlify function size" — should say "Reduce server bundle size" since Railway doesn't have function size limits.

**File:** `next.config.ts`

### 3.3 Legacy Survey Code Decision

**Status:** 1,165 lines of deprecated per-participant survey code
**Impact:** Codebase complexity

Three files are marked `@deprecated` but still present:
- `src/cli/services/surveyBlueprintService.ts` (~309 lines)
- `src/cli/services/surveyValidator.ts` (~309 lines)
- `src/cli/services/surveyEvaluationStrategies.ts` (~311 lines)
- `src/cli/commands/surveyCommands.ts` (~545 lines)

Plus 9 known TypeScript errors in these files.

**Options:**
- (A) Delete entirely — the DTEF demographic approach fully replaces this
- (B) Move to `src/cli/services/legacy/` directory — preserves for reference
- (C) Leave as-is with `@deprecated` markers — current approach

**Recommendation:** Option A (delete). The DTEF approach is a strict superset. If needed for reference, git history preserves the code.

### 3.4 Documentation Consolidation

**Status:** 7 DTEF-specific docs at root level + docs/ folder
**Impact:** Documentation sprawl; unclear which docs are current

Current root-level docs:
- `DTEF_OVERVIEW.md` — Project vision (still current)
- `DTEF_PROJECT_PLAN.md` — Implementation plan (phases 0-4 complete)
- `DTEF_TASK_PLAN.md` — Detailed tasks (phases 0-4 complete)
- `DTEF_AGENT_ARCHITECTURE.md` — Agent coding guide (references Phase 0 start)
- `DTEF_DOCUMENTATION_INDEX.md` — Navigation guide
- `PROJECT_CONTEXT.md` — DTEF vs Weval context
- `DTEF_IMPROVEMENT_ROADMAP.md` — This document

**Recommendation:**
1. Update `DTEF_TASK_PLAN.md` to focus on Phase 5-6 remaining work + items from this roadmap
2. Mark `DTEF_PROJECT_PLAN.md` as "Phase 0-4 Complete — see DTEF_IMPROVEMENT_ROADMAP.md for next steps"
3. Update `DTEF_DOCUMENTATION_INDEX.md` to reference this roadmap
4. Simplify `DTEF_AGENT_ARCHITECTURE.md` — remove Phase 0 startup instructions, focus on conventions

### 3.5 Fix TypeScript Build Errors

**Status:** 9 known errors in legacy CLI code, ignored via `ignoreBuildErrors: true`
**Impact:** Masks potential real errors

The `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }` settings exist because of legacy code errors. After removing legacy survey code (3.3), try re-enabling type checking in builds.

**Files:** `next.config.ts`, legacy survey files

### 3.6 Error Handling Improvements

**S3 Storage Service:**
- Silent failures — `getJsonFile()` returns `undefined` for both "not found" and "error"
- No retry logic for transient failures (429, 503)
- No structured logging for S3 errors

**File:** `src/lib/storageService.ts`

**Recommended changes:**
1. Add retry with exponential backoff for transient S3 errors
2. Distinguish "not found" (return null) from "error" (throw)
3. Add structured error logging

### 3.7 Homepage Improvements

**Current state:** Homepage shows DTEF leaderboard (if data exists), then inherited weval sections (Featured Blueprints, Browse All, Tags, etc.)

**Improvements:**
1. **Hero section:** The `HomePageBanner` component should be assessed — does it explain DTEF clearly to new visitors?
2. **Empty state:** When no DTEF data exists, the demographic section is hidden; should show an explanatory card instead
3. **De-emphasize weval sections:** Featured Blueprints / Browse All / Tags are weval-inherited and may confuse users who expect only DTEF content
4. **Add "What is DTEF?" link** prominently — the `/what-is-an-eval` page exists and is well-written

**Files:** `src/app/(standard)/page.tsx`, `src/app/components/HomePageBanner.tsx`

---

## Tier 4: Future Enhancements

These are valuable but depend on earlier tiers being complete and real evaluation data being available.

### 4.1 Context-Level Comparison Dashboard

The core DTEF research question (DTEF_OVERVIEW.md §3.2) is measuring "evidence-adapting vs stereotype-holding" behavior by comparing zero-context and full-context evaluation results. This needs a dedicated visualization:

- Side-by-side JSD scores for same model × same segment × same question at different context levels
- Delta calculation showing improvement (evidence-adapting) or stagnation (stereotype-holding)
- Aggregate view across all segments showing which models benefit most from context

### 4.2 Survey Data Upload UI

Currently survey data must be uploaded via CLI (`dtef import-gd`, `dtef generate`, `dtef publish`). A web-based upload flow would make the platform accessible to researchers who don't use the CLI:

1. Upload structured JSON (DTEFSurveyData format) or CSV
2. Validate and preview segments/questions
3. Generate blueprints in-browser
4. Submit to dtef-configs via PR

### 4.3 Intermediate Context Levels

Current system supports zero-context and full-context. Future enhancement: generate blueprints with 5, 10, 25, 50 context questions to plot a learning curve per model/segment.

### 4.4 Multi-Round Global Dialogues Analysis

The Global Dialogues submodule contains 8 rounds (GD1-GD7, GD6UK). Currently only GD4 has been tested. Running evaluations across all rounds would reveal:
- Cross-temporal consistency (do model predictions hold across survey years?)
- Question overlap analysis (same questions across rounds)
- Expanded segment coverage

### 4.5 Experiment Features Adapted for DTEF

Some weval experiments could be adapted for DTEF:
- **Macro** heatmap → Show prediction accuracy heatmap across segments × questions
- **NDeltas** → Show which segments each model is weakest on
- **Regressions** → Track demographic prediction accuracy across model versions

### 4.6 Evaluation Type Registry

The `PROJECT_CONTEXT.md` mentions making evaluation types pluggable. Currently only "Demographic Distribution Prediction" exists. Future types could include:
- Individual participant prediction (the original survey.ts approach)
- Cross-demographic comparison (predict relative differences between segments)
- Temporal prediction (predict how a segment's views change over time)

---

## Summary Matrix

| # | Item | Tier | Effort | Impact | Blocked By |
|---|------|------|--------|--------|------------|
| 1.1 | Run first real evaluation | 1 | Medium | Critical | GD submodule |
| 1.2 | Migrate pairwise off @netlify/blobs | 1 | Medium | High (or deprecate) | Decision needed |
| 1.3 | Rotate exposed credentials | 1 | Small | Critical | None |
| 2.1 | Weval→DTEF branding cleanup | 2 | Small | Medium | None |
| 2.2 | Deprecated feature assessment | 2 | Small | Medium | None |
| 2.3 | Demographics page enhancements | 2 | Large | High | 1.1 |
| 2.4 | Add CI/CD pipeline | 2 | Medium | High | None |
| 2.5 | Evaluation queue persistence | 2 | Medium | Medium | None |
| 2.6 | Remove GLM-4.5 judge model | 2 | Small | Small | None |
| 3.1 | Remove obsolete deployment files | 3 | Small | Small | None |
| 3.2 | Update next.config.ts comment | 3 | Trivial | Trivial | None |
| 3.3 | Legacy survey code decision | 3 | Small | Medium | None |
| 3.4 | Documentation consolidation | 3 | Medium | Medium | None |
| 3.5 | Fix TypeScript build errors | 3 | Medium | Medium | 3.3 |
| 3.6 | Error handling improvements | 3 | Medium | Medium | None |
| 3.7 | Homepage improvements | 3 | Medium | Medium | 1.1 |
| 4.1 | Context-level comparison dashboard | 4 | Large | High | 1.1 |
| 4.2 | Survey data upload UI | 4 | Large | High | 1.1 |
| 4.3 | Intermediate context levels | 4 | Medium | Medium | 1.1 |
| 4.4 | Multi-round GD analysis | 4 | Medium | Medium | 1.1 |
| 4.5 | Experiment features for DTEF | 4 | Large | Medium | 1.1, 2.2 |
| 4.6 | Evaluation type registry | 4 | Large | Medium | 1.1 |

---

## Architecture Notes for Future Agents

### What's Working Well
- Core evaluation pipeline is solid and production-tested
- DTEF demographic blueprint generation is complete and tested
- S3 storage layer handles reads/writes reliably
- Background function pattern (fire-and-forget via `/api/internal/`) works on Railway
- CLI is comprehensive with good command structure
- Point function library is extensive (72 functions + 2 DTEF-specific)
- UI uses modern stack (Next.js 15, React 19, Tailwind, Radix UI)

### What Needs Attention
- No real DTEF evaluation data exists yet (the platform is built but untested with real runs)
- Pairwise system is non-functional on Railway
- Error handling in storage layer silently swallows failures
- In-memory evaluation queue is fragile
- Legacy code adds ~2,000 lines of dead weight
- 7 root-level DTEF docs need consolidation

### Key Invariants
- **Never rename WevalConfig/WevalResult types** — they're used in 40+ files and represent the evaluation infrastructure layer
- **Never change S3 storage paths** — existing data would become inaccessible
- **Always use `decodeURIComponent()`** on dynamic route params — Next.js doesn't fully decode colons in configIds
- **Background functions must return 202 immediately** — work happens in detached promises
- **MAX_CONCURRENT=3 for evaluation queue** — prevents Railway OOM

---

*End of Improvement Roadmap*
