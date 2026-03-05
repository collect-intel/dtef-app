# CLAUDE.md - Project Instructions for Claude Code

## Before Starting Work

1. **Read memory files** at `~/.claude/projects/-Users-evan-Documents-GitHub-dtef-dtef-app/memory/`:
   - `MEMORY.md` — project structure, gotchas, current state
   - `evaluation-pipeline.md` — deep technical reference for configIds, S3 results, scoring pipeline, debugging
2. **Read `docs/EXPERIMENT_PIPELINE.md`** if working on experiments
3. **Check `docs/DTEF_IMPROVEMENT_ROADMAP.md`** for prioritized remaining work

## After Completing Work — ALWAYS Update Memory

After any session where you learn something non-obvious about the project, **you MUST update memory files before finishing**. This includes:

- **Debugging insights**: If you spent time diagnosing an issue, document what the root cause was and how to find it faster next time
- **Pipeline behavior**: Any discovered behavior about how the eval pipeline, scheduler, scoring, or S3 storage actually works (vs. how you'd expect it to work)
- **Gotchas and footguns**: Anything that was surprising or caused wasted effort
- **Architecture decisions**: Why something was built a certain way, especially if it's non-obvious
- **Operational knowledge**: Commands, sequences, or workflows needed for common tasks

Update the appropriate file:
- `memory/MEMORY.md` — high-level project knowledge, gotchas, key file locations
- `memory/evaluation-pipeline.md` — deep technical details about eval pipeline, scoring, S3, scheduler
- `docs/EXPERIMENT_PIPELINE.md` — experiment workflow, CLI commands, findings
- `CLAUDE.md` (this file) — only for meta-instructions about how Claude should behave

The goal: future sessions should never waste time re-discovering something a previous session already learned.

## Key Gotchas

- **ConfigIds are path-derived, NOT from YAML**: The scheduler derives IDs from file paths (`dir/file.yml` → `dir__file`). The YAML `configId` field is ignored at runtime. Always check S3 with `aws s3 ls "s3://collect-intel-dtef/live/blueprints/" | grep "keyword"` to find actual configIds.
- **Hybrid score = coverage only**: `SIMILARITY_WEIGHT=0` in `src/app/utils/calculationUtils.ts`. The similarity matrix is computed but unused.
- **Don't push while evals are running**: Railway auto-deploys from main, restarting the container and wiping the in-memory eval queue.
- **Scores of 0 usually mean a parsing/pipeline issue**, not a bad model. Check the eval type and whether the point function can handle the response format before assuming results are correct.
- **Targeted re-evaluation**: Use `make rerun-evals-prefix PREFIX=<dir-prefix>` to re-run only configs matching a path prefix. Never use `rerun-evals-force` unless you truly need to re-evaluate all 2000+ configs.
- **Summaries must be rebuilt after evals**: Run `make streaming-summaries` after evaluations complete. The `experiment analyze` command reads summaries, not raw results (except for temperature experiments).

## Build & Test

```bash
pnpm build        # TypeScript + Next.js build
pnpm test         # Jest tests
pnpm test:infra   # Infrastructure validation (S3, API, etc.)
```

## Commit Style

- Concise commit messages, no signatures or co-authored-by lines
- Don't commit unless asked
