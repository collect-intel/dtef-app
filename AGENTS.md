# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DTEF (Digital Twin Evaluation Framework) is a **Next.js 15** web app + CLI tool that measures how well AI models represent diverse human demographic perspectives. Single `package.json`, no monorepo, no Docker, no database.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Web dashboard | `pnpm dev` | 3000 | Next.js dev server |
| CLI tool | `pnpm cli <command>` | N/A | e.g. `pnpm cli dtef validate -i data.json` |

### Dev environment

- Storage defaults to local filesystem (`.results/`) when `STORAGE_PROVIDER=local` in `.env.local`. No S3/AWS needed for local dev.
- The `.env.local` file must exist. Copy from `.env.local.example` and set `STORAGE_PROVIDER=local` at minimum.
- External API keys (`OPENROUTER_API_KEY`, `GITHUB_TOKEN`) are only needed for running evaluations and fetching blueprints, not for the web dashboard.

### Lint / Test / Typecheck

- **Lint**: `pnpm lint` — requires `eslint`, `eslint-config-next`, and an `.eslintrc.json` with `{"extends": "next/core-web-vitals"}`. The repo does not ship these; they must be installed/created during setup. Use `eslint@9` and `eslint-config-next@15` for compatibility with Next.js 15.
- **Tests**: `pnpm test` (runs `pnpm test:web && pnpm test:cli`). There is 1 pre-existing test failure in `src/lib/experiments/lit/__tests__/core.test.ts`.
- **Typecheck**: `pnpm typecheck` — has 2 pre-existing TS errors in `src/cli/services/__tests__/demographicBlueprintService.test.ts`.

### Gotchas

- `next lint` is deprecated in Next.js 15.5+ and will prompt interactively if no ESLint config exists. Always ensure `.eslintrc.json` is present before running `pnpm lint`.
- The `pnpm.onlyBuiltDependencies` field in `package.json` controls which native modules are built. If you see build warnings for packages like `sharp` or `sqlite3`, they are expected and non-blocking.
- The `Makefile` contains convenience commands for DTEF workflows (see `make help`). Most require external API keys/S3.
