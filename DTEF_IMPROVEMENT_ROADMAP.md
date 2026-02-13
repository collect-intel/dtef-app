# DTEF Improvement Roadmap

*Comprehensive audit of remaining work, transition debt, and improvement opportunities*

**Created:** 2026-02-10
**Last Updated:** 2026-02-10
**Scope:** Codebase audit covering DTEF implementation gaps, Weval→DTEF transition debt, deprecated code, and UX/backend/infrastructure improvements

---

## How to Use This Document

This roadmap is organized by **priority tier**. Each item includes context, rationale, and affected files.

**Related Documents:**
- `DTEF_AGENT_ARCHITECTURE.md` — Architecture, conventions, and coding workflow
- `DTEF_DOCUMENTATION_INDEX.md` — All documentation with navigation
- `docs/archive/` — Historical/deprecated docs preserved for reference

---

## Tier 1: Critical / Blocking

### 1.1 Run First Real Evaluation (Phase 5)

**Status:** ✅ Complete — evaluations are live on digitaltwinseval.org

### 1.2 Remove Pairwise System & @netlify/blobs

**Status:** ✅ Complete — pairwise system removed, `@netlify/blobs` uninstalled (23 files deleted)

### 1.3 Security: Credential Review

**Status:** ✅ Verified — `.env` and `.env.sentry-build-plugin` were never committed to git history. No credential rotation needed.

---

## Tier 2: High Value Improvements

### 2.1 Weval→DTEF Branding Cleanup

**Status:** ✅ Complete — example blueprint authors updated, doc headers updated, JSDoc updated

#### D. Keep As-Is (no changes needed)
- All `WevalConfig`, `WevalResult`, `WevalArticle` type names — these represent the inherited infrastructure layer
- `docs/ARCHITECTURE.md` header note about Weval — accurate attribution
- `README.md` "Built on Weval" section — appropriate credit
- S3 storage paths with `weval` in them — changing would corrupt data
- `DeprecatedFeature.tsx` Weval attribution link — appropriate

### 2.2 Deprecated Feature Assessment & Cleanup

**Status:** ✅ Complete — experiments/workshops already using DeprecatedFeature component, pairwise removed, Sandbox removed

#### Remaining Active Features (kept)
| Feature | Route | Status |
|---------|-------|--------|
| Regressions | `/regressions` | Active — useful for tracking model drift |
| Tags | `/tags` | Active — blueprint organization |
| Model Cards | `/models/*` | Active — model metadata |
| Public API | `/api/v1/*` | Active — external evaluation submission |

### 2.3 Demographics Page Enhancements

**Status:** ✅ Complete — enhanced with segment explorer, expandable model rows, consistency column, and improved fairness analysis

**What was added:**
- **Segment Explorer** with tabbed segment-type navigation (Age, Gender, Country, etc.) showing per-value leaderboards
- **Expandable model rows** — click any model to see full segment-by-segment breakdown grouped by category
- **Consistency column** — shows ±stddev for cross-segment consistency
- **Enhanced fairness analysis** — shows best/worst segment scores with color coding
- **Better model names** — uses `getModelDisplayLabel()` for clean display

### 2.4 Add CI/CD Pipeline

**Status:** ✅ Complete — `.github/workflows/ci.yml` with type checking, tests, and build

### 2.5 Evaluation Queue Persistence

**Status:** ✅ Assessed — accepting current limitation. Queue stores function references that can't be serialized. Weekly cron provides recovery.

### 2.6 Remove GLM-4.5 Judge Model

**Status:** Needs action in **dtef-configs** repo (not dtef-app)

The `z-ai/glm-4.5` model consistently returns empty responses when used as a judge. Judge models are configured per-blueprint in dtef-configs, not hardcoded in the app.

**Action:** In dtef-configs repo, remove `z-ai/glm-4.5` from judge model lists in blueprint configs.

---

## Tier 3: Polish & Cleanup (Phase 6)

### 3.1 Remove Obsolete Deployment Files

**Status:** ✅ Complete — `.vercelignore`, `.env.example`, `.env.template`, `dtef_prompt.txt`, `dtef_prompt_revision.md` deleted

### 3.2 Update next.config.ts Comment

**Status:** ✅ Complete — comment updated to "bundle size"

### 3.3 Legacy Survey Code Decision

**Status:** ✅ Complete — all legacy survey code deleted (8 files, ~1,165 lines). DTEF demographic approach fully replaces it.

### 3.4 Documentation Consolidation

**Status:** ✅ Complete

**What was done:**
- Created `docs/archive/` directory with README
- Archived 10 historical/deprecated docs (PAIRS, SURVEY_MODULE, SANDBOX_AND_WORKSHOPS, netlify-background-functions, VERCEL_DEPLOYMENT_ISSUE, INTER_AGREEMENT_PLAN, PHASE1_ANALYSIS, DTEF_PROJECT_PLAN, DTEF_TASK_PLAN, PROJECT_CONTEXT)
- Updated `DTEF_DOCUMENTATION_INDEX.md` — streamlined, references archive
- Updated `DTEF_AGENT_ARCHITECTURE.md` — reflects current state, removed outdated sections

### 3.5 Fix TypeScript Build Errors

**Status:** ✅ Complete — TypeScript strict checking enabled (`ignoreBuildErrors: false`), all errors fixed

### 3.6 Error Handling Improvements

**Status:** Not started
**Impact:** Medium

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

**Status:** Not started
**Impact:** Medium

**Improvements:**
1. **Empty state:** When no DTEF data exists, the demographic section is hidden; should show an explanatory card instead
2. **De-emphasize weval sections:** Featured Blueprints / Browse All / Tags are weval-inherited and may confuse users
3. **Add "What is DTEF?" link** prominently — the `/what-is-an-eval` page exists and is well-written

**Files:** `src/app/(standard)/page.tsx`, `src/app/components/HomePageBanner.tsx`

---

## Tier 4: Future Enhancements

These are valuable but depend on earlier tiers being complete and real evaluation data being available.

### 4.1 Context-Level Comparison Dashboard

**Status:** ⏳ Partially complete — foundation implemented, drill-down views remaining

The core DTEF research question (DTEF_OVERVIEW.md §3.2) is measuring "evidence-adapting vs stereotype-holding" behavior by comparing zero-context and full-context evaluation results.

**Implemented:**
- Context Responsiveness spectrum visualization on `/demographics` page (`DemographicLeaderboard.tsx`, lines 373-485)
- Linear regression slope calculation: accuracy vs context count per model/segment (`demographicAggregationService.ts`, lines 255-348)
- Color-gradient ranking: positive slope = evidence-adapting, negative = stereotype-reliant
- Blueprint metadata tracks `contextQuestionCount` for multi-level analysis

**Remaining:**
- Side-by-side JSD scores for same model × same segment × same question at different context levels
- Delta calculation showing per-question improvement magnitude
- Detailed drill-down view: click a model to see context sensitivity per segment/question

### 4.2 Survey Data Upload UI

Currently survey data must be uploaded via CLI (`dtef import-gd`, `dtef generate`, `dtef publish`). A web-based upload flow would make the platform accessible to researchers who don't use the CLI:

1. Upload structured JSON (DTEFSurveyData format) or CSV
2. Validate and preview segments/questions
3. Generate blueprints in-browser
4. Submit to dtef-configs via PR

### 4.3 Intermediate Context Levels

**Status:** ⏳ Infrastructure exists, needs testing with real data

The `--context-levels` CLI flag is implemented (`dtef-commands.ts`, lines 94-149) and supports generating blueprints at multiple context levels (e.g., `0,5,10,25,all`). The blueprint service tracks actual context count in metadata with `-c{N}` config ID suffixes. Token budget may constrain actual count below requested.

**Remaining:**
- Test intermediate levels with real GD data to verify token budget behavior
- Determine standard level set for production use
- Generate and publish intermediate-level blueprints for all rounds

### 4.4 Multi-Round Global Dialogues Analysis

**Status:** ⏳ GD1-GD6 deployed, GD7 and GD6UK being added

The Global Dialogues submodule contains 8 rounds (GD1-GD7, GD6UK). GD1-GD6 are deployed with evaluations running. GD7 and GD6UK are being added. Future analysis:
- Cross-temporal consistency (do model predictions hold across survey years?)
- Question overlap analysis (same questions across rounds)
- Expanded segment coverage

### 4.5 Experiment Features Adapted for DTEF

Some weval experiments could be adapted for DTEF:
- **Macro** heatmap → Show prediction accuracy heatmap across segments × questions
- **NDeltas** → Show which segments each model is weakest on
- **Regressions** → Track demographic prediction accuracy across model versions

### 4.6 Evaluation Type Registry

Make evaluation types pluggable. Currently only "Demographic Distribution Prediction" exists. Future types:
- Individual participant prediction (the original survey.ts approach)
- Cross-demographic comparison (predict relative differences between segments)
- Temporal prediction (predict how a segment's views change over time)

---

## Summary Matrix

| # | Item | Tier | Status |
|---|------|------|--------|
| 1.1 | Run first real evaluation | 1 | ✅ Complete |
| 1.2 | Remove pairwise system | 1 | ✅ Complete |
| 1.3 | Credential review | 1 | ✅ Verified safe |
| 2.1 | Weval→DTEF branding cleanup | 2 | ✅ Complete |
| 2.2 | Deprecated feature assessment | 2 | ✅ Complete |
| 2.3 | Demographics page enhancements | 2 | ✅ Complete |
| 2.4 | Add CI/CD pipeline | 2 | ✅ Complete |
| 2.5 | Evaluation queue persistence | 2 | ✅ Assessed (accepted) |
| 2.6 | Remove GLM-4.5 judge model | 2 | ⏳ dtef-configs action |
| 3.1 | Remove obsolete deployment files | 3 | ✅ Complete |
| 3.2 | Update next.config.ts comment | 3 | ✅ Complete |
| 3.3 | Legacy survey code decision | 3 | ✅ Complete (deleted) |
| 3.4 | Documentation consolidation | 3 | ✅ Complete |
| 3.5 | Fix TypeScript build errors | 3 | ✅ Complete |
| 3.6 | Error handling improvements | 3 | Not started |
| 3.7 | Homepage improvements | 3 | Not started |
| 4.1 | Context-level comparison dashboard | 4 | ⏳ Partially complete |
| 4.2 | Survey data upload UI | 4 | Not started |
| 4.3 | Intermediate context levels | 4 | ⏳ Infrastructure exists |
| 4.4 | Multi-round GD analysis | 4 | ⏳ GD7/GD6UK being added |
| 4.5 | Experiment features for DTEF | 4 | Not started |
| 4.6 | Evaluation type registry | 4 | Not started |

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
- CI pipeline validates types, tests, and builds on every push/PR

### What Needs Attention
- Error handling in storage layer silently swallows failures (3.6)
- In-memory evaluation queue is fragile (accepted; weekly cron recovers)
- Homepage still shows weval-inherited sections that may confuse DTEF visitors (3.7)

### Key Invariants
- **Never rename WevalConfig/WevalResult types** — they're used in 40+ files and represent the evaluation infrastructure layer
- **Never change S3 storage paths** — existing data would become inaccessible
- **Always use `decodeURIComponent()`** on dynamic route params — Next.js doesn't fully decode colons in configIds
- **Background functions must return 202 immediately** — work happens in detached promises
- **MAX_CONCURRENT=3 for evaluation queue** — prevents Railway OOM
- **TypeScript strict mode enforced** — `ignoreBuildErrors: false` in `next.config.ts`

---

*End of Improvement Roadmap*
