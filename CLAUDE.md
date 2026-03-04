# CLAUDE.md - Project Instructions for Claude Code

## Before Starting Work

1. **Read memory files** at `~/.claude/projects/-Users-evan-Documents-GitHub-dtef-dtef-app/memory/`:
   - `MEMORY.md` — project structure, gotchas, current state
   - `evaluation-pipeline.md` — deep technical reference for configIds, S3 results, scoring pipeline, debugging
2. **Read `docs/EXPERIMENT_PIPELINE.md`** if working on experiments
3. **Check `docs/DTEF_IMPROVEMENT_ROADMAP.md`** for prioritized remaining work

## Key Gotchas

- **ConfigIds are path-derived, NOT from YAML**: The scheduler derives IDs from file paths (`dir/file.yml` → `dir__file`). The YAML `configId` field is ignored at runtime. Always check S3 with `aws s3 ls "s3://collect-intel-dtef/live/blueprints/" | grep "keyword"` to find actual configIds.
- **Hybrid score = coverage only**: `SIMILARITY_WEIGHT=0` in `src/app/utils/calculationUtils.ts`. The similarity matrix is computed but unused.
- **Don't push while evals are running**: Railway auto-deploys from main, restarting the container and wiping the in-memory eval queue.

## Build & Test

```bash
pnpm build        # TypeScript + Next.js build
pnpm test         # Jest tests (487 tests)
pnpm test:infra   # Infrastructure validation (S3, API, etc.)
```

## Commit Style

- Concise commit messages, no signatures or co-authored-by lines
- Don't commit unless asked
