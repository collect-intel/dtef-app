# DTEF Coding Agent Architecture & Guidelines

*Comprehensive guide for AI coding agents working on the Digital Twin Evaluation Framework*

**Last Updated:** 2026-02-10
**Status:** Phases 0-4 complete. See `DTEF_IMPROVEMENT_ROADMAP.md` for current priorities.

---

## Project Overview

### What is DTEF?

The **Digital Twin Evaluation Framework (DTEF)** is a platform for evaluating how accurately AI models can predict demographic-specific survey response distributions. It's built as a modified fork of the [weval](https://github.com/weval-org/app) evaluation platform.

**Live at:** [digitaltwinseval.org](https://digitaltwinseval.org)

### Key Differences from Weval

| Aspect | Weval | DTEF |
|--------|-------|------|
| **Blueprint Source** | User-created custom blueprints | Auto-generated from survey data |
| **Evaluation Focus** | Generic model capabilities | Demographic prediction accuracy |
| **Scoring** | LLM judge comparison | Computational distribution metrics (JS-divergence, cosine, earth-mover) |
| **Results Display** | Standard leaderboards | Demographic segment leaderboards |

### Core Workflow

```
Survey Data (CSV) → DTEF Format (JSON) → Blueprint Generation → Evaluation → Results → Aggregation → UI Display
```

### Repositories

- **`collect-intel/dtef-app`** — The evaluation platform (this repo)
- **`collect-intel/dtef-configs`** — Evaluation blueprints and survey data configurations

### Key Documents

1. **`DTEF_OVERVIEW.md`** — Project vision, goals, and methodology
2. **`DTEF_IMPROVEMENT_ROADMAP.md`** — Current priorities and what to work on next
3. **`docs/ARCHITECTURE.md`** — Core platform architecture (inherited from Weval)

---

## Architecture

### Deployment

- **Railway** — Production deployment (Vercel/Netlify both failed; see `docs/archive/` for details)
- **S3** — Results storage (`collect-intel-dtef` bucket, us-east-1)
- **GitHub Actions** — CI pipeline and weekly evaluation cron

### Key Infrastructure

| Component | Location | Notes |
|-----------|----------|-------|
| Core evaluation pipeline | `src/cli/services/comparison-pipeline-service.ts` | Inherited from Weval |
| Blueprint service | `src/lib/blueprint-service.ts` | Blueprint parsing |
| Storage service | `src/lib/storageService.ts` | S3 abstraction |
| Config constants | `src/lib/configConstants.ts` | Central config for repo slugs |
| Background functions | `src/app/api/internal/` | Migrated from Netlify serverless |
| Evaluation queue | `src/lib/evaluation-queue.ts` | In-memory, MAX_CONCURRENT=3 |

### DTEF-Specific Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Demographics blueprint service | `src/cli/services/demographicBlueprintService.ts` | Generate blueprints from survey data |
| Demographics aggregation | `src/cli/services/demographicAggregationService.ts` | Aggregate evaluation results |
| Global Dialogues adapter | `src/cli/services/adapters/globalDialoguesAdapter.ts` | Import GD CSV → DTEF format |
| Distribution metric | `src/point-functions/distribution_metric.ts` | JS-divergence, cosine, earth-mover scoring |
| DTEF types | `src/types/dtef.ts` | DTEFSurveyData, DTEFBlueprintConfig, etc. |
| Token counter | `src/cli/utils/tokenCounter.ts` | Token budget management |
| Survey validation | `src/lib/dtef-validation.ts` | DTEF survey data validation |
| DTEF CLI commands | `src/cli/commands/dtef-commands.ts` | generate, validate, preview, publish, import-gd |

### Deprecated/Removed Features

These have been removed from the codebase (Feb 2026):
- **Pairwise comparison system** — Removed entirely, `@netlify/blobs` dependency removed
- **Legacy survey module** — Per-participant prediction code deleted; replaced by demographic system
- **Sandbox feature** — UI removed
- **Workshops/Experiments** — Deprecated in UI via `DeprecatedFeature` component

---

## Code Organization

### Directory Structure

```
dtef-app/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/                # API routes
│   │   │   ├── demographics/   # DTEF demographics API
│   │   │   └── internal/       # Background function routes
│   │   ├── (standard)/         # Public pages
│   │   │   └── demographics/   # Demographics leaderboard page
│   │   └── components/
│   │       ├── home/           # Homepage components (DTEFLeaderboardDisplay)
│   │       └── demographics/   # Demographics page components
│   ├── cli/                    # CLI commands and services
│   │   ├── commands/           # CLI command handlers
│   │   ├── services/           # Business logic
│   │   │   ├── adapters/       # Data format adapters (Global Dialogues)
│   │   │   └── __tests__/      # Service tests
│   │   └── utils/              # CLI utilities (tokenCounter, dtefSummaryUtils)
│   ├── lib/                    # Shared libraries
│   │   ├── blueprint-service.ts    # Blueprint parsing
│   │   ├── storageService.ts       # S3 storage abstraction
│   │   └── configConstants.ts      # Central configuration
│   ├── point-functions/        # Custom evaluation functions
│   │   └── distribution_metric.ts  # DTEF distribution evaluator
│   ├── types/                  # TypeScript type definitions
│   │   ├── dtef.ts             # DTEF-specific types
│   │   └── shared.ts           # Core types (WevalConfig, WevalResult)
│   └── utils/                  # Shared utilities
├── docs/                       # Active documentation
│   ├── archive/                # Historical/deprecated docs
│   └── ...                     # See DTEF_DOCUMENTATION_INDEX.md
├── examples/blueprints/        # Example blueprint YAML files
├── data/global-dialogues/      # Git submodule → collect-intel/global-dialogues
├── scripts/                    # Utility scripts
└── .github/workflows/          # CI and cron workflows
```

### Naming Conventions

- **Services:** `camelCase.ts` (e.g., `demographicBlueprintService.ts`)
- **Types:** `camelCase.ts` (e.g., `dtef.ts`)
- **Components:** `PascalCase.tsx` (e.g., `DemographicLeaderboard.tsx`)
- **Tests:** `*.test.ts` in `__tests__/` directories
- **API routes:** `route.ts` in Next.js App Router directories

---

## Important Gotchas

- **WevalConfig/WevalResult types** — These are inherited from Weval and used in 40+ files. They stay as-is.
- **Next.js URL param decoding** — App Router does NOT fully decode dynamic route params. Colons in configIds stay as `%3A`. Use `decodeURIComponent()` or `decodeRouteParams()` from `src/app/utils/decodeParams.ts`.
- **Evaluation queue** — In-memory only. Items lost on restart. MAX_CONCURRENT=3 to prevent OOM. Weekly cron provides recovery.
- **TypeScript strict builds** — `ignoreBuildErrors: false` in `next.config.ts`. All code must type-check.

---

## Development Commands

```bash
# Development
pnpm dev                    # Start dev server
pnpm build                  # Production build
pnpm type-check             # TypeScript type checking (tsc --noEmit)

# Testing
pnpm test:web               # Web/component tests
pnpm test:cli               # CLI/service tests
pnpm test:infra             # Infrastructure validation (10 tests)

# CLI
pnpm cli dtef generate -i data.json     # Generate blueprints
pnpm cli dtef validate -i data.json     # Validate survey data
pnpm cli dtef preview -i data.json      # Preview results
pnpm cli dtef import-gd -r GD4          # Import Global Dialogues round
```

---

## Coding Standards

### TypeScript

- Use strict types. Avoid `any`.
- Prefer interfaces for objects, type aliases for unions.
- Use async/await, not raw promises.
- Use the logger utility: `getLogger('service-name')`.

### Architecture Principles

1. **Preserve Weval infrastructure** — Don't break core evaluation pipeline.
2. **Type safety first** — Define interfaces for all data structures.
3. **Computational over LLM** — Prefer deterministic metrics over LLM judges for scoring.
4. **Keep it simple** — Don't add abstractions for one-time operations.

---

**End of Agent Architecture Guide**
