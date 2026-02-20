# DTEF Token Usage & Cost Analysis

**Date**: 2026-02-19
**Period Analyzed**: Last 3-7 days
**Observed Usage**: 463M input tokens + 10M output tokens (3-day window)
**Estimated Spend**: ~$1,500 Anthropic + ~$3,000 OpenRouter = ~$4,500/week

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Scale Problem: Raw Numbers](#the-scale-problem)
3. [Where Tokens Go: Three Cost Centers](#where-tokens-go)
4. [The Context Variant Multiplier](#the-context-variant-multiplier)
5. [Provider Routing & Markup](#provider-routing--markup)
6. [The Fundamental Strategic Issue](#the-fundamental-strategic-issue)
7. [Recommendations: Immediate Wins](#recommendations-immediate-wins)
8. [Recommendations: Architectural Changes](#recommendations-architectural-changes)
9. [Recommendations: Strategic Approach Changes](#recommendations-strategic-approach-changes)
10. [Projected Impact of Recommendations](#projected-impact)
11. [Appendix: Detailed Token Math](#appendix-detailed-token-math)

---

## Executive Summary

The high token consumption is driven by a **combinatorial explosion** across four dimensions that multiply together:

| Dimension | Current Scale | Multiplier |
|-----------|--------------|------------|
| Configs (segments x rounds x context variants) | 1,306 | base |
| Prompts per config (survey questions) | 4–116 (avg ~57) | x57 |
| Models per prompt | 13 (CORE group) | x13 |
| Context variants (baseline, c5, c10, ctx) | 4 per segment | already in config count |

**Total generation API calls for a full run: ~965,000**

The single biggest cost driver is the **full-context (`-ctx`) variant**, which inflates each prompt from ~120 tokens to ~8,800 tokens (73x) by including ALL other questions' response distributions. The ctx variants alone account for **60-70% of all generation tokens** despite being only 25% of configs.

A critical and perhaps surprising finding: **LLM judge evaluation costs zero tokens for DTEF configs**. All DTEF evaluation criteria use the programmatic `distribution_metric` function (Jensen-Shannon divergence), not LLM-based text evaluation. The judges exist in the codebase but are only invoked for text-based criteria points, which no current DTEF blueprint uses.

The cost breakdown is therefore:
- **~85-90%**: Generation phase (sending prompts to 13 models across 1,306 configs)
- **~10-15%**: Executive summary phase (one large Gemini Flash call per config)
- **~0%**: Judge evaluation (all programmatic for current DTEF configs)

---

## The Scale Problem

### Blueprint Configuration Scale

| GD Round | Prompts/Config | Segments | Configs (all variants) | Total Prompts |
|----------|---------------|----------|----------------------|---------------|
| GD1 | 4 | 47 | 141 | 564 |
| GD2 | 3 | 47 | 141 | 423 |
| GD3 | 43 | 47 | 188 | 8,084 |
| GD4 | 116 | 49 | 196 | 22,736 |
| GD5 | 46 | 49 | 196 | 9,016 |
| GD6 | 91 | 44 | 176 | 16,016 |
| GD6UK | 92 | 19 | 76 | 6,992 |
| GD7 | 54 | 48 | 192 | 10,368 |
| **TOTAL** | | **350 segments** | **1,306 configs** | **74,199 prompts** |

Each prompt is sent to **13 models** (CORE group), producing **964,587 generation API calls** for a full run.

### The 13 CORE Models

All routed through OpenRouter:

| Model | Relative Cost |
|-------|--------------|
| openai/gpt-4.1 | $$$ |
| anthropic/claude-sonnet-4.5 | $$$ |
| anthropic/claude-sonnet-4 | $$ |
| mistralai/mistral-medium-3 | $$ |
| meta-llama/llama-4-maverick | $$ |
| qwen/qwen3-next-80b-a3b-instruct | $$ |
| openai/gpt-4.1-mini | $ |
| anthropic/claude-haiku-4.5 | $ |
| google/gemini-2.5-flash | $ |
| openai/gpt-4o-mini | $ |
| openai/gpt-4.1-nano | ¢ |
| google/gemma-3-12b-it | ¢ |
| qwen/qwen3-30b-a3b-instruct-2507 | ¢ |

The top 3 most expensive models (gpt-4.1, claude-sonnet-4.5, claude-sonnet-4) likely account for **>60% of generation cost** despite being only 3 of 13 models.

---

## Where Tokens Go

### Phase 1: Generation (~85-90% of total cost)

For each of the 74,199 prompt-instances, each of 13 models receives:
- **System prompt**: ~111 tokens (fixed, identical across all)
- **User prompt**: 120–8,800 tokens (varies dramatically by context variant)
- **Model response**: ~20 tokens (just a percentage distribution array like `[35.2, 28.1, 22.4, 14.3]`)

The asymmetry is striking: we send hundreds to thousands of input tokens to get back ~20 output tokens. The information density of the output is extremely high relative to the input.

### Phase 2: Evaluation (~0% token cost)

All DTEF blueprint criteria use `fn: distribution_metric` with Jensen-Shannon divergence. This is evaluated **programmatically** — no LLM calls. The code explicitly separates function points from text points:

```typescript
const functionPoints = combinedNormalizedPoints.filter(p => p.isFunction);  // All DTEF points
const textPoints = combinedNormalizedPoints.filter(p => !p.isFunction);     // Empty for DTEF
```

Only `textPoints.length > 0` triggers LLM judge calls. Since DTEF configs have zero text points, the three judge models (qwen3-30b, gpt-oss-120b, gemini-2.5-flash) are never invoked.

**Important implication for future expansion**: When you add open-ended question evaluation or other text-based criteria, the judge phase will activate and could become the dominant cost center (3 judges x N criteria x M models x P prompts per config).

### Phase 3: Executive Summary (~10-15% of total cost)

One call per config to `gemini-2.5-flash` via OpenRouter:
- **Input**: Up to 500,000 characters (~125K tokens) of markdown evaluation report
- **Output**: Up to 30,000 tokens
- **Per config**: ~130K–160K tokens
- **Total across 1,306 configs**: ~170–210M tokens

This is expensive per-call but manageable in aggregate because it's only 1 call per config vs. 1,508 generation calls.

---

## The Context Variant Multiplier

This is the single most impactful design decision driving cost. Each demographic segment gets **four config variants**:

| Variant | Prompt Size | Relative Cost | Purpose |
|---------|------------|---------------|---------|
| **Baseline** | ~120 tokens | 1x | Raw prediction ability |
| **c5** (5 context Qs) | ~414 tokens | 3.5x | Moderate context |
| **c10** (10 context Qs) | ~775 tokens | 6.5x | More context |
| **ctx** (all context) | ~8,800 tokens | **73x** | Full context |

**Concrete example (GD4, 49 segments, 116 prompts each):**

| Variant | Input Tokens (generation only) | Cost Multiplier |
|---------|-------------------------------|-----------------|
| Baseline | 49 × 116 × 13 × 231 = **17.1M** | 1x |
| c5 | 49 × 116 × 13 × 525 = **38.8M** | 2.3x |
| c10 | 49 × 116 × 13 × 886 = **65.5M** | 3.8x |
| ctx | 49 × 116 × 13 × 8,942 = **661.2M** | **38.6x** |

GD4 alone: **782M input tokens** for generation. The ctx variant is 84% of that.

Across all rounds, the **ctx variants consume approximately 1.0–1.3 billion input tokens** out of a total ~1.5–2.0 billion.

---

## Provider Routing & Markup

### Current Routing

All 1,306 DTEF blueprints use the CORE model group, which routes **100% through OpenRouter** — including Anthropic models (claude-haiku-4.5, claude-sonnet-4, claude-sonnet-4.5).

OpenRouter charges a markup over native API pricing (typically 5-15% on top of provider rates). For the three Anthropic models in CORE, this means paying OpenRouter's markup on every call.

### Why Anthropic Console Shows Two Keys

- **5% direct Anthropic** (`digital-twins-eval` key): Used only by the `CLAUDES.json` model group (7 Claude-specific models), which is NOT used by production DTEF blueprints. This traffic likely comes from manual/test runs.
- **95% "openrouter fallback"**: All production DTEF traffic flows through OpenRouter. When OpenRouter calls Anthropic models on your behalf, it may be using a key that shows up on your Anthropic console, or this may represent OpenRouter's own metered usage.

### Cost Implication

For the Anthropic models in CORE (3 of 13 models ≈ ~23% of generation calls), you're paying OpenRouter's markup unnecessarily. At $3,000/week OpenRouter spend, routing Anthropic models direct could save $100-200/week.

---

## The Fundamental Strategic Issue

The current DTEF architecture treats every evaluation as a **fresh, independent, full-prompt API call**. This means:

1. **No prompt sharing**: The same system prompt (111 tokens) and the same context block (up to 8,800 tokens in ctx variants) is sent independently for every model. 13 models × identical prompt = 13x the input tokens for no additional information.

2. **No batching**: Each survey question is a separate API call. A config with 116 questions sends 116 separate requests per model, each with the full system prompt and context.

3. **No incremental evaluation**: Running a new model requires re-running all existing models too (unless cached). The freshness check is time-based (7 days), not change-based.

4. **Linear scaling with context**: Adding context questions scales the prompt linearly. The ctx variant includes ALL other questions' distributions, which for GD4 (116 questions) means each prompt contains 115 other distributions.

5. **4x variant multiplication without clear ROI analysis**: We run baseline, c5, c10, AND full-context for every segment. It's unclear whether the marginal insight from c10 vs c5, or ctx vs c10, justifies the 2x and 11x cost increases respectively.

**When you expand to more surveys (WVS, Pew, etc.) and more evaluation types, this multiplicative architecture will make costs scale as:**

```
Cost = Surveys × Segments × Questions × Models × Context_Variants × Eval_Types
```

Without architectural changes, expanding from 8 GD rounds to 20+ surveys with multiple eval types could easily 10-50x the current cost.

---

## Recommendations: Immediate Wins

### 1. Drop or Reduce ctx Variants (Save ~60-70% of generation cost)

**Impact: ~$2,000-3,000/week saved**

The full-context variant is 73x more expensive than baseline per prompt and accounts for the majority of token spend. Options:

- **Option A**: Drop ctx entirely, keep only baseline + c5 + c10 (saves ~60% of generation tokens)
- **Option B**: Drop ctx AND c10, keep only baseline + c5 (saves ~70%)
- **Option C**: Run ctx only for a representative subset of segments per round (e.g., 5 segments per round instead of all 47-49)

Before deciding, analyze whether ctx results are actually more accurate than c10. If c10 achieves 90%+ of ctx's accuracy, the marginal value of ctx is not worth the 11x cost premium.

### 2. Route Anthropic Models Direct (Save ~5-10% on Anthropic model costs)

**Impact: ~$100-200/week saved**

Change CORE.json to use `anthropic:` prefix instead of `openrouter:anthropic/` for:
- claude-haiku-4.5
- claude-sonnet-4
- claude-sonnet-4.5

This eliminates OpenRouter's markup on these models.

### 3. Skip Executive Summary for Variant Runs (Save ~75% of summary cost)

**Impact: ~$50-100/week saved**

Generate executive summaries only for the baseline variant of each segment. The ctx/c5/c10 variants exist for comparative analysis; their summaries are less valuable individually. Use `skipExecutiveSummary: true` for non-baseline variants.

This cuts executive summary calls from 1,306 to ~350 (one per unique segment).

### 4. Reduce CORE Model Count for Expensive Variants

**Impact: ~30-50% reduction in generation cost for those variants**

Run the full 13-model CORE group only for baseline. For c5/c10/ctx variants (which test context-following, not raw prediction), use a smaller "representative" set of 5-6 models spanning different capability tiers.

### 5. Set `max_tokens` on Generation Calls

Currently generation calls have **no maxTokens limit** (the model's default is used). Since DTEF responses should only be ~20 tokens (a percentage array), setting `max_tokens: 100` would:
- Prevent runaway responses from wasting output tokens
- Reduce cost from models that produce verbose explanations before/after the array
- This is a one-line change in the pipeline config

---

## Recommendations: Architectural Changes

### 6. Batch Multiple Questions Per API Call

**Impact: Could reduce generation calls by 10-50x**

Instead of sending 116 separate API calls for 116 questions (each with the same system prompt and context), batch multiple questions into a single prompt:

```
Given the following demographic group: Australia
For each question below, predict the percentage distribution.

Q1: "Should AI be regulated?" Options: a. Yes, b. No, c. Unsure
Q2: "Is privacy important?" Options: a. Very, b. Somewhat, c. Not at all
...
Q10: "..."

Respond in JSON format:
{"Q1": [50, 30, 20], "Q2": [60, 25, 15], ...}
```

Batching 10 questions per call would reduce generation API calls from 964,587 to ~96,459 (10x reduction). The tradeoff is slightly less precise per-question evaluation, but for distribution prediction this is likely acceptable.

### 7. Shared Prompt Prefix / Prompt Caching

Many API providers (Anthropic, OpenAI, Google) now support **prompt caching** — where a shared prefix across multiple calls is cached and billed at reduced rates (often 90% discount on cached tokens).

For DTEF, the system prompt + context block is identical across all 13 models for a given prompt. If the API supports prefix caching, ensure the system prompt and context are structured as a cacheable prefix.

**Anthropic's prompt caching**: With direct Anthropic API, you can mark system prompts with `cache_control` to get 90% discount on repeated prefixes. This alone could reduce effective input costs by 30-50% for context-heavy variants.

**OpenRouter**: Check whether OpenRouter passes through prompt caching headers to underlying providers. If not, this is another reason to route expensive models direct.

### 8. Differential/Incremental Evaluation

Instead of re-running all 1,306 configs every 7 days, implement incremental evaluation:

- **Hash-based freshness**: Only re-run configs whose content has changed (prompt text, model group, or criteria)
- **Model-level caching**: When adding a new model to CORE, only run that model against existing prompts — don't re-run all 13
- **Result merging**: Store results per-model and merge them, rather than requiring all models to run together in a single pipeline execution

This is the most impactful architectural change for the "expanding evaluation" use case. Adding model #14 should cost 1/13th of a full run, not a full re-run.

### 9. Two-Phase Evaluation Strategy

Run evaluations in two phases:

**Phase 1 — Cheap scout**: Run only the cheapest 3-4 models (gpt-4.1-nano, gemma-3-12b-it, qwen3-30b, gpt-4o-mini) on all configs. Cost: ~$200-400 for a full run.

**Phase 2 — Targeted expensive**: Run expensive models (claude-sonnet-4.5, gpt-4.1, etc.) only on configs/segments where cheap models show interesting variance or surprising results. This could reduce expensive model usage by 50-80%.

### 10. Response Format Enforcement with Structured Output

Several API providers support structured/JSON output modes that constrain the model to output valid JSON matching a schema. For DTEF distribution predictions, enforcing a schema like `{"distribution": [number, number, ...]}` would:

- Eliminate verbose preambles that waste output tokens
- Reduce parsing failures and retries
- Enable shorter `max_tokens` settings

---

## Recommendations: Strategic Approach Changes

### 11. Rethink the Context Variant Design

The current approach generates 4 separate configs per segment to test different context levels. Instead, consider:

**A single adaptive-context approach**: Include a small amount of context (like c5) by default, and only test full context on a statistical sample. The research question "does more context help?" can be answered with a 10% sample, not 100%.

**Context as a prompt engineering study, not production**: Run the ctx and c10 variants once as a research experiment to determine optimal context levels, then standardize on the winner for all future runs.

### 12. Tiered Model Strategy for Scale

As you expand to WVS, Pew, and other surveys, adopt a tiered approach:

| Tier | Models | When to Run | Coverage |
|------|--------|-------------|----------|
| **Tier 1 — Screen** | 3 cheapest models | All configs, all surveys | 100% |
| **Tier 2 — Benchmark** | 6 mid-range models | All configs, primary surveys | 60% |
| **Tier 3 — Frontier** | 4 expensive models | Selected configs, flagship comparisons | 20% |

This gives comprehensive coverage at tier 1 cost while reserving expensive models for high-value comparisons.

### 13. Move Distribution Prediction to a Specialized Approach

The current approach sends a natural language prompt to general-purpose LLMs and asks them to predict distributions. Consider:

- **Fine-tuning a small model**: A fine-tuned 7B model specifically for distribution prediction could replace many expensive model calls for baseline predictions, providing the "control" against which frontier models are compared
- **Few-shot prompt optimization**: Use prompt engineering experiments to find the minimum prompt that achieves target accuracy, then standardize. The current prompts may be longer than necessary.

### 14. Evaluation Type Expansion Plan

When expanding to open-ended questions and individual answers, the judge phase will activate and become the dominant cost. Plan for this now:

- **Use a single judge model** instead of 3 for routine evaluation. Reserve 3-judge consensus for high-stakes or disputed scores.
- **Batch judge evaluations**: Evaluate multiple criteria in a single judge call rather than one-criterion-per-call
- **Use function-based evaluation wherever possible**: For anything that can be measured programmatically (distribution accuracy, format compliance, response length), prefer function points over LLM judges

### 15. Build Cost Observability

The platform currently has **zero token/cost tracking or logging**. Add:

- Per-call token counting (input + output) logged to a time-series store
- Per-config cost aggregation
- Per-model cost breakdown
- Dashboard showing cost trends and alerting on anomalies
- Budget limits that pause evaluation when thresholds are exceeded

Without this, you're flying blind on cost optimization.

---

## Projected Impact

| Recommendation | Effort | Savings | Notes |
|---|---|---|---|
| 1. Drop/reduce ctx variants | Low (config change) | **50-70%** | Biggest single win |
| 2. Route Anthropic direct | Low (model group edit) | 5-10% of Anthropic spend | Quick win |
| 3. Skip summaries for variants | Low (flag change) | ~75% of summary cost | Quick win |
| 4. Fewer models for variants | Low (config change) | 30-50% of variant cost | Quick win |
| 5. Set max_tokens on generation | Low (one-line change) | 5-20% of output cost | Quick win |
| 6. Batch questions per call | Medium (code change) | **50-90%** of generation calls | Highest ROI code change |
| 7. Prompt caching | Medium (provider-specific) | 30-50% of input cost | Requires direct API routing |
| 8. Incremental evaluation | High (architecture) | Proportional to change rate | Essential for scale |
| 9. Two-phase evaluation | Medium (orchestration) | 50-80% of expensive model cost | Great for new surveys |
| 10. Structured output | Low (API parameter) | 5-10% of output cost | Easy win |

**Combined immediate wins (1-5)**: Could reduce current spend from ~$4,500/week to ~$1,000-1,500/week.

**Combined with architectural changes (6-10)**: Could reduce to ~$300-500/week at current scale, and keep costs manageable as you 10x the number of evaluations.

---

## Appendix: Detailed Token Math

### Full Run Token Estimate (All 1,306 Configs)

**Generation Phase** (per variant type, assuming GD4 sizes as reference):

| Component | Baseline (25%) | c5 (25%) | c10 (25%) | ctx (25%) |
|-----------|---------------|----------|-----------|-----------|
| Input/call | 231 tokens | 525 tokens | 886 tokens | 8,942 tokens |
| Output/call | ~20 tokens | ~20 tokens | ~20 tokens | ~20 tokens |
| Calls (all configs) | ~241K | ~241K | ~241K | ~241K |
| Input total | ~56M | ~127M | ~214M | **~2,155M** |
| Output total | ~4.8M | ~4.8M | ~4.8M | ~4.8M |

**Generation totals**: ~2.55B input tokens + ~19M output tokens

**Executive Summary Phase**:
- 1,306 configs × ~130K input + ~15K output = ~170M input + ~20M output

**Grand Total**: ~2.7B input + ~39M output ≈ **2.74 billion tokens**

### Cost Per Model (Rough OpenRouter Pricing)

| Model | Input $/M | Output $/M | Est. % of gen spend |
|-------|-----------|------------|-------------------|
| gpt-4.1 | $2.00 | $8.00 | ~25% |
| claude-sonnet-4.5 | $3.00 | $15.00 | ~20% |
| claude-sonnet-4 | $3.00 | $15.00 | ~15% |
| mistral-medium-3 | $0.40 | $2.00 | ~5% |
| llama-4-maverick | $0.20 | $0.60 | ~3% |
| qwen3-next-80b | $0.20 | $0.60 | ~3% |
| gpt-4.1-mini | $0.40 | $1.60 | ~5% |
| claude-haiku-4.5 | $0.80 | $4.00 | ~8% |
| gemini-2.5-flash | $0.15 | $0.60 | ~2% |
| gpt-4o-mini | $0.15 | $0.60 | ~2% |
| gpt-4.1-nano | $0.10 | $0.40 | ~1% |
| gemma-3-12b-it | $0.07 | $0.14 | <1% |
| qwen3-30b | $0.10 | $0.30 | ~1% |

**The top 3 models (gpt-4.1, claude-sonnet-4.5, claude-sonnet-4) account for ~60% of generation spend while providing 23% of the data points.**

### Cache Effectiveness

The platform uses SQLite-based caching. At temperature 0.3, cache hits occur only on exact re-runs of the same config. Cache is effective for:
- Re-running a config after pipeline crash (resumes from cached responses)
- Re-running with a different model group (cached models aren't re-called)
- Re-running evaluation phase with different criteria (generation responses cached)

Cache is NOT effective across:
- Different segments (different prompts)
- Different context variants (different prompt text)
- Prompt text changes (any edit invalidates cache)

---

## Key Takeaway

The platform's cost is high because it exhaustively evaluates a **large combinatorial space** (1,306 configs × 13 models × 4 context levels) where the most expensive axis (full-context prompts × frontier models) dominates the bill. The most impactful changes are:

1. **Reduce the combinatorial explosion** (fewer context variants, tiered models)
2. **Increase information density per API call** (batch questions, structured output)
3. **Build incrementally** (don't re-run everything, add models individually)
4. **Route expensive models direct** (avoid OpenRouter markup on Anthropic/OpenAI)

These changes would reduce current costs by 70-90% while enabling 10x more evaluations.
