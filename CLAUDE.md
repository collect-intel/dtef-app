# CLAUDE.md - Project Instructions for Claude Code

## Project Overview

**DTEF (Digital Twin Evaluation Framework)** is an open-source platform that measures how accurately AI models predict demographic-specific survey response distributions. Built on the [Weval](https://github.com/weval-org/app) evaluation platform, it adds demographic distribution evaluation capabilities.

**Live at:** [digitaltwinseval.org](https://digitaltwinseval.org)

**Repositories:**
- `collect-intel/dtef-app` — The evaluation platform (this repo)
- `collect-intel/dtef-configs` — Evaluation blueprints and survey data configurations

**Core workflow:** Survey Data (CSV) → DTEF Format (JSON) → Blueprint Generation → Evaluation → Results → Aggregation → UI Display

## Before Starting Work

1. **Read memory files** at `~/.claude/projects/-Users-evan-Documents-GitHub-dtef-dtef-app/memory/`:
   - `MEMORY.md` — project structure, gotchas, current state
   - `evaluation-pipeline.md` — deep technical reference for configIds, S3 results, scoring pipeline, debugging
2. **Read `docs/EXPERIMENT_PIPELINE.md`** if working on experiments
3. **Check `docs/DTEF_IMPROVEMENT_ROADMAP.md`** for prioritized remaining work

## After Completing Work — ALWAYS Update Memory

After any session where you learn something non-obvious about the project, **you MUST update memory files before finishing**. This includes:

- **Debugging insights**: Root causes and how to find them faster
- **Pipeline behavior**: Discovered behavior about eval pipeline, scheduler, scoring, or S3 storage
- **Gotchas and footguns**: Anything surprising or that caused wasted effort
- **Architecture decisions**: Why something was built a certain way
- **Operational knowledge**: Commands, sequences, or workflows needed for common tasks

Update the appropriate file:
- `memory/MEMORY.md` — high-level project knowledge, gotchas, key file locations
- `memory/evaluation-pipeline.md` — deep technical details about eval pipeline, scoring, S3, scheduler
- `docs/EXPERIMENT_PIPELINE.md` — experiment workflow, CLI commands, findings
- `CLAUDE.md` (this file) — only for meta-instructions about how Claude should behave

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 (strict mode) |
| Framework | Next.js 15 (App Router) + React 19 |
| Package Manager | pnpm 9.15.9 |
| Styling | Tailwind CSS 3.4 + Radix UI + Shadcn components |
| State | Zustand 5 |
| Storage | AWS S3 (production) / local filesystem (dev) |
| LLM Providers | OpenRouter (primary), Anthropic, OpenAI |
| CLI | Commander.js + tsx |
| Testing | Jest 30 + Testing Library |
| Deployment | Railway (auto-deploys from main) |
| Monitoring | Sentry |
| CI | GitHub Actions |

## Directory Structure

```
dtef-app/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/                    # API routes
│   │   │   ├── v1/evaluations/     # Public API (submit/status/result)
│   │   │   ├── internal/           # Background eval workers (auth required)
│   │   │   ├── webhooks/           # GitHub push/PR webhooks
│   │   │   ├── demographics/       # DTEF demographics API
│   │   │   ├── runs/               # Run data endpoints
│   │   │   ├── comparison/         # Detailed comparison data
│   │   │   └── admin/              # Admin tools (revalidate, trigger)
│   │   ├── (standard)/             # Public pages (homepage, leaderboards, model cards)
│   │   ├── analysis/[configId]/    # Detailed blueprint evaluation view
│   │   ├── components/             # Page-level components
│   │   └── utils/                  # App utilities (calculation, markdown, modelId)
│   ├── cli/                        # CLI commands and services
│   │   ├── commands/               # Command handlers (dtef-commands, backfill, etc.)
│   │   ├── services/               # Business logic (blueprint gen, eval pipeline, adapters)
│   │   ├── evaluators/             # Point function implementations
│   │   └── utils/                  # CLI utilities (token counter, summary calc)
│   ├── lib/                        # Shared libraries
│   │   ├── storageService.ts       # S3/local file abstraction (122KB, central)
│   │   ├── blueprint-parser.ts     # Blueprint YAML/JSON parsing
│   │   ├── evaluation-queue.ts     # In-memory eval scheduling
│   │   ├── llm-clients/            # Multi-provider LLM dispatching
│   │   └── configConstants.ts      # Central configuration constants
│   ├── point-functions/            # 70+ scoring functions (distribution, string, tool-use, JSON)
│   ├── types/                      # TypeScript type definitions
│   │   ├── dtef.ts                 # DTEF-specific types (surveys, segments)
│   │   └── shared.ts              # Core types (WevalConfig, WevalResult)
│   └── components/ui/              # Shadcn design system components
├── docs/                           # Technical documentation
│   ├── ARCHITECTURE.md             # System design and module structure
│   ├── BLUEPRINT_FORMAT.md         # Detailed blueprint YAML schema
│   ├── EXPERIMENT_PIPELINE.md      # Experiment workflow
│   ├── PUBLIC_API.md               # External API documentation
│   └── archive/                    # Historical/deprecated docs
├── data/global-dialogues/          # Git submodule → collect-intel/global-dialogues
├── examples/blueprints/            # Example blueprint YAML files
├── scripts/                        # Utility scripts
├── Makefile                        # 60+ convenience targets
└── .github/workflows/              # CI and weekly eval cron
```

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/cli/services/comparison-pipeline-service.ts` | Core evaluation orchestrator |
| `src/lib/storageService.ts` | S3/local storage abstraction (most important service) |
| `src/app/utils/calculationUtils.ts` | Score calculation, hybrid scoring, similarity metrics |
| `src/cli/commands/dtef-commands.ts` | DTEF generation pipeline (import, generate, publish) |
| `src/cli/services/demographicBlueprintService.ts` | Blueprint generation from survey data |
| `src/point-functions/distribution_metric.ts` | JS-divergence, cosine, earth-mover scoring |
| `src/types/dtef.ts` | Core domain types |
| `src/lib/evaluation-queue.ts` | In-memory eval queue (MAX_CONCURRENT=3) |
| `src/app/utils/modelIdUtils.ts` | Model name normalization and display |

## Build & Test

```bash
pnpm dev              # Dev server on port 3172
pnpm build            # Production build (6GB memory allocation)
pnpm test             # All tests (web + CLI)
pnpm test:web         # Jest web/component tests
pnpm test:cli         # Jest CLI tests (ESM modules)
pnpm test:infra       # Infrastructure validation (S3, API)
pnpm lint             # Next.js linting
pnpm typecheck        # TypeScript strict type checking (tsc --noEmit)
pnpm validate:env     # Check environment variable configuration
```

## Common Makefile Targets

```bash
# Evaluation Management
make rerun-evals                          # Trigger scheduler (respects freshness)
make rerun-evals-prefix PREFIX=gd4-syn    # Selective re-eval by path prefix
make rerun-evals-force                    # Force rerun ALL (use sparingly!)
make queue-status                         # Check eval queue
make streaming-summaries                  # Rebuild per-config summaries + aggregates

# DTEF Pipeline
make dtef-import ROUND=GD4               # Import survey data
make dtef-generate ROUND=GD4             # Generate blueprints
make dtef-baselines ROUND=GD4            # Create population baselines
make dtef-publish ROUND=GD4              # Push to dtef-configs repo
make dtef-pipeline ROUND=GD4             # Full pipeline (import→generate→baselines)
make dtef-rebuild                         # Rebuild DTEF summary

# Experiments
make dtef-experiment-create ID=test TITLE="..." HYPOTHESIS="..."
make dtef-experiment-analyze ID=test
make dtef-experiment-promote ID=test

# S3 Inspection
make s3-status                            # Bucket overview
make s3-runs                              # List recent runs
make s3-latest                            # Latest evaluations
```

## CLI Usage

```bash
pnpm cli dtef generate -i data.json      # Generate blueprints from survey data
pnpm cli dtef validate -i data.json       # Validate survey data
pnpm cli dtef preview -i data.json        # Preview generated blueprints
pnpm cli dtef import-gd -r GD4            # Import Global Dialogues round
pnpm cli dtef publish                     # Push blueprints to configs repo
pnpm cli run-config <path>                # Run single blueprint evaluation
pnpm cli backfill-summary                 # Rebuild all summaries from results
pnpm cli streaming-summaries              # Memory-efficient summary rebuild
```

## Storage Architecture

All data lives in S3 (`collect-intel-dtef` bucket) under a `live/` prefix:

```
live/
├── blueprints/{configId}/              # Per-blueprint results
│   └── {runLabel}_{timestamp}/
│       ├── core.json                   # Lightweight payload (scores, metadata)
│       ├── responses/{promptId}.json   # Per-prompt model responses
│       ├── coverage/{promptId}/{modelId}.json  # Rubric evaluations
│       └── histories/{promptId}/{modelId}.json # Full conversation logs
├── aggregates/                         # Global summaries
│   ├── homepage_summary.json
│   ├── latest_runs_summary.json
│   └── search_index.json
└── models/                             # Per-model summaries and cards
    ├── summaries/{modelId}.json
    └── cards/{modelId}.json
```

**Local dev fallback:** Set `STORAGE_PROVIDER=local` to use `.results/` directory instead of S3.

## Key Gotchas

- **ConfigIds are path-derived, NOT from YAML**: The scheduler derives IDs from file paths (`dir/file.yml` → `dir__file`). The YAML `configId` field is ignored at runtime. Always check S3 with `aws s3 ls "s3://collect-intel-dtef/live/blueprints/" | grep "keyword"` to find actual configIds.
- **Hybrid score = coverage only**: `SIMILARITY_WEIGHT=0` in `src/app/utils/calculationUtils.ts`. The similarity matrix is computed but unused in scoring.
- **Don't push while evals are running**: Railway auto-deploys from main, restarting the container and wiping the in-memory eval queue.
- **Scores of 0 usually mean a parsing/pipeline issue**, not a bad model. Check the eval type and whether the point function can handle the response format before assuming results are correct.
- **Targeted re-evaluation**: Use `make rerun-evals-prefix PREFIX=<dir-prefix>` to re-run only configs matching a path prefix. Never use `rerun-evals-force` unless you truly need to re-evaluate all 2000+ configs.
- **Summaries must be rebuilt after evals**: Run `make streaming-summaries` after evaluations complete. The `experiment analyze` command reads summaries, not raw results (except for temperature experiments).
- **WevalConfig/WevalResult types**: Inherited from Weval, used in 40+ files. Don't rename these.
- **Next.js URL param decoding**: App Router does NOT fully decode dynamic route params. Colons stay as `%3A`. Use `decodeURIComponent()` or `decodeRouteParams()` from `src/app/utils/decodeParams.ts`.
- **Evaluation queue is in-memory only**: Items lost on restart. MAX_CONCURRENT=3 to prevent OOM. Weekly cron provides recovery.
- **TypeScript strict builds**: `ignoreBuildErrors: false` in `next.config.ts`. All code must type-check.

## Environment Variables

Required for production:
```
OPENROUTER_API_KEY              # Primary LLM provider
APP_S3_BUCKET_NAME              # collect-intel-dtef
APP_S3_REGION                   # us-east-1
APP_AWS_ACCESS_KEY_ID
APP_AWS_SECRET_ACCESS_KEY
STORAGE_PROVIDER                # "s3" or "local"
GITHUB_TOKEN                    # For configs repo access
BACKGROUND_FUNCTION_AUTH_TOKEN  # For eval worker auth
NEXT_PUBLIC_APP_URL             # http://localhost:3172 (dev)
NEXT_PUBLIC_BLUEPRINT_CONFIG_REPO_SLUG  # collect-intel/dtef-configs
```

Optional: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SENTRY_DSN`, `GITHUB_CLIENT_ID/SECRET`, `SESSION_SECRET`

Run `pnpm validate:env` to check configuration.

## Coding Standards

- **TypeScript strict mode** — avoid `any`, prefer interfaces for objects, type aliases for unions
- **async/await** — not raw promises
- **Use the logger**: `getLogger('service-name')`
- **Preserve Weval infrastructure** — don't break core evaluation pipeline
- **Computational over LLM** — prefer deterministic metrics over LLM judges for scoring
- **Keep it simple** — don't add abstractions for one-time operations

## Naming Conventions

- **Services:** `camelCase.ts` (e.g., `demographicBlueprintService.ts`)
- **Types:** `camelCase.ts` (e.g., `dtef.ts`)
- **Components:** `PascalCase.tsx` (e.g., `DemographicLeaderboard.tsx`)
- **Tests:** `*.test.ts` in `__tests__/` directories
- **API routes:** `route.ts` in Next.js App Router directories

## Commit Style

- Concise commit messages, no signatures or co-authored-by lines
- Don't commit unless asked

## CI/CD

- **GitHub Actions** (`ci.yml`): typecheck → web tests → CLI tests → build (Node 20, pnpm)
- **Weekly eval cron** (`weekly-eval-check.yml`): periodic evaluation trigger for recovery
- **Railway**: auto-deploys from main on push

## Key Documentation

| Document | Purpose |
|----------|---------|
| `DTEF_OVERVIEW.md` | Project vision, goals, methodology |
| `DTEF_IMPROVEMENT_ROADMAP.md` | Prioritized remaining work |
| `DTEF_AGENT_ARCHITECTURE.md` | Conventions for AI coding agents |
| `docs/ARCHITECTURE.md` | Core platform architecture |
| `docs/BLUEPRINT_FORMAT.md` | Blueprint YAML schema (comprehensive) |
| `docs/PUBLIC_API.md` | External evaluation API |
| `docs/EXPERIMENT_PIPELINE.md` | Experiment workflow |
| `docs/METHODOLOGY.md` | Research methodology |
