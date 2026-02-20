# DTEF Statistical Validity Report

*Generated: 2026-02-20T21:15:55.085Z*

**Data:** 6 surveys, 1000 evaluation results

## Executive Summary

### What This Report Tells You

This report evaluates how well AI models predict demographic opinion distributions — that is, given a demographic group (e.g., "18-25 year olds in Brazil"), can the model predict how that group would respond to survey questions? We compare model predictions against real survey data from Global Dialogues rounds, testing whether models do better than simple baselines, whether our data quality is sufficient for reliable evaluation, whether any models are statistically distinguishable from each other, and whether giving models more demographic context actually improves their predictions.

### Key Findings

- **Models vs. Uniform baseline:** Average model score (0.731) vs uniform (0.647), effect size = **+0.084**
- **Models vs. Population Marginal:** Effect size = **-0.102** (models do not yet exceed just knowing the overall population distribution)
- **Models vs. Shuffled Null:** Shuffled mean = 0.761 [0.760, 0.762], best model = 0.768
- **Data quality:** 54.5% of segment-question pairs have high enough sample sizes for reliable evaluation (noise floor > 0.7)
- **Pairwise significance:** 239/273 model pairs significantly different (α = 0.05, Holm-Bonferroni corrected)
- **Context responsiveness:** 3/24 models show significant improvement with more demographic context

## Analysis 1: Null Model Baselines

> **What this measures:** We compare model predictions against three "dumb" baselines that require no AI. If models can't beat these baselines, they aren't adding real value. The **Uniform** baseline guesses equal probability for every option. The **Population Marginal** baseline uses the overall population's answer distribution (ignoring demographics entirely). The **Shuffled** baseline assigns random demographic segments to each question, measuring how much demographic identity actually matters for each question.

| Baseline | Mean Score | 95% CI | (Segment, Question) Pairs |
|----------|-----------|--------|---------------------------|
| Uniform | 0.647 | — | 14,292 |
| Population Marginal | 0.833 | — | 14,292 |
| Shuffled (Permutation Null) | 0.761 | [0.760, 0.762] | 1,000 |

> **Interpretation:** The population marginal baseline currently outperforms the models. This means models aren't yet adding demographic-specific knowledge beyond what you'd get from just knowing the overall population distribution. The models know *what people in general think* but haven't learned *how specific demographics differ* from the population average.

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

## Analysis 2: Analytical Noise Floor (Data Quality)

> **What this measures:** The noise floor tells us how similar two samples drawn from the *same* distribution would look, given the sample size. A **higher noise floor is better** — it means the data has enough samples that random sampling variation is small, and we can reliably distinguish real differences from noise. Pairs *below* the threshold have too few samples for confident evaluation.

Formula: `1 - sqrt((k-1) / (2n × ln2))` where k = number of options, n = sample size.

Quality threshold: 0.7 (pairs above this have sufficient data quality for reliable evaluation)

### By Segment Category

| Category | Pairs | Avg Sample Size | Avg Noise Floor | % Reliable (Above Threshold) |
|----------|-------|----------------|----------------|------------------------------|
| environment | 909 | 350 | 0.888 | 100.0% |
| aiConcern | 636 | 350 | 0.899 | 100.0% |
| gender | 610 | 516 | 0.928 | 99.3% |
| ageGroup | 1561 | 203 | 0.850 | 94.7% |
| religion | 2121 | 149 | 0.781 | 73.6% |
| country | 8455 | 33 | 0.640 | 30.7% |

> **Reading this table:** Categories with high "% Reliable" have large sample sizes and clean data — evaluation results for these segments are trustworthy. Categories with low reliability (typically country-level segments with n~33) should be interpreted cautiously, as sampling noise alone could account for apparent model differences.

### Threshold Sweep

| Quality Threshold | % of Pairs Meeting Threshold |
|-------------------|------------------------------|
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

Minimum respondents needed per segment to achieve a given noise floor:

| Options (k) | n for 0.90 floor | n for 0.80 floor | n for 0.70 floor |
|-------------|-----------------|-----------------|-----------------|
| 3 | 145 | 37 | 17 |
| 4 | 217 | 55 | 25 |
| 5 | 289 | 73 | 33 |
| 6 | 361 | 91 | 41 |
| 7 | 433 | 109 | 49 |

## Analysis 3: Pairwise Model Significance

> **What this measures:** For each pair of models, we test whether the difference in their scores is statistically significant or could be explained by chance. A permutation test shuffles which model's score is which and checks whether the observed difference is unusually large. Statistical significance does *not* imply practical importance — a highly significant difference might still be too small to matter.

Permutation test (10,000 iterations) with Holm-Bonferroni correction at α = 0.05.

**Summary:** 239 of 273 model pairs (87.5%) show statistically significant differences.

### Pairwise Comparison Table

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
| google/gemini-2.5-flash[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0039 | 0.0000 | 0.0000 | 14053 | **Yes** |
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
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0045 | 0.0000 | 0.0000 | 9180 | **Yes** |
| qwen/qwen3-32b[temp:0.3] | qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.0261 | 0.0000 | 0.0000 | 5251 | **Yes** |
| qwen/qwen3-32b[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0173 | 0.0000 | 0.0000 | 5490 | **Yes** |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | +0.0088 | 0.0000 | 0.0000 | 8941 | **Yes** |
| openai/gpt-4o[temp:0.3] | openai/gpt-5[temp:0.3] | -0.0044 | 0.0001 | 0.0038 | 5675 | **Yes** |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0039 | 0.0003 | 0.0108 | 7016 | **Yes** |
| anthropic/claude-sonnet-4[temp:0.3] | openai/gpt-5.1[temp:0.3] | -0.0026 | 0.0003 | 0.0111 | 9220 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | openai/gpt-5-mini[temp:0.3] | +0.0034 | 0.0012 | 0.0420 | 6925 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | -0.0021 | 0.0020 | 0.0680 | 9130 | No |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | anthropic/claude-sonnet-4.5[temp:0.3] | +0.0018 | 0.0042 | 0.1386 | 9222 | No |
| meta-llama/llama-4-maverick[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0016 | 0.0059 | 0.1888 | 14335 | No |
| meta-llama/llama-4-maverick[temp:0.3] | mistralai/mistral-large-2411[temp:0.3] | +0.0018 | 0.0102 | 0.3162 | 9130 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | openai/gpt-5.1[temp:0.3] | +0.0016 | 0.0150 | 0.4500 | 9220 | No |
| openai/gpt-4o-mini[temp:0.3] | x-ai/grok-4.1-fast[temp:0.3] | -0.0001 | 0.9073 | 0.9073 | 9180 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0026 | 0.0389 | 1.0000 | 5675 | No |
| anthropic/claude-sonnet-4[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0401 | 0.0523 | 1.0000 | 43 | No |
| google/gemma-3-12b-it[temp:0.3] | qwen/qwen3-32b[temp:0.3] | -0.0031 | 0.0675 | 1.0000 | 5533 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0377 | 0.0756 | 1.0000 | 43 | No |
| meta-llama/llama-4-maverick[temp:0.3] | mistralai/mistral-medium-3[temp:0.3] | -0.0008 | 0.0800 | 1.0000 | 14335 | No |
| google/gemini-2.5-flash[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0388 | 0.0880 | 1.0000 | 43 | No |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0337 | 0.1125 | 1.0000 | 43 | No |
| openai/gpt-4.1[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0316 | 0.1168 | 1.0000 | 43 | No |
| openai/gpt-oss-20b[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0326 | 0.1268 | 1.0000 | 43 | No |
| openai/gpt-4.1-nano[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0363 | 0.1663 | 1.0000 | 43 | No |
| mistralai/mistral-medium-3[temp:0.3] | openai/gpt-4.1-mini[temp:0.3] | -0.0008 | 0.1835 | 1.0000 | 14335 | No |
| openai/gpt-5[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0249 | 0.1893 | 1.0000 | 43 | No |
| openai/gpt-5.1[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0249 | 0.2020 | 1.0000 | 43 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0247 | 0.2059 | 1.0000 | 43 | No |
| google/gemma-3-12b-it[temp:0.3] | openai/gpt-4.1-nano[temp:0.3] | +0.0011 | 0.2153 | 1.0000 | 14335 | No |
| openai/gpt-oss-120b[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0223 | 0.2424 | 1.0000 | 43 | No |
| google/gemma-3-12b-it[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0259 | 0.3427 | 1.0000 | 43 | No |
| openai/gpt-4.1[temp:0.3] | openai/gpt-5[temp:0.3] | +0.0010 | 0.3523 | 1.0000 | 5675 | No |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0172 | 0.4811 | 1.0000 | 43 | No |
| openai/gpt-4o-mini[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0190 | 0.5031 | 1.0000 | 43 | No |
| openai/gpt-4.1-nano[temp:0.3] | openai/gpt-oss-20b[temp:0.3] | +0.0007 | 0.5143 | 1.0000 | 9221 | No |
| qwen/qwen3-32b[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0133 | 0.5433 | 1.0000 | 43 | No |
| mistralai/mistral-medium-3[temp:0.3] | x-ai/grok-4[temp:0.3] | -0.0108 | 0.6203 | 1.0000 | 43 | No |
| openai/gpt-4o[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0119 | 0.6302 | 1.0000 | 43 | No |
| meta-llama/llama-4-maverick[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0083 | 0.7110 | 1.0000 | 43 | No |
| openai/gpt-4.1-mini[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0072 | 0.7564 | 1.0000 | 43 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | openai/gpt-4.1[temp:0.3] | +0.0001 | 0.8365 | 1.0000 | 14335 | No |
| mistralai/mistral-large-2411[temp:0.3] | x-ai/grok-4[temp:0.3] | +0.0037 | 0.8752 | 1.0000 | 43 | No |

## Analysis 4: Context Responsiveness

> **What this measures:** When we give a model more demographic context questions in its prompt (e.g., telling it not just the country but also the age group, gender, and religion of the respondents), does its prediction accuracy improve? A positive slope means more context = better predictions. We test significance via permutation: if randomly reassigning context counts produces slopes as large as the observed one, the relationship is not meaningful.

### Per-Model Context Responsiveness

| Model | Observed Slope | p-value | Adjusted p | Context Levels | Data Points | Significant? |
|-------|---------------|---------|------------|----------------|-------------|-------------|
| openai/gpt-5[temp:0.3] | +0.003866 | 0.0000 | 0.0000 | 5 | 6188 | **Yes** |
| qwen/qwen3-32b[temp:0.3] | +0.003180 | 0.0000 | 0.0000 | 5 | 6026 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.001516 | 0.0000 | 0.0000 | 5 | 21336 | **Yes** |
| openai/gpt-5.1[temp:0.3] | +0.000332 | 0.0048 | 0.1008 | 5 | 23244 | No |
| mistralai/mistral-large-2411[temp:0.3] | +0.000325 | 0.0068 | 0.1360 | 5 | 23245 | No |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.000237 | 0.0127 | 0.2413 | 5 | 42628 | No |
| openai/gpt-4o[temp:0.3] | +0.000192 | 0.0580 | 1.0000 | 5 | 23243 | No |
| google/gemma-3-12b-it[temp:0.3] | -0.000039 | 0.6305 | 1.0000 | 5 | 42623 | No |
| openai/gpt-4.1-mini[temp:0.3] | -0.000240 | 0.9920 | 1.0000 | 5 | 42630 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | -0.000449 | 1.0000 | 1.0000 | 5 | 42628 | No |
| openai/gpt-4.1-nano[temp:0.3] | -0.000477 | 0.9997 | 1.0000 | 5 | 42631 | No |
| openai/gpt-4.1[temp:0.3] | -0.000520 | 1.0000 | 1.0000 | 5 | 42626 | No |
| openai/gpt-4o-mini[temp:0.3] | -0.000705 | 1.0000 | 1.0000 | 5 | 42633 | No |
| meta-llama/llama-4-maverick[temp:0.3] | -0.000795 | 1.0000 | 1.0000 | 5 | 42631 | No |
| anthropic/claude-sonnet-4[temp:0.3] | -0.000821 | 1.0000 | 1.0000 | 5 | 42626 | No |
| x-ai/grok-4[temp:0.3] | -0.000872 | 0.7246 | 1.0000 | 5 | 78 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | -0.000933 | 1.0000 | 1.0000 | 5 | 42621 | No |
| mistralai/mistral-medium-3[temp:0.3] | -0.000971 | 1.0000 | 1.0000 | 5 | 42630 | No |
| openai/gpt-oss-120b[temp:0.3] | -0.001259 | 1.0000 | 1.0000 | 5 | 23238 | No |
| x-ai/grok-4.1-fast[temp:0.3] | -0.001392 | 1.0000 | 1.0000 | 5 | 23156 | No |
| openai/gpt-oss-20b[temp:0.3] | -0.001869 | 1.0000 | 1.0000 | 5 | 23154 | No |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.002970 | 1.0000 | 1.0000 | 5 | 32541 | No |
| google/gemini-2.5-flash[temp:0.3] | -0.003843 | 1.0000 | 1.0000 | 5 | 42630 | No |
| openai/gpt-5-mini[temp:0.3] | -0.004541 | 1.0000 | 1.0000 | 5 | 13567 | No |

> **Interpretation:** 3 model(s) show statistically significant improvement with more demographic context. This suggests these models can meaningfully use additional demographic information to make better predictions about group-specific opinion distributions.

### Significance by Model × Category

> **Multiple comparisons correction:** Each model × category combination is tested independently, then Holm-Bonferroni is applied jointly across all 93 tests. This controls for the fact that with enough model-category pairs, some would show positive slopes by pure chance. Only combinations that survive this joint correction are marked significant.

**Summary:** 8 of 93 model×category pairs significant after joint correction.

#### Significant Model × Category Pairs

| Category | Model | Slope | Raw p | Adjusted p | Data Points |
|----------|-------|-------|-------|------------|-------------|
| Gender | anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.002674 | 0.0000 | 0.0000 | 966 |
| Country | anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.001312 | 0.0000 | 0.0000 | 13004 |
| Country | openai/gpt-5[temp:0.3] | +0.002635 | 0.0000 | 0.0000 | 3623 |
| Country | qwen/qwen3-32b[temp:0.3] | +0.002992 | 0.0000 | 0.0000 | 3536 |
| Environment | anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.002372 | 0.0000 | 0.0000 | 1354 |
| Religion | anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.001813 | 0.0000 | 0.0000 | 3245 |
| Religion | openai/gpt-5[temp:0.3] | +0.009213 | 0.0000 | 0.0000 | 944 |
| Environment | openai/gpt-5[temp:0.3] | +0.004210 | 0.0005 | 0.0430 | 405 |

**Gender:**

| Model | Slope | Raw p | Adjusted p | Data Points | Sig? |
|-------|-------|-------|------------|-------------|------|
| qwen/qwen3-32b[temp:0.3] | +0.003190 | 0.0554 | 1.0000 | 261 | No |
| openai/gpt-5[temp:0.3] | +0.003125 | 0.0190 | 1.0000 | 270 | No |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.002674 | 0.0000 | 0.0000 | 966 | **Yes** |
| openai/gpt-5.1[temp:0.3] | +0.001481 | 0.0043 | 0.3612 | 966 | No |
| openai/gpt-4o[temp:0.3] | +0.000610 | 0.1128 | 1.0000 | 965 | No |
| mistralai/mistral-large-2411[temp:0.3] | +0.000208 | 0.3648 | 1.0000 | 966 | No |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.000035 | 0.4789 | 1.0000 | 1812 | No |
| openai/gpt-4.1-mini[temp:0.3] | -0.000127 | 0.6223 | 1.0000 | 1812 | No |
| openai/gpt-4.1[temp:0.3] | -0.000505 | 0.8837 | 1.0000 | 1810 | No |
| google/gemma-3-12b-it[temp:0.3] | -0.000522 | 0.8356 | 1.0000 | 1812 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | -0.000563 | 0.8464 | 1.0000 | 1812 | No |
| openai/gpt-4.1-nano[temp:0.3] | -0.000663 | 0.8617 | 1.0000 | 1812 | No |
| openai/gpt-4o-mini[temp:0.3] | -0.000951 | 0.9897 | 1.0000 | 1812 | No |
| mistralai/mistral-medium-3[temp:0.3] | -0.001265 | 0.9971 | 1.0000 | 1812 | No |
| meta-llama/llama-4-maverick[temp:0.3] | -0.001639 | 1.0000 | 1.0000 | 1812 | No |
| x-ai/grok-4.1-fast[temp:0.3] | -0.001698 | 0.9769 | 1.0000 | 966 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | -0.001699 | 0.9981 | 1.0000 | 1812 | No |
| openai/gpt-5-mini[temp:0.3] | -0.001713 | 0.9782 | 1.0000 | 696 | No |
| anthropic/claude-sonnet-4[temp:0.3] | -0.001861 | 0.9991 | 1.0000 | 1812 | No |
| openai/gpt-oss-120b[temp:0.3] | -0.002051 | 0.9955 | 1.0000 | 966 | No |
| google/gemini-2.5-flash[temp:0.3] | -0.002095 | 0.9999 | 1.0000 | 1811 | No |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.002818 | 1.0000 | 1.0000 | 1533 | No |
| openai/gpt-oss-20b[temp:0.3] | -0.002856 | 0.9990 | 1.0000 | 966 | No |

**Country:**

| Model | Slope | Raw p | Adjusted p | Data Points | Sig? |
|-------|-------|-------|------------|-------------|------|
| qwen/qwen3-32b[temp:0.3] | +0.002992 | 0.0000 | 0.0000 | 3536 | **Yes** |
| openai/gpt-5[temp:0.3] | +0.002635 | 0.0000 | 0.0000 | 3623 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.001312 | 0.0000 | 0.0000 | 13004 | **Yes** |
| mistralai/mistral-large-2411[temp:0.3] | +0.000196 | 0.1300 | 1.0000 | 13720 | No |
| openai/gpt-4o[temp:0.3] | +0.000187 | 0.1328 | 1.0000 | 13720 | No |
| google/gemma-3-12b-it[temp:0.3] | +0.000161 | 0.1521 | 1.0000 | 25264 | No |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.000139 | 0.1550 | 1.0000 | 25261 | No |
| openai/gpt-5.1[temp:0.3] | +0.000110 | 0.2637 | 1.0000 | 13720 | No |
| openai/gpt-4.1-nano[temp:0.3] | +0.000021 | 0.4506 | 1.0000 | 25266 | No |
| openai/gpt-4.1-mini[temp:0.3] | -0.000278 | 0.9800 | 1.0000 | 25264 | No |
| openai/gpt-4o-mini[temp:0.3] | -0.000351 | 0.9956 | 1.0000 | 25266 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | -0.000613 | 1.0000 | 1.0000 | 25262 | No |
| anthropic/claude-sonnet-4[temp:0.3] | -0.000650 | 1.0000 | 1.0000 | 25262 | No |
| meta-llama/llama-4-maverick[temp:0.3] | -0.000670 | 1.0000 | 1.0000 | 25266 | No |
| openai/gpt-4.1[temp:0.3] | -0.000708 | 1.0000 | 1.0000 | 25265 | No |
| x-ai/grok-4[temp:0.3] | -0.000872 | 0.7231 | 1.0000 | 78 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | -0.000930 | 1.0000 | 1.0000 | 25262 | No |
| mistralai/mistral-medium-3[temp:0.3] | -0.001066 | 1.0000 | 1.0000 | 25265 | No |
| openai/gpt-oss-120b[temp:0.3] | -0.001185 | 1.0000 | 1.0000 | 13718 | No |
| x-ai/grok-4.1-fast[temp:0.3] | -0.001502 | 1.0000 | 1.0000 | 13632 | No |
| openai/gpt-oss-20b[temp:0.3] | -0.001695 | 1.0000 | 1.0000 | 13649 | No |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.003138 | 1.0000 | 1.0000 | 18904 | No |
| google/gemini-2.5-flash[temp:0.3] | -0.004479 | 1.0000 | 1.0000 | 25265 | No |
| openai/gpt-5-mini[temp:0.3] | -0.005034 | 1.0000 | 1.0000 | 7536 | No |

**Environment:**

| Model | Slope | Raw p | Adjusted p | Data Points | Sig? |
|-------|-------|-------|------------|-------------|------|
| qwen/qwen3-32b[temp:0.3] | +0.005536 | 0.0011 | 0.0935 | 396 | No |
| openai/gpt-5[temp:0.3] | +0.004210 | 0.0005 | 0.0430 | 405 | **Yes** |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.002372 | 0.0000 | 0.0000 | 1354 | **Yes** |
| openai/gpt-5.1[temp:0.3] | +0.001244 | 0.0063 | 0.5229 | 1449 | No |
| openai/gpt-4o[temp:0.3] | +0.001009 | 0.0103 | 0.8343 | 1449 | No |
| mistralai/mistral-large-2411[temp:0.3] | +0.000936 | 0.0367 | 1.0000 | 1449 | No |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.000388 | 0.1313 | 1.0000 | 2706 | No |
| x-ai/grok-4.1-fast[temp:0.3] | +0.000137 | 0.4181 | 1.0000 | 1449 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | -0.000009 | 0.5106 | 1.0000 | 2706 | No |
| openai/gpt-4.1-mini[temp:0.3] | -0.000081 | 0.5945 | 1.0000 | 2706 | No |
| openai/gpt-4.1[temp:0.3] | -0.000089 | 0.5969 | 1.0000 | 2705 | No |
| openai/gpt-4.1-nano[temp:0.3] | -0.000226 | 0.6936 | 1.0000 | 2705 | No |
| google/gemma-3-12b-it[temp:0.3] | -0.000432 | 0.8368 | 1.0000 | 2705 | No |
| openai/gpt-oss-120b[temp:0.3] | -0.000506 | 0.7698 | 1.0000 | 1449 | No |
| openai/gpt-5-mini[temp:0.3] | -0.000649 | 0.8169 | 1.0000 | 1044 | No |
| mistralai/mistral-medium-3[temp:0.3] | -0.000996 | 0.9985 | 1.0000 | 2706 | No |
| openai/gpt-4o-mini[temp:0.3] | -0.001295 | 0.9999 | 1.0000 | 2706 | No |
| openai/gpt-oss-20b[temp:0.3] | -0.001514 | 0.9758 | 1.0000 | 1440 | No |
| meta-llama/llama-4-maverick[temp:0.3] | -0.001606 | 1.0000 | 1.0000 | 2706 | No |
| anthropic/claude-sonnet-4[temp:0.3] | -0.001697 | 1.0000 | 1.0000 | 2706 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | -0.001869 | 0.9999 | 1.0000 | 2700 | No |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.001986 | 1.0000 | 1.0000 | 2279 | No |
| google/gemini-2.5-flash[temp:0.3] | -0.002145 | 1.0000 | 1.0000 | 2706 | No |

**Religion:**

| Model | Slope | Raw p | Adjusted p | Data Points | Sig? |
|-------|-------|-------|------------|-------------|------|
| openai/gpt-5[temp:0.3] | +0.009213 | 0.0000 | 0.0000 | 944 | **Yes** |
| qwen/qwen3-32b[temp:0.3] | +0.002942 | 0.0068 | 0.5576 | 923 | No |
| anthropic:claude-3-7-sonnet-20250219[temp:0.3] | +0.001813 | 0.0000 | 0.0000 | 3245 | **Yes** |
| qwen/qwen3-30b-a3b-instruct-2507[temp:0.3] | +0.000577 | 0.0140 | 1.0000 | 6314 | No |
| openai/gpt-5.1[temp:0.3] | +0.000470 | 0.0786 | 1.0000 | 3380 | No |
| openai/gpt-4o[temp:0.3] | +0.000309 | 0.1639 | 1.0000 | 3381 | No |
| openai/gpt-4.1-nano[temp:0.3] | +0.000213 | 0.2757 | 1.0000 | 6313 | No |
| mistralai/mistral-large-2411[temp:0.3] | +0.000194 | 0.2944 | 1.0000 | 3380 | No |
| google/gemma-3-12b-it[temp:0.3] | -0.000158 | 0.6915 | 1.0000 | 6308 | No |
| anthropic/claude-haiku-4.5[temp:0.3] | -0.000341 | 0.9064 | 1.0000 | 6313 | No |
| openai/gpt-4.1[temp:0.3] | -0.000522 | 0.9798 | 1.0000 | 6313 | No |
| openai/gpt-4.1-mini[temp:0.3] | -0.000547 | 0.9863 | 1.0000 | 6313 | No |
| anthropic/claude-sonnet-4.5[temp:0.3] | -0.000771 | 0.9975 | 1.0000 | 6314 | No |
| meta-llama/llama-4-maverick[temp:0.3] | -0.000775 | 0.9993 | 1.0000 | 6314 | No |
| anthropic/claude-sonnet-4[temp:0.3] | -0.000784 | 0.9986 | 1.0000 | 6312 | No |
| openai/gpt-4o-mini[temp:0.3] | -0.000815 | 0.9994 | 1.0000 | 6314 | No |
| mistralai/mistral-medium-3[temp:0.3] | -0.001043 | 1.0000 | 1.0000 | 6312 | No |
| qwen/qwen3-next-80b-a3b-instruct[temp:0.3] | -0.001411 | 1.0000 | 1.0000 | 5299 | No |
| openai/gpt-oss-120b[temp:0.3] | -0.001460 | 0.9997 | 1.0000 | 3377 | No |
| openai/gpt-5-mini[temp:0.3] | -0.001767 | 0.9995 | 1.0000 | 2435 | No |
| x-ai/grok-4.1-fast[temp:0.3] | -0.001991 | 1.0000 | 1.0000 | 3380 | No |
| openai/gpt-oss-20b[temp:0.3] | -0.002012 | 0.9999 | 1.0000 | 3373 | No |
| google/gemini-2.5-flash[temp:0.3] | -0.003313 | 1.0000 | 1.0000 | 6314 | No |

---

## Future Work & Limitations

### Population Baseline Blueprint Variant

Currently we cannot directly test whether knowing demographics helps or hurts accuracy, because all evaluation blueprints include demographic context in the prompt. A "no-demographic" blueprint variant would allow a direct comparison: the same model predicting the same segment's distribution, with and without knowing which demographic group it's predicting for. The population marginal baseline approximates this (it measures how well you can do with zero demographic knowledge), but it isn't the same as testing the model's own ability to predict without demographics — the model might perform differently than the marginal average.

### Demographic Combinations

The current analysis tests single demographic dimensions (age, gender, country, etc.) independently. Real people belong to intersecting groups — a "18-25 year old male in an urban area" may have very different opinions from what you'd predict by averaging the age, gender, and environment effects separately. Future work should test combinations to understand whether models improve accuracy with intersectional demographic context, and whether certain combinations are particularly well or poorly predicted.

### Cross-Round Temporal Analysis

With data spanning GD1 through GD7, future analysis could examine temporal consistency. Do models perform differently on newer vs. older survey rounds? Are opinion shifts over time captured by the models, or do they reflect a static snapshot of the training data? This would help assess whether models are learning genuine cultural patterns or memorizing specific survey results.

---

## Methodology Notes

- **JSD Similarity:** Uses `1 - sqrt(JSD)` (Jensen-Shannon Distance) as the similarity metric, matching the evaluation pipeline.
- **Shuffled baseline:** 1000 iterations shuffling segment-distribution assignments within each question.
- **Permutation test:** 10,000 iterations flipping sign of paired differences (Analysis 3) or shuffling context count labels (Analysis 4).
- **Holm-Bonferroni:** Sequential correction that controls family-wise error rate while being less conservative than Bonferroni. Applied separately within each analysis.
- **Noise floor formula:** `1 - sqrt((k-1) / (2n × ln2))` — the expected JSD similarity between a true distribution and one drawn from it with n samples and k categories. Higher values indicate better data quality.
- **Context responsiveness (overall):** For each model, computes regression slope of score vs. context count across all (segment, question) pairs. Permutation test shuffles context labels to establish the null distribution. Holm-Bonferroni applied across all models.
- **Context responsiveness (by category):** Same test run independently for each model × category pair, with Holm-Bonferroni applied jointly across *all* model×category combinations. This controls for the multiple comparisons problem: with enough pairs, some would show positive slopes by chance alone.
