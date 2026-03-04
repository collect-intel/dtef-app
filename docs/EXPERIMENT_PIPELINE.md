# DTEF Experiment Pipeline Guide

**Last updated:** March 2026

This document is a comprehensive reference for running DTEF experiments end-to-end. It covers the full lifecycle from experiment creation through analysis and promotion.

---

## Overview

Experiments compare evaluation configurations (context formats, reasoning modes, eval types, temperatures) to measure their impact on accuracy. Each experiment is a structured JSON record stored in S3 at `live/experiments/{id}.json`.

Experimental configs are **invisible to the production leaderboard** — they're tagged with an `experimentId` and filtered out of production views. Only after promotion are they regenerated without the experiment tag.

---

## End-to-End Workflow

```
1. Create experiment record           → dtef experiment create
2. Generate blueprints per condition  → dtef generate (with --experiment-id/--condition-name)
3. Publish configs to dtef-configs    → dtef publish
4. Trigger evaluations                → make rerun-evals
5. Monitor progress                   → make queue-watch / make s3-watch
6. Analyze results                    → dtef experiment analyze
7. Conclude experiment                → dtef experiment conclude
8. Promote winning configs (if any)   → dtef experiment promote
```

---

## Step-by-Step Guide

### 1. Create an Experiment

```bash
pnpm cli dtef experiment create \
  --id "context-label-vs-narrative" \
  --title "Attribute-Label vs Narrative Context" \
  --hypothesis "Narrative context improves mean JSD similarity by >2% over attribute-label" \
  --success-criteria "Treatment outperforms control at p < 0.05" \
  --independent-variable "contextFormat"
```

Or via Makefile:
```bash
make dtef-experiment-create \
  ID=context-label-vs-narrative \
  TITLE="Attribute-Label vs Narrative Context" \
  HYPOTHESIS="Narrative context improves JSD by >2%"
```

### 2. Generate Blueprints per Condition

Generate configs for each condition, linking them to the experiment via `--experiment-id` and `--condition-name`:

```bash
# Control condition: attribute-label context
pnpm cli dtef generate \
  -i output/gd4.json \
  -o output/blueprints/exp-context-control \
  --context-format attribute-label \
  --experiment-id context-label-vs-narrative \
  --condition-name control

# Treatment condition: narrative context
pnpm cli dtef generate \
  -i output/gd4.json \
  -o output/blueprints/exp-context-treatment \
  --context-questions all \
  --context-format narrative \
  --experiment-id context-label-vs-narrative \
  --condition-name treatment
```

The `--experiment-id` and `--condition-name` flags:
- Tag each blueprint with `experiment:{id}` in its tags
- Auto-update the experiment record's `conditionMap` on S3 (mapping condition name → configIds)
- Auto-merge into the experiment's top-level `configIds`

You can also manually add configs to a condition:
```bash
pnpm cli dtef experiment add-configs \
  --id context-label-vs-narrative \
  --condition control \
  --configs "dtef-gd4-ageGroup:18-29,dtef-gd4-ageGroup:30-44"
```

### 3. Publish to dtef-configs

```bash
pnpm cli dtef publish \
  -s output/blueprints/exp-context-control \
  -t ../dtef-configs/blueprints/experiments/context-label-vs-narrative/control \
  --tag _periodic

pnpm cli dtef publish \
  -s output/blueprints/exp-context-treatment \
  -t ../dtef-configs/blueprints/experiments/context-label-vs-narrative/treatment \
  --tag _periodic
```

The `_periodic` tag ensures the scheduler picks up these configs for evaluation. Commit and push the dtef-configs repo.

### 4. Trigger Evaluations

```bash
make rerun-evals           # Normal scheduler (respects 1-week freshness)
make rerun-evals-force     # Force ALL periodic evals
make rerun-evals-batch BATCH=50  # Schedule a specific batch size
```

### 5. Monitor Progress

```bash
make queue-watch    # Live queue status (refreshes every 15s)
make s3-watch       # Watch S3 for new result files (every 30s)
make queue-status   # One-shot queue check
```

### 6. Analyze Results

```bash
pnpm cli dtef experiment analyze --id context-label-vs-narrative
# or
make dtef-experiment-analyze ID=context-label-vs-narrative
```

This command:
- Fetches the experiment record from S3
- For each condition, fetches config summaries and extracts `hybridScoreStats.average`
- Computes per-condition stats (mean, stddev, n)
- For 2-condition experiments: runs **Welch's t-test** + **Cohen's d** effect size
- Writes results back to the experiment record
- Rebuilds the experiments index

Use `--dry-run` to preview analysis without writing.

### 7. Conclude the Experiment

```bash
pnpm cli dtef experiment conclude \
  --id context-label-vs-narrative \
  --conclusion promoted \
  --summary "Narrative +2.5% (p=0.0001, d=0.36)" \
  --notes "Narrative context consistently improves predictions across all segment categories"
```

Valid conclusions: `promoted`, `rejected`, `needs-more-data`

### 8. Promote Winning Configs

```bash
pnpm cli dtef experiment promote --id context-label-vs-narrative
```

This command:
- Reads the experiment record (must have `conclusion: promoted`)
- Identifies the winning condition (highest mean score)
- Regenerates configs for that condition WITHOUT experiment tags
- Publishes them to the production blueprints directory

---

## How the Scheduler Discovers Configs

The evaluation scheduler (`/api/internal/fetch-and-schedule-evals`) works as follows:

1. Fetches the config repository index from GitHub (`collect-intel/dtef-configs`)
2. Walks all directories under `blueprints/`
3. For each `.yml` config file, checks for the `_periodic` tag
4. Configs with `_periodic` are eligible for scheduling
5. **Freshness check:** If a result exists within 7 days for a config (regardless of content hash), it's skipped
6. Eligible configs are queued for evaluation (up to MAX_CONCURRENT=5)

**Key implication:** Experiment configs published to dtef-configs with `_periodic` tag are automatically scheduled alongside production configs. No special handling needed.

---

## Experiment Naming Conventions

| Pattern | Example | Description |
|---|---|---|
| `{variable}-{conditionA}-vs-{conditionB}` | `context-label-vs-narrative` | Two-condition comparison |
| `{variable}-{conditionA}-vs-{conditionB}-multi` | `batch-size-1v2-multi` | Multi-round version |
| `{type}-{parameter}` | `individual-context-format` | Multi-condition parameter sweep |
| `{param}-{valueA}-vs-{valueB}` | `temp-0-vs-03` | Parameter ablation |
| `{type}-N-{values}` | `synthetic-N-20v50v100` | N parameter comparison |

---

## Completed Experiments

| Experiment | Status | Conclusion | Key Finding |
|---|---|---|---|
| `batch-size-1v2-multi` | completed | **promoted** | Batch=2 non-inferior (Δ=-0.009, p=0.16). Batch=2 uses fewer prompts, so promoted for efficiency. |
| `context-label-vs-narrative` | completed | **promoted** | Narrative context +2.5% over attribute-label (p=0.0001, d=0.36). Medium effect size. |
| `reasoning-std-vs-cot` | completed | **rejected** | CoT showed no improvement (Δ=+0.002, p=0.70). Adds token cost with no accuracy gain. |

## Active / Planned Experiments

| Experiment | Status | Conditions | Configs | Description |
|---|---|---|---|---|
| `individual-context-format` | planned | raw-survey, interview, first-person | 144 (GD4) | Tests 3 context formats for individual-answer eval type |
| `synthetic-N-20v50v100` | planned | N20, N50, N100 | 60 (GD4 non-country) | Tests synthetic-individual N parameter stability |
| `temp-0-vs-03` | planned | — | 49 (GD4, multi-temp) | Temperature ablation using `temperatures: [0.0, 0.3]` per config |
| `batch-size-1v2` | running | — | — | Superseded by `batch-size-1v2-multi` |

## Validated Findings So Far

1. **Batch size:** Batch=2 is non-inferior to batch=1 (saves ~50% API calls)
2. **Narrative context:** +2.5% improvement over attribute-label (medium effect)
3. **Chain-of-thought:** No benefit for group distribution prediction (saves token cost to skip)
4. **Baseline hierarchy:** uniform (0.647) < shuffled (0.761) < models (0.73 avg) < population marginal (0.833)
5. **No model beats population marginal** — the core challenge for demographic prediction

---

## CLI Command Reference

### Experiment Lifecycle

```bash
# Create
pnpm cli dtef experiment create --id <id> --title <title> --hypothesis <text> \
  [--success-criteria <text>] [--independent-variable <var>] [--status planned] [--dry-run]

# Status
pnpm cli dtef experiment status --id <id>

# Add configs to a condition
pnpm cli dtef experiment add-configs --id <id> --condition <name> --configs <id1,id2,...>

# Analyze (compute stats from eval results)
pnpm cli dtef experiment analyze --id <id> [--dry-run]

# Conclude
pnpm cli dtef experiment conclude --id <id> --conclusion <promoted|rejected|needs-more-data> \
  [--summary <text>] [--notes <text>]

# Promote winning configs to production
pnpm cli dtef experiment promote --id <id>

# Rebuild experiments index
pnpm cli dtef experiment rebuild-index
```

### Blueprint Generation (with experiment flags)

```bash
pnpm cli dtef generate -i <input.json> -o <output-dir> \
  --experiment-id <id> --condition-name <name> \
  [--eval-type distribution|shift|synthetic-individual|individual-answer] \
  [--context-format attribute-label|distribution-context|narrative|raw-survey|interview|first-person] \
  [--reasoning-mode standard|cot] \
  [--temperatures 0.0,0.3] \
  [--synthetic-n 20] \
  [--sample-size 20] \
  [--models CORE_CHEAP]
```

### Makefile Targets

```bash
make dtef-experiment-create ID=<id> TITLE="<title>" HYPOTHESIS="<text>"
make dtef-experiment-status ID=<id>
make dtef-experiment-analyze ID=<id>
make dtef-experiment-conclude ID=<id> CONCLUSION=promoted|rejected|needs-more-data
make dtef-experiment-add-configs ID=<id> CONDITION=<name> CONFIGS=<id1,id2>
make dtef-experiment-index
```

---

## Promotion: Current Limitations

- `dtef experiment conclude --conclusion promoted` sets a flag but does **not** automatically regenerate or republish configs
- `dtef experiment promote` (Task 6) handles the actual promotion workflow
- After promotion, you must still:
  1. Commit and push the dtef-configs repo
  2. Wait for the scheduler to pick up promoted configs
  3. Run `make streaming-summaries && make dtef-rebuild` after evals complete

---

## Tips for New Sessions

1. **Check existing experiments first:** `pnpm cli dtef experiment status --id <id>` or look at `live/experiments/` on S3
2. **Use CORE_CHEAP models** for all experiments (6 cheap models to limit cost)
3. **Don't push code while evals are running** — Railway auto-deploys, which restarts the container and wipes the in-memory queue
4. **One experiment at a time** — the queue is limited to MAX_CONCURRENT=5
5. **Configs need `_periodic` tag** to be picked up by the scheduler
6. **Verify conditionMap is populated** before running `analyze` — use `experiment status` to check
