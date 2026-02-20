# DTEF Statistical Validity Report

*Generated: 2026-02-20T13:03:35.296Z*

**Data:** 6 surveys, 1000 evaluation results

## Executive Summary

### Key Findings

- **Models vs. Uniform baseline:** Average model score (0.731) vs uniform (0.647), effect size = **+0.084**
- **Models vs. Population Marginal:** Effect size = **-0.102** (models do not yet exceed just knowing the overall population distribution)
- **Models vs. Shuffled Null:** Shuffled mean = 0.761 [0.760, 0.762], best model = 0.768
- **Noise floor:** 54.5% of segment-question pairs have noise floor > 0.7
- **Pairwise significance:** 238/273 model pairs significantly different (α = 0.05, Holm-Bonferroni corrected)
- **Model tiers:** 2 statistically distinguishable tier(s)

## Analysis 1: Null Model Baselines

Comparison of actual model scores against naive predictors that use no model intelligence.

| Baseline | Mean Score | 95% CI | (Segment, Question) Pairs |
|----------|-----------|--------|---------------------------|
| Uniform | 0.647 | — | 14,292 |
| Population Marginal | 0.833 | — | 14,292 |
| Shuffled (Permutation Null) | 0.761 | [0.760, 0.762] | 1,000 |

### Model Scores vs. Baselines

| Model | Overall Score | vs. Uniform | vs. Marginal | vs. Shuffled |
|-------|-------------|-------------|--------------|--------------|
| anthropic/claude-sonnet-4.5[temp:0.3] | 0.768 | +0.120 | -0.066 | +0.007 |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | 0.765 | +0.118 | -0.068 | +0.004 |
| anthropic/claude-sonnet-4[temp:0.3] | 0.763 | +0.115 | -0.071 | +0.002 |
| openai/gpt-5.1[temp:0.3] | 0.761 | +0.113 | -0.073 | -0.000 |
| anthropic/claude-haiku-4.5[temp:0.3] | 0.756 | +0.108 | -0.078 | -0.006 |
| openai/gpt-4.1[temp:0.3] | 0.755 | +0.108 | -0.078 | -0.006 |
| openai/gpt-4o[temp:0.3] | 0.749 | +0.102 | -0.084 | -0.012 |
| openai/gpt-5[temp:0.3] | 0.749 | +0.101 | -0.085 | -0.013 |
| openai/gpt-4.1-mini[temp:0.3] | 0.745 | +0.098 | -0.088 | -0.016 |
| mistralai/mistral-medium-3[temp:0.3] | 0.744 | +0.097 | -0.089 | -0.017 |
| meta-llama/llama-4-maverick[temp:0.3] | 0.743 | +0.096 | -0.090 | -0.018 |
| mistralai/mistral-large-2411[temp:0.3] | 0.738 | +0.091 | -0.095 | -0.023 |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | 0.735 | +0.087 | -0.099 | -0.027 |
| openai/gpt-5-mini[temp:0.3] | 0.732 | +0.085 | -0.101 | -0.029 |
| google/gemini-2.5-flash[temp:0.3] | 0.732 | +0.084 | -0.102 | -0.029 |
| openai/gpt-4o-mini[temp:0.3] | 0.724 | +0.077 | -0.109 | -0.037 |
| x-ai/grok-4.1-fast[temp:0.3] | 0.724 | +0.076 | -0.110 | -0.037 |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | 0.722 | +0.074 | -0.112 | -0.040 |
| openai/gpt-oss-120b[temp:0.3] | 0.712 | +0.065 | -0.121 | -0.049 |
| qwen/qwen3-32b[temp:0.3] | 0.705 | +0.058 | -0.129 | -0.056 |
| google/gemma-3-12b-it[temp:0.3] | 0.701 | +0.054 | -0.132 | -0.060 |
| openai/gpt-4.1-nano[temp:0.3] | 0.699 | +0.052 | -0.134 | -0.062 |
| openai/gpt-oss-20b[temp:0.3] | 0.693 | +0.046 | -0.141 | -0.068 |
| x-ai/grok-4[temp:0.3] | 0.638 | -0.010 | -0.196 | -0.123 |

## Analysis 2: Analytical Noise Floor

Expected JSD similarity from sampling noise alone: `1 - sqrt((k-1) / (2n × ln2))`

Threshold for flagging: 0.7

### By Segment Category

| Category | Pairs | Avg Sample Size | Avg Noise Floor | % Above Threshold |
|----------|-------|----------------|----------------|-------------------|
| environment | 909 | 350 | 0.888 | 100.0% |
| aiConcern | 636 | 350 | 0.899 | 100.0% |
| gender | 610 | 516 | 0.928 | 99.3% |
| ageGroup | 1561 | 203 | 0.850 | 94.7% |
| religion | 2121 | 149 | 0.781 | 73.6% |
| country | 8455 | 33 | 0.640 | 30.7% |

### Threshold Sweep

| Noise Floor Threshold | % of Pairs Above |
|----------------------|------------------|
| 0.50 | 93.0% |
| 0.60 | 70.2% |
| 0.70 | 54.5% |
| 0.80 | 39.8% |
| 0.90 | 19.0% |
| 0.95 | 0.9% |

### Noise Floor Distribution

| Range | Count | % |
|-------|-------|---|
| [0.0, 0.5) | 997 | 7.0% |
| [0.5, 0.6) | 3257 | 22.8% |
| [0.6, 0.7) | 2249 | 15.7% |
| [0.7, 0.8) | 2102 | 14.7% |
| [0.8, 0.9) | 2978 | 20.8% |
| [0.9, 1.0) | 2709 | 19.0% |

### Minimum Sample Size Recommendations

For noise floor below 0.90 (where model differentiation is feasible):

| Options (k) | Min n for noise < 0.90 | Min n for noise < 0.80 | Min n for noise < 0.70 |
|-------------|----------------------|----------------------|----------------------|
| 3 | 145 | 37 | 17 |
| 4 | 217 | 55 | 25 |
| 5 | 289 | 73 | 33 |
| 6 | 361 | 91 | 41 |
| 7 | 433 | 109 | 49 |

## Analysis 3: Pairwise Model Significance

Permutation test (10,000 iterations) with Holm-Bonferroni correction at α = 0.05.

### Significant Differences

| Model A | Model B | Mean Diff | Raw p | Adjusted p | Shared Qs | Sig? |
|---------|---------|-----------|-------|------------|-----------|------|
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | anthropic/claude-haiku-4.5[temp:0.3] | +0.0122 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | anthropic/claude-sonnet-4[temp:0.3] | +0.0061 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | google/gemini-2.5-flash[temp:0.3] | +0.0365 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | google/gemma-3-12b-it[temp:0.3] | +0.0637 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | meta-llama/llama-4-maverick[temp:0.3] | +0.0251 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | +0.0268 | 0.0000 | 0.0000 | 9129 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | +0.0248 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | +0.0215 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0702 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-4.1[temp:0.3] | +0.0135 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0440 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-4o[temp:0.3] | +0.0167 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0296 | 0.0000 | 0.0000 | 7015 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-5.1[temp:0.3] | +0.0035 | 0.0000 | 0.0000 | 9219 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0142 | 0.0000 | 0.0000 | 5675 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0543 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0708 | 0.0000 | 0.0000 | 9220 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0484 | 0.0000 | 0.0000 | 9222 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0596 | 0.0000 | 0.0000 | 5533 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0351 | 0.0000 | 0.0000 | 8940 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0438 | 0.0000 | 0.0000 | 9179 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | anthropic/claude-sonnet-4.5[temp:0.3] | -0.0124 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | anthropic/claude-sonnet-4[temp:0.3] | -0.0074 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | google/gemini-2.5-flash[temp:0.3] | +0.0239 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | google/gemma-3-12b-it[temp:0.3] | +0.0550 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | meta-llama/llama-4-maverick[temp:0.3] | +0.0122 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | +0.0147 | 0.0000 | 0.0000 | 9130 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | +0.0114 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | +0.0106 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0561 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0313 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-4o[temp:0.3] | +0.0045 | 0.0000 | 0.0000 | 9223 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0165 | 0.0000 | 0.0000 | 7016 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0088 | 0.0000 | 0.0000 | 9220 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0421 | 0.0000 | 0.0000 | 9223 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0586 | 0.0000 | 0.0000 | 9221 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0339 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0482 | 0.0000 | 0.0000 | 5533 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0200 | 0.0000 | 0.0000 | 14053 | **Yes** |
| anthropic/claude-haiku-4.5[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0316 | 0.0000 | 0.0000 | 9180 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | anthropic/claude-sonnet-4[temp:0.3] | +0.0050 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | google/gemini-2.5-flash[temp:0.3] | +0.0363 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | google/gemma-3-12b-it[temp:0.3] | +0.0674 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | meta-llama/llama-4-maverick[temp:0.3] | +0.0246 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | +0.0250 | 0.0000 | 0.0000 | 9130 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | +0.0238 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | +0.0230 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0685 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-4.1[temp:0.3] | +0.0126 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0437 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-4o[temp:0.3] | +0.0149 | 0.0000 | 0.0000 | 9223 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0281 | 0.0000 | 0.0000 | 7016 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0125 | 0.0000 | 0.0000 | 5675 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0525 | 0.0000 | 0.0000 | 9223 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0690 | 0.0000 | 0.0000 | 9221 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0463 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0578 | 0.0000 | 0.0000 | 5533 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0326 | 0.0000 | 0.0000 | 14053 | **Yes** |
| anthropic/claude-sonnet-4.5[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0420 | 0.0000 | 0.0000 | 9180 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | google/gemini-2.5-flash[temp:0.3] | +0.0313 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | google/gemma-3-12b-it[temp:0.3] | +0.0624 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | meta-llama/llama-4-maverick[temp:0.3] | +0.0196 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | +0.0209 | 0.0000 | 0.0000 | 9130 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | +0.0187 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | +0.0180 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0635 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-4.1[temp:0.3] | +0.0075 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0387 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-4o[temp:0.3] | +0.0107 | 0.0000 | 0.0000 | 9223 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0241 | 0.0000 | 0.0000 | 7016 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0095 | 0.0000 | 0.0000 | 5675 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0483 | 0.0000 | 0.0000 | 9223 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0648 | 0.0000 | 0.0000 | 9221 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0412 | 0.0000 | 0.0000 | 14335 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0547 | 0.0000 | 0.0000 | 5533 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0275 | 0.0000 | 0.0000 | 14053 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0377 | 0.0000 | 0.0000 | 9180 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | google/gemma-3-12b-it[temp:0.3] | +0.0310 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | meta-llama/llama-4-maverick[temp:0.3] | -0.0117 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | -0.0098 | 0.0000 | 0.0000 | 9130 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | -0.0126 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0133 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0322 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0238 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0074 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0198 | 0.0000 | 0.0000 | 9223 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-5-mini[temp:0.3] | -0.0091 | 0.0000 | 0.0000 | 7016 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0332 | 0.0000 | 0.0000 | 9220 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0217 | 0.0000 | 0.0000 | 5675 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0178 | 0.0000 | 0.0000 | 9223 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0343 | 0.0000 | 0.0000 | 9221 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0099 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0239 | 0.0000 | 0.0000 | 5533 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0075 | 0.0000 | 0.0000 | 9180 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | meta-llama/llama-4-maverick[temp:0.3] | -0.0428 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | -0.0368 | 0.0000 | 0.0000 | 9130 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | -0.0436 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0444 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0548 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | -0.0237 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0469 | 0.0000 | 0.0000 | 9223 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-5-mini[temp:0.3] | -0.0325 | 0.0000 | 0.0000 | 7016 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0602 | 0.0000 | 0.0000 | 9220 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0485 | 0.0000 | 0.0000 | 5675 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | -0.0093 | 0.0000 | 0.0000 | 9223 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0071 | 0.0000 | 0.0000 | 9221 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | -0.0211 | 0.0000 | 0.0000 | 14335 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0349 | 0.0000 | 0.0000 | 14053 | **Yes** |
| google/gemma-3-12b-it[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0198 | 0.0000 | 0.0000 | 9180 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0439 | 0.0000 | 0.0000 | 14335 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0121 | 0.0000 | 0.0000 | 14335 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0191 | 0.0000 | 0.0000 | 14335 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0084 | 0.0000 | 0.0000 | 9223 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0217 | 0.0000 | 0.0000 | 9220 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0090 | 0.0000 | 0.0000 | 5675 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0292 | 0.0000 | 0.0000 | 9223 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0457 | 0.0000 | 0.0000 | 9221 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0216 | 0.0000 | 0.0000 | 14335 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0364 | 0.0000 | 0.0000 | 5533 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0079 | 0.0000 | 0.0000 | 14053 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0187 | 0.0000 | 0.0000 | 9180 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0053 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0435 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0134 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0172 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0101 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0234 | 0.0000 | 0.0000 | 9128 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0131 | 0.0000 | 0.0000 | 5675 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0273 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0442 | 0.0000 | 0.0000 | 9128 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0217 | 0.0000 | 0.0000 | 9130 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0323 | 0.0000 | 0.0000 | 5533 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0084 | 0.0000 | 0.0000 | 8848 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0171 | 0.0000 | 0.0000 | 9087 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0447 | 0.0000 | 0.0000 | 14335 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0112 | 0.0000 | 0.0000 | 14335 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0199 | 0.0000 | 0.0000 | 14335 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0080 | 0.0000 | 0.0000 | 9223 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0054 | 0.0000 | 0.0000 | 7016 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0214 | 0.0000 | 0.0000 | 9220 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0106 | 0.0000 | 0.0000 | 5675 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0295 | 0.0000 | 0.0000 | 9223 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0460 | 0.0000 | 0.0000 | 9221 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0225 | 0.0000 | 0.0000 | 14335 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0347 | 0.0000 | 0.0000 | 5533 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0089 | 0.0000 | 0.0000 | 14053 | **Yes** |
| mistralai/mistral-medium-3[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0191 | 0.0000 | 0.0000 | 9180 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0455 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0105 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0207 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0047 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0082 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0181 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0087 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0328 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0493 | 0.0000 | 0.0000 | 9221 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0233 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0368 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0095 | 0.0000 | 0.0000 | 14053 | **Yes** |
| openai/gpt-4.1-mini[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0224 | 0.0000 | 0.0000 | 9180 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-4.1[temp:0.3] | -0.0560 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | -0.0248 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0534 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-5-mini[temp:0.3] | -0.0418 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0667 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0570 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | -0.0158 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | -0.0222 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | qwen/qwen3-32b[temp:0.3] | -0.0115 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0363 | 0.0000 | 0.0000 | 14053 | **Yes** |
| openai/gpt-4.1-nano[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0263 | 0.0000 | 0.0000 | 9180 | **Yes** |
| openai/gpt-4.1[temp:0.3] | openai/gpt-4o-mini[temp:0.3] | +0.0312 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1[temp:0.3] | openai/gpt-4o[temp:0.3] | +0.0033 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4.1[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0172 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-4.1[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0100 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-4.1[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0408 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4.1[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0573 | 0.0000 | 0.0000 | 9221 | **Yes** |
| openai/gpt-4.1[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0337 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4.1[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0463 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-4.1[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0200 | 0.0000 | 0.0000 | 14053 | **Yes** |
| openai/gpt-4.1[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0303 | 0.0000 | 0.0000 | 9180 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | openai/gpt-4o[temp:0.3] | -0.0273 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | openai/gpt-5-mini[temp:0.3] | -0.0140 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0406 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0326 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0103 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0268 | 0.0000 | 0.0000 | 9221 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0026 | 0.0000 | 0.0000 | 14335 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0129 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-4o-mini[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0113 | 0.0000 | 0.0000 | 14053 | **Yes** |
| openai/gpt-4o[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0157 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-4o[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0133 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-4o[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0376 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4o[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0541 | 0.0000 | 0.0000 | 9221 | **Yes** |
| openai/gpt-4o[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0316 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-4o[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0407 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-4o[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0186 | 0.0000 | 0.0000 | 8941 | **Yes** |
| openai/gpt-4o[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0271 | 0.0000 | 0.0000 | 9180 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0284 | 0.0000 | 0.0000 | 7013 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0244 | 0.0000 | 0.0000 | 3470 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0237 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0388 | 0.0000 | 0.0000 | 7014 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0201 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0235 | 0.0000 | 0.0000 | 3328 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0096 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-5-mini[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0119 | 0.0000 | 0.0000 | 7016 | **Yes** |
| openai/gpt-5.1[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0080 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-5.1[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0509 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-5.1[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0674 | 0.0000 | 0.0000 | 9218 | **Yes** |
| openai/gpt-5.1[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0449 | 0.0000 | 0.0000 | 9220 | **Yes** |
| openai/gpt-5.1[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0532 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-5.1[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0318 | 0.0000 | 0.0000 | 8938 | **Yes** |
| openai/gpt-5.1[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0405 | 0.0000 | 0.0000 | 9177 | **Yes** |
| openai/gpt-5[temp:0.3] | openai/gpt-oss-120b[temp:0.3] | +0.0397 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-5[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0607 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-5[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.0349 | 0.0000 | 0.0000 | 5675 | **Yes** |
| openai/gpt-5[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0451 | 0.0000 | 0.0000 | 5524 | **Yes** |
| openai/gpt-5[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | +0.0205 | 0.0000 | 0.0000 | 5393 | **Yes** |
| openai/gpt-5[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0280 | 0.0000 | 0.0000 | 5632 | **Yes** |
| openai/gpt-oss-120b[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0165 | 0.0000 | 0.0000 | 9221 | **Yes** |
| openai/gpt-oss-120b[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | -0.0059 | 0.0000 | 0.0000 | 9223 | **Yes** |
| openai/gpt-oss-120b[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0058 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-oss-120b[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0195 | 0.0000 | 0.0000 | 8941 | **Yes** |
| openai/gpt-oss-120b[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0105 | 0.0000 | 0.0000 | 9180 | **Yes** |
| openai/gpt-oss-20b[temp:0.3] | qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | -0.0224 | 0.0000 | 0.0000 | 9221 | **Yes** |
| openai/gpt-oss-20b[temp:0.3] | qwen/qwen3-32b[temp:0.3] | -0.0151 | 0.0000 | 0.0000 | 5533 | **Yes** |
| openai/gpt-oss-20b[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0359 | 0.0000 | 0.0000 | 8939 | **Yes** |
| openai/gpt-oss-20b[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0270 | 0.0000 | 0.0000 | 9178 | **Yes** |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | qwen/qwen3-32b[temp:0.3] | +0.0105 | 0.0000 | 0.0000 | 5533 | **Yes** |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0139 | 0.0000 | 0.0000 | 14053 | **Yes** |
| qwen/qwen3-32b[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0261 | 0.0000 | 0.0000 | 5251 | **Yes** |
| qwen/qwen3-32b[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0173 | 0.0000 | 0.0000 | 5490 | **Yes** |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0088 | 0.0000 | 0.0000 | 8941 | **Yes** |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0045 | 0.0002 | 0.0078 | 9180 | **Yes** |
| google/gemini-2.5-flash[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0039 | 0.0002 | 0.0080 | 14053 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0039 | 0.0003 | 0.0111 | 7016 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0026 | 0.0003 | 0.0114 | 9220 | **Yes** |
| openai/gpt-4o[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0044 | 0.0005 | 0.0180 | 5675 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0034 | 0.0021 | 0.0714 | 6925 | No |
| mistralai/mistral-large-2411[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | -0.0021 | 0.0021 | 0.0735 | 9130 | No |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | anthropic/claude-sonnet-4.5[temp:0.3] | +0.0018 | 0.0027 | 0.0891 | 9222 | No |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0016 | 0.0065 | 0.2080 | 14335 | No |
| meta-llama/llama-4-maverick[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | +0.0018 | 0.0091 | 0.2821 | 9130 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-5.1[temp:0.3] | +0.0016 | 0.0152 | 0.4560 | 9220 | No |
| openai/gpt-4o-mini[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0001 | 0.9032 | 0.9032 | 9180 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0026 | 0.0381 | 1.0000 | 5675 | No |
| anthropic/claude-sonnet-4[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0401 | 0.0544 | 1.0000 | 43 | No |
| google/gemma-3-12b-it[temp:0.3] | qwen/qwen3-32b[temp:0.3] | -0.0031 | 0.0637 | 1.0000 | 5533 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0377 | 0.0780 | 1.0000 | 43 | No |
| meta-llama/llama-4-maverick[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | -0.0008 | 0.0857 | 1.0000 | 14335 | No |
| google/gemini-2.5-flash[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0388 | 0.0890 | 1.0000 | 43 | No |
| openai/gpt-4.1[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0316 | 0.1125 | 1.0000 | 43 | No |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0337 | 0.1223 | 1.0000 | 43 | No |
| openai/gpt-oss-20b[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0326 | 0.1268 | 1.0000 | 43 | No |
| openai/gpt-4.1-nano[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0363 | 0.1629 | 1.0000 | 43 | No |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0008 | 0.1886 | 1.0000 | 14335 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0247 | 0.1993 | 1.0000 | 43 | No |
| openai/gpt-5[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0249 | 0.2021 | 1.0000 | 43 | No |
| openai/gpt-5.1[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0249 | 0.2124 | 1.0000 | 43 | No |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0011 | 0.2163 | 1.0000 | 14335 | No |
| openai/gpt-oss-120b[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0223 | 0.2474 | 1.0000 | 43 | No |
| google/gemma-3-12b-it[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0259 | 0.3539 | 1.0000 | 43 | No |
| openai/gpt-4.1[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0010 | 0.3571 | 1.0000 | 5675 | No |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0172 | 0.4698 | 1.0000 | 43 | No |
| openai/gpt-4o-mini[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0190 | 0.5040 | 1.0000 | 43 | No |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0007 | 0.5211 | 1.0000 | 9221 | No |
| qwen/qwen3-32b[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0133 | 0.5535 | 1.0000 | 43 | No |
| mistralai/mistral-medium-3[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0108 | 0.6113 | 1.0000 | 43 | No |
| openai/gpt-4o[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0119 | 0.6230 | 1.0000 | 43 | No |
| meta-llama/llama-4-maverick[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0083 | 0.7062 | 1.0000 | 43 | No |
| openai/gpt-4.1-mini[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0072 | 0.7545 | 1.0000 | 43 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-4.1[temp:0.3] | +0.0001 | 0.8356 | 1.0000 | 14335 | No |
| mistralai/mistral-large-2411[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0037 | 0.8753 | 1.0000 | 43 | No |

### Model Tiers

Models within the same tier are not statistically distinguishable at the given significance level.

**Tier 1** (avg: 0.731):
  - anthropic/claude-sonnet-4.5[temp:0.3] (0.768)
  - anthropic:claude-3-7-sonnet-20250219[temp:0.3] (0.765)
  - anthropic/claude-sonnet-4[temp:0.3] (0.763)
  - openai/gpt-5.1[temp:0.3] (0.761)
  - anthropic/claude-haiku-4.5[temp:0.3] (0.756)
  - openai/gpt-4.1[temp:0.3] (0.755)
  - openai/gpt-4o[temp:0.3] (0.749)
  - openai/gpt-5[temp:0.3] (0.749)
  - openai/gpt-4.1-mini[temp:0.3] (0.745)
  - mistralai/mistral-medium-3[temp:0.3] (0.744)
  - meta-llama/llama-4-maverick[temp:0.3] (0.743)
  - mistralai/mistral-large-2411[temp:0.3] (0.738)
  - openai/gpt-5-mini[temp:0.3] (0.732)
  - google/gemini-2.5-flash[temp:0.3] (0.732)
  - openai/gpt-4o-mini[temp:0.3] (0.724)
  - x-ai/grok-4.1-fast[temp:0.3] (0.724)
  - qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] (0.722)
  - openai/gpt-oss-120b[temp:0.3] (0.712)
  - qwen/qwen3-32b[temp:0.3] (0.705)
  - google/gemma-3-12b-it[temp:0.3] (0.701)
  - openai/gpt-4.1-nano[temp:0.3] (0.699)
  - openai/gpt-oss-20b[temp:0.3] (0.693)
  - x-ai/grok-4[temp:0.3] (0.638)

**Tier 2** (avg: 0.735):
  - qwen/qwen3-next-80b-a3b-instruct[temp:0.3] (0.735)

---

## Methodology Notes

- **JSD Similarity:** Uses `1 - sqrt(JSD)` (Jensen-Shannon Distance) as the similarity metric, matching the evaluation pipeline.
- **Shuffled baseline:** 1000 iterations shuffling segment-distribution assignments within each question.
- **Permutation test:** 10,000 iterations flipping sign of paired differences.
- **Holm-Bonferroni:** Sequential correction that controls family-wise error rate while being less conservative than Bonferroni.
- **Noise floor formula:** `1 - sqrt((k-1) / (2n × ln2))` — the expected JSD similarity between a true distribution and one drawn from it with n samples and k categories.
- **Tier construction:** Union-find grouping models that are NOT significantly different. Transitive grouping may produce larger tiers.
