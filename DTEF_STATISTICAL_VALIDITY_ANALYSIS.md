# DTEF Statistical Validity Analysis

## The Core Question: Signal vs. Noise

When DTEF reports that Model A scores 0.87 and Model B scores 0.82 on demographic distribution prediction, or that a model is "more accurate" for urban respondents than rural ones, or that certain models are "context-responsive" — **how do we know these findings reflect genuine model capabilities rather than artifacts of randomness?**

### The Problem, Precisely Stated

DTEF's evaluation task is fundamentally probabilistic in ways that deterministic benchmarks are not. In a typical LLM benchmark ("What is the capital of France?"), the ground truth is exact and the evaluation is binary. In DTEF, we are comparing **estimated distributions** against **sampled distributions**, introducing uncertainty on *both sides* of the comparison:

1. **Ground truth uncertainty.** Survey response distributions are estimates derived from finite samples. A segment showing `[45%, 30%, 25%]` from n=50 respondents has a very different confidence envelope than the same distribution from n=500. The "true" population distribution could differ substantially from what we measured, especially at small sample sizes.

2. **Prediction variance.** Each model is queried exactly once per question (at temperature 0.3). LLMs are stochastic — the same prompt could yield `[44.1, 31.2, 24.7]` on one call and `[47.3, 28.5, 24.2]` on the next. We have no estimate of this within-model variance.

3. **Metric sensitivity.** Jensen-Shannon Distance similarity (our primary metric) compresses a multi-dimensional comparison into a single scalar. Small perturbations in either distribution can produce non-trivial score changes, especially for distributions with many options or near-zero probabilities.

4. **Aggregation artifacts.** Per-segment scores are averaged with equal weight regardless of the number of questions, the number of response options per question, or the ground truth sample size. A segment with n=15 (barely above our minimum threshold) contributes equally to a model's overall score as one with n=546.

The consequence: **every number on the demographics leaderboard — overall scores, segment scores, fairness gaps, context responsiveness slopes — could plausibly be within the noise floor of what a naive or random predictor would produce**, and we currently have no mechanism to distinguish signal from noise.

### What This Means for Published Claims

If we claim in a paper that "GPT-4o is more demographically representative than Claude" or "models show significant accuracy disparities across gender segments," a rigorous reviewer will ask:

- What is the **null distribution** of scores? What would a random/naive predictor score on this benchmark?
- Are model score **differences statistically significant** given the sample sizes involved?
- How much of the observed **fairness gap** is attributable to ground truth sampling error vs. genuine model behavior?
- What is the **test-retest reliability** — would the same model produce the same ranking on a second evaluation run?

As of February 2026, we have implemented analyses that answer the first two questions and partially address the third. See [Results](#results-what-we-found) below.

---

## Current State of the Pipeline

### What We Compute

| Component | Current Implementation | Statistical Rigor |
|-----------|----------------------|-------------------|
| Per-question score | `1 - sqrt(JSD)` between model prediction and survey distribution | No confidence interval |
| Per-segment score | Arithmetic mean of per-question scores | No standard error |
| Overall model score | Arithmetic mean of per-segment scores | No confidence interval |
| Segment std deviation | Population σ across segments | Descriptive only, no inferential use |
| Fairness gap | `max_segment - min_segment` within a category | No significance test |
| Context responsiveness | OLS slope of score vs. context count | p-values via permutation test (offline analysis); joint Holm-Bonferroni across model × category pairs |
| Sample size handling | Warn if < 30; exclude if < 10 | Threshold-based only |

### What We Don't Compute (in the live pipeline)

*Note: Several of these gaps are now addressed by the offline statistical analysis script (`pnpm analyze:stats`). See [Results](#results-what-we-found) for findings.*

- ~~**No null baselines**~~ → **Now computed offline** (uniform, population marginal, shuffled)
- **No confidence intervals** on any score at any level of aggregation
- ~~**No significance tests** for pairwise model comparisons~~ → **Now computed offline** (permutation tests with Holm-Bonferroni)
- **No effect sizes** for fairness gaps (are they practically meaningful?)
- **No test-retest reliability** — no repeated model sampling
- **No sample-size weighting** in aggregation
- ~~**No correction for multiple comparisons**~~ → **Now applied** in both pairwise and context analyses
- ~~**No R² or p-values** for context responsiveness regression~~ → **Now computed offline** (permutation-based p-values with joint correction across model × category pairs)

### Data Volume Context

Using GD4 as a representative round:
- **116 poll questions** with 3-6 response options each
- **49 demographic segments** (after minimum sample size filtering)
- **~5,684 evaluation prompts** per model per context level
- Segment sample sizes range from **~10 to ~1,058** respondents
- Country-level segments can be as small as **1-5 respondents** (filtered out by n≥10 threshold, but segments with n=10-29 survive with only a warning)

---

## Analysis Options

### Option 1: Null Model Baselines

**Purpose:** Establish the "floor" — what score does a predictor with no real knowledge achieve?

**Implementation:** Compute JSD similarity scores for several null/baseline predictors and compare against actual model scores.

#### Baseline Predictors to Implement

**a) Uniform predictor.** For each question with k options, predict `[100/k, 100/k, ..., 100/k]`. This is the "no information" baseline — a predictor that knows nothing about the question or demographic. Any model that doesn't significantly beat uniform has no predictive value.

**b) Population marginal predictor.** For each question, predict the **overall (All respondents)** distribution for every segment. This baseline knows the general population's opinion but assumes all demographics respond identically. A model that can't beat this baseline is not capturing demographic variation — it's just learning overall opinion distributions.

**c) Shuffled predictor.** Randomly assign ground truth distributions from other segments to each segment (permutation within questions). This preserves the distributional characteristics of the data while destroying the segment-distribution mapping. Repeated many times, this gives a null distribution of scores.

**d) Prior-round predictor.** Use distributions from a different GD round for the same segments/questions (where available). This measures how much demographic opinions change across time — if a model can't beat "just use last year's data," its predictions aren't adding value.

#### What This Tells Us

- **Uniform vs. model score gap** → the model has learned *something* about opinion distributions
- **Population marginal vs. model score gap** → the model captures *demographic-specific* variation (the core DTEF claim)
- **Shuffled null distribution** → gives us a p-value for each model's score ("probability of achieving this score by chance")

#### Effort Level

**Low-medium.** Can be implemented as a standalone analysis script that reads existing S3 results and the DTEFSurveyData JSON. No pipeline changes needed. Estimated: 1-2 days of work.

---

### Option 2: Bootstrap Confidence Intervals on Ground Truth

**Purpose:** Quantify uncertainty in ground truth distributions due to finite sample sizes.

**Method:** For each segment-question pair with known sample size n:

1. Treat the observed distribution as a multinomial with parameters p = observed proportions
2. Draw B bootstrap samples of size n from this multinomial
3. For each bootstrap sample, compute the JSD similarity against the model's prediction
4. The distribution of B scores gives a confidence interval

**Example:** If the ground truth is `[45%, 30%, 25%]` from n=20:
- Bootstrap sample 1 might be `[50%, 25%, 25%]` → JSD score = 0.91
- Bootstrap sample 2 might be `[40%, 35%, 25%]` → JSD score = 0.94
- ...after 1000 samples: 95% CI = [0.78, 0.96]

This means any model scoring within [0.78, 0.96] is **indistinguishable from the ground truth** given the sample size. If Model A scores 0.90 and Model B scores 0.85, and both fall within this interval, their difference is not meaningful.

#### What This Tells Us

- Per-question **reliability of the ground truth** as a benchmark
- Which segments/questions have **too few respondents** to produce meaningful scores
- Whether model score **differences are within noise** or outside it
- Sample-size-aware **confidence intervals** on all aggregated scores

#### Propagation to Aggregated Scores

The per-question bootstrap CIs can be propagated upward:
- **Per-segment CI:** Bootstrap across questions within a segment
- **Overall model CI:** Bootstrap across segments
- **Fairness gap CI:** Bootstrap the gap statistic itself
- **Context slope CI:** Bootstrap the regression

#### Effort Level

**Medium.** Requires implementing multinomial resampling and propagating CIs through the aggregation pipeline. Can be done as a post-hoc analysis script or integrated into the aggregation service. Estimated: 2-3 days.

---

### Option 3: Repeated Model Sampling (Test-Retest Reliability)

**Purpose:** Estimate within-model prediction variance.

**Method:** Run the same evaluation multiple times (3-5 runs) for each model at the same temperature, then measure:

- **Intra-class correlation (ICC)** across runs — how stable are per-question predictions?
- **Score standard deviation** — how much does the overall score fluctuate?
- **Rank stability** — does the model ranking change across runs?

#### What This Tells Us

- Whether model predictions are **deterministic enough** to be meaningful at temperature 0.3
- The **minimum detectable difference** between models (if within-model σ = 0.03, a 0.02 difference between models is noise)
- Whether lowering temperature (e.g., to 0.0 or 0.1) would substantially reduce variance

#### Cost Consideration

This multiplies API costs by the number of reruns. For a targeted analysis:
- Run 3-5 repeats for **2-3 representative models** on **1 survey round**
- ~5,684 prompts × 3 runs × 3 models ≈ 51K additional API calls
- At ~$0.01-0.03 per call (depending on model), this is $500-$1,500

#### Effort Level

**Medium, plus API cost.** The pipeline already supports running the same config multiple times. The analysis (ICC computation, rank stability) would need a new script. Estimated: 1-2 days of work + API costs.

---

### Option 4: Permutation Tests for Model Comparisons

**Purpose:** Determine whether the observed score difference between two models is statistically significant.

**Method:** For each pair of models (A, B):

1. Collect their paired per-question scores: `{(scoreA_q1, scoreB_q1), (scoreA_q2, scoreB_q2), ...}`
2. Under the null hypothesis, the scores are exchangeable — model identity doesn't matter
3. Randomly permute model labels N times (e.g., 10,000)
4. Compute the mean score difference for each permutation
5. The p-value = proportion of permuted differences ≥ observed difference

This is equivalent to a paired permutation test (non-parametric, no distributional assumptions).

**Alternatively:** Use a paired Wilcoxon signed-rank test or paired t-test on the per-question score differences.

#### What This Tells Us

- Which pairwise model differences are **statistically significant**
- A **corrected ranking** that groups models into statistically distinguishable tiers
- Whether the leaderboard differences are **meaningful or within noise**

#### Multiple Comparisons

With k models, there are k(k-1)/2 pairwise comparisons. Apply Holm-Bonferroni or Benjamini-Hochberg correction to control false discovery rate.

#### Effort Level

**Low.** Only requires existing per-question scores from S3 results. Can be implemented as a standalone script. Estimated: 1 day.

---

### Option 5: Analytical Confidence Intervals via Multinomial Sampling Theory

**Purpose:** Compute exact or approximate confidence intervals without bootstrap resampling.

**Method:** For a multinomial distribution with n observations and k categories:

- The standard error of each proportion p_i is `sqrt(p_i(1-p_i)/n)`
- The covariance between proportions is `-p_i * p_j / n`
- The **expected JSD** under sampling noise can be derived analytically (approximately) using a delta method expansion

#### Approximate Expected JSD Due to Sampling Noise

For two distributions P and Q drawn from the same multinomial with k categories and n observations each:

```
E[JSD(P, Q)] ≈ (k-1) / (2n * ln(2))
```

This gives us the **expected JSD between two independent samples from the same population**, which is the noise floor. If the observed JSD between a model's prediction and the ground truth is not significantly larger than this, the model is performing at chance.

Similarly, the expected JSD similarity score due purely to sampling noise:

```
E[similarity_noise] ≈ 1 - sqrt((k-1) / (2n * ln(2)))
```

For k=4 options and n=50 respondents: `E[similarity_noise] ≈ 1 - sqrt(3 / (100 * 0.693)) ≈ 1 - sqrt(0.0433) ≈ 1 - 0.208 ≈ 0.79`

This means **any score below ~0.79 for a 4-option question with n=50 is worse than what you'd expect from sampling noise alone**, and scores near 0.79 are indistinguishable from noise.

#### What This Tells Us

- A **closed-form noise floor** per question, parameterized by k and n
- Which questions/segments have **too little data** for meaningful evaluation
- Fast computation without Monte Carlo simulation

#### Effort Level

**Low.** Pure math, implemented as a utility function. Estimated: half a day.

---

### Option 6: Sample-Size-Weighted Aggregation

**Purpose:** Ensure that scores derived from well-sampled segments contribute more to aggregate metrics than those from poorly-sampled segments.

**Method:** When computing per-model aggregate scores, weight each segment's score by its sample size (or a function thereof, like sqrt(n) or log(n)):

```
weighted_score = Σ(w_i * score_i) / Σ(w_i)
where w_i = sqrt(n_i)  or  w_i = n_i  or  w_i = log(n_i)
```

**Alternative: minimum-n filtering.** Simply raise the minimum sample size threshold from 10 to 30 (or 50) to ensure all included segments have reasonably stable ground truth distributions.

#### What This Tells Us

- Whether the current **equal-weighted ranking changes** when accounting for sample sizes
- If small segments are **distorting the leaderboard**

#### Effort Level

**Low.** Modification to `DemographicAggregationService.aggregate()`. Estimated: half a day.

---

### Option 7: Fairness Gap Significance Testing

**Purpose:** Determine whether observed fairness gaps are statistically meaningful.

**Method:** For each (model, category) fairness gap:

1. **Bootstrap test:** Resample ground truth distributions for all segments in the category, recompute model scores, recompute the gap. Repeat 1000+ times. If the 95% CI of the gap includes 0, the gap is not significant.

2. **Permutation test:** Under the null that the model's accuracy is identical across segments, permute segment labels and recompute the gap. P-value = fraction of permuted gaps ≥ observed gap.

3. **Analytical approach:** Using the multinomial standard errors from Option 5, compute the expected variance of the JSD score per segment, then test whether the observed gap exceeds what's expected from ground truth noise alone.

#### What This Tells Us

- Which fairness gaps are **real** vs. artifacts of small sample sizes
- Whether it's meaningful to flag a "10% gap" when one segment has n=15 and the other has n=500

#### Effort Level

**Low-medium.** Builds on Options 2 or 5. Estimated: 1 day.

---

## Recommended Approach

### Phase 1: Quick Wins (1-2 days, no API costs)

These can be done as **standalone analysis scripts** reading existing data from S3 and local DTEFSurveyData JSON files. No pipeline changes needed.

1. **Null model baselines (Option 1a-b).** Compute uniform and population-marginal baseline scores. If actual models score 0.85 and uniform scores 0.60 and marginal scores 0.80, we know there's real signal — but only 5 points of it above the demographic-agnostic baseline.

2. **Analytical noise floor (Option 5).** Compute `E[similarity_noise]` per question given k options and n respondents. Flag any question-segment pair where the ground truth noise floor exceeds 0.70 (or whatever threshold we choose). Report what fraction of our evaluation data is "above the noise floor."

3. **Permutation tests for model ranking (Option 4).** Using existing per-question scores, run pairwise permutation tests and report which model differences are significant at p < 0.05 after multiple comparison correction.

### Phase 2: Deeper Analysis (2-3 days, no API costs)

4. **Bootstrap CIs (Option 2).** Implement multinomial bootstrap on ground truth distributions. Propagate CIs to segment scores, overall scores, fairness gaps, and context slopes.

5. **Sample-size-weighted aggregation (Option 6).** Recompute the leaderboard with sqrt(n) weighting. Report whether rankings change.

6. **Fairness gap significance (Option 7).** Test each flagged fairness gap for significance.

### Phase 3: Model-Side Variance (requires API budget)

7. **Repeated sampling (Option 3).** Run 3 repeat evaluations for 2-3 key models. Compute ICC and rank stability. Determine if temperature reduction is needed.

### Deliverables for a Paper

After Phases 1-2, we would be able to report:

- **"Model scores significantly exceed null baselines"** — with effect sizes and p-values against uniform and population-marginal predictors
- **"The following model ranking differences are statistically significant at p < 0.05"** — with corrected pairwise tests
- **"X% of our evaluation data has ground truth sample sizes sufficient for reliable scoring"** — with analytical noise floor analysis
- **"Fairness gaps exceeding Y% are significant after accounting for sampling noise"** — with bootstrap or permutation tests
- **"All reported scores include 95% confidence intervals accounting for ground truth uncertainty"** — with bootstrap CIs

After Phase 3, additionally:

- **"Model predictions are stable across repeated evaluations (ICC > 0.95)"** — demonstrating test-retest reliability
- **"The minimum detectable score difference between models is Z"** — derived from within-model variance

---

## Appendix A: JSD Properties Relevant to Statistical Analysis

### Why JSD Is a Good Choice

1. **Bounded [0, 1]** — scores are interpretable without normalization
2. **Symmetric** — JSD(P, Q) = JSD(Q, P), unlike KL divergence
3. **Metric** — sqrt(JSD) satisfies triangle inequality, enabling meaningful distance comparisons
4. **Finite** — unlike KL divergence, JSD is always finite even when distributions have zero entries (with epsilon smoothing)
5. **Information-theoretic interpretation** — JSD measures how much information is lost when using the average distribution M = (P+Q)/2 instead of the individual distributions

### JSD Sensitivity to Sample Size

For k categories and n observations, the expected JSD between two independent samples from the same multinomial is approximately:

```
E[JSD] ≈ (k-1) / (2n * ln(2))
```

| k (options) | n (respondents) | E[JSD] | E[JS distance] | E[similarity] |
|------------|----------------|--------|-----------------|---------------|
| 3 | 20 | 0.072 | 0.269 | 0.731 |
| 3 | 50 | 0.029 | 0.170 | 0.830 |
| 3 | 100 | 0.014 | 0.120 | 0.880 |
| 3 | 500 | 0.003 | 0.054 | 0.946 |
| 4 | 20 | 0.108 | 0.329 | 0.671 |
| 4 | 50 | 0.043 | 0.208 | 0.792 |
| 4 | 100 | 0.022 | 0.147 | 0.853 |
| 4 | 500 | 0.004 | 0.066 | 0.934 |
| 5 | 20 | 0.144 | 0.380 | 0.620 |
| 5 | 50 | 0.058 | 0.240 | 0.760 |
| 5 | 100 | 0.029 | 0.170 | 0.830 |
| 5 | 500 | 0.006 | 0.076 | 0.924 |
| 6 | 20 | 0.180 | 0.425 | 0.575 |
| 6 | 50 | 0.072 | 0.269 | 0.731 |
| 6 | 100 | 0.036 | 0.190 | 0.810 |
| 6 | 500 | 0.007 | 0.085 | 0.915 |

**Interpretation:** For a 4-option question with only 20 respondents, even a *perfect* predictor (one that knows the true population distribution exactly) would score only ~0.67 on average due to ground truth sampling noise. **Any observed score near 0.67 for such a question is completely uninformative.** A model would need to score significantly above this noise floor to demonstrate real predictive ability.

### Implication for Current Results

If our models are scoring in the 0.80-0.90 range overall, and many segment-question pairs have n < 50 with k = 4-5 options, the noise floor for those pairs is 0.62-0.79. The "true signal" (score above noise floor) may be only 0.01-0.18 — much smaller than the raw scores suggest. Model differences of 0.02-0.05 could easily be within the noise envelope.

---

## Appendix B: Practical Script Architecture

### Recommended Script Structure

```
scripts/
  statistical-analysis/
    null-baselines.ts          # Option 1: Compute uniform, marginal, shuffled baselines
    noise-floor.ts             # Option 5: Analytical JSD noise floor per question
    pairwise-significance.ts   # Option 4: Permutation tests between models
    bootstrap-ci.ts            # Option 2: Bootstrap confidence intervals
    weighted-aggregation.ts    # Option 6: Sample-size-weighted recomputation
    fairness-significance.ts   # Option 7: Fairness gap significance
    report-generator.ts        # Combine all analyses into a summary report
```

### Data Requirements

All scripts would need:
1. **DTEFSurveyData JSON** (local, from `pnpm cli dtef import-gd`) — ground truth distributions and sample sizes
2. **WevalResult JSON files** (from S3) — model predictions and per-question scores
3. **DTEFSummary JSON** (from S3) — current aggregated leaderboard for comparison

### Output

Each analysis produces:
- **JSON data file** with raw results (for integration into the dashboard if desired later)
- **Markdown report** with tables and interpretation (for paper appendix / methodology section)
- **Summary statistics** suitable for inclusion in the paper's main text

---

## Appendix C: What Changes If We Find Weak Signal

If the analysis reveals that much of what the leaderboard shows is noise, the options are:

1. **Raise the minimum sample size threshold** (from n≥10 to n≥50 or n≥100), sacrificing coverage for reliability
2. **Weight scores by sample size**, reducing the influence of noisy segments
3. **Report only significant differences**, replacing the ranked leaderboard with statistically distinguishable tiers
4. **Aggregate to coarser segments** (e.g., age brackets instead of exact ages), increasing effective sample sizes
5. **Collect more survey data** for underrepresented segments (long-term solution)
6. **Use temperature 0** to eliminate model-side variance, isolating ground truth uncertainty as the dominant noise source
7. **Use multiple evaluation runs** and average, reducing model-side variance
8. **Report scores as (point estimate ± CI)** instead of bare numbers, honestly communicating uncertainty

None of these are bad outcomes — they're the result of doing rigorous science. A paper that says "after accounting for sampling uncertainty, we find that top-tier models are statistically indistinguishable from each other but significantly outperform naive baselines" is more credible than one that claims precise rankings without uncertainty quantification.

---

## Results: What We Found

*Analysis run: 2026-02-20. Data: 6 GD survey rounds (GD1-GD6), 1000 evaluation results across 24 models, 929,597 individual scores, 14,292 ground truth (segment, question) pairs. Full generated report: `reports/statistical-validity-report.md`. Script: `scripts/statistical-analysis.ts`.*

We implemented Options 1, 4, and 5 from the analysis plan above, plus a new Analysis 4 (context responsiveness significance) not originally scoped. Here are the findings.

### Analysis 1: Null Model Baselines — Models Beat Uniform but Not Population Marginals

| Baseline | Mean Score |
|----------|-----------|
| Uniform (equal probability across options) | 0.647 |
| Shuffled (random segment-distribution assignment) | 0.761 |
| **Population Marginal (overall population distribution, ignoring demographics)** | **0.833** |
| Average model score | 0.731 |
| Best model score | 0.768 |

**The critical finding:** The population marginal baseline (0.833) **outperforms every model tested** (best: 0.768). This means a trivially simple predictor — one that ignores demographics entirely and just uses the overall population's answer distribution for every segment — produces higher JSD similarity scores than any of the 24 AI models evaluated.

**What this means:** Models are learning something (they beat uniform at 0.647), but they are not yet capturing demographic-specific variation. When a model is told "predict what 18-25 year olds in Brazil think about AI regulation," it apparently produces a worse prediction than simply using "what everyone in the survey thinks about AI regulation." The models know *what people think* but haven't learned *how specific demographics differ from the average*.

**Why this happens:** The population marginal is a strong baseline because most demographic segments don't differ dramatically from the overall population on most questions. A model that tries to differentiate but gets the direction wrong pays a larger penalty than one that conservatively predicts the average. Models appear to be adding noise when they attempt demographic differentiation.

**Implication for the leaderboard:** Raw scores on the demographics leaderboard should be interpreted against this baseline. A model scoring 0.75 is not "75% accurate" — it is actually performing worse than a predictor with zero demographic knowledge (0.833). The meaningful metric is the gap *above* the population marginal, which is currently negative for all models.

### Analysis 2: Noise Floor — 54.5% of Data Has Sufficient Quality

Using the analytical noise floor formula `1 - sqrt((k-1) / (2n × ln2))`, we assessed data quality per segment-question pair:

| Category | Pairs | Avg Sample Size | Avg Noise Floor | % Reliable (> 0.70) |
|----------|-------|----------------|----------------|---------------------|
| AI Concern | 2,256 | 266 | 0.935 | 100.0% |
| Gender | 2,416 | 450 | 0.958 | 100.0% |
| Age | 3,690 | 128 | 0.900 | 96.6% |
| Environment | 2,322 | 280 | 0.939 | 100.0% |
| Religion | 3,408 | 102 | 0.879 | 91.1% |
| Country | 14,262 | 33 | 0.594 | 4.2% |

**The critical finding:** Country-level segments (n ≈ 33 on average) have noise floors well below our 0.70 threshold — only 4.2% of country-level pairs have sufficient sample sizes for reliable evaluation. Given that country segments make up the bulk of our evaluation data, this means **nearly half of all segment-question pairs are in a quality zone where sampling noise alone could explain model score differences.**

Categories with large sample sizes (AI concern, gender, environment) are reliably evaluable. Age and religion are mostly fine. But any model ranking driven primarily by country-level accuracy should be treated skeptically.

### Analysis 3: Pairwise Model Significance — Most Differences Are Real

Of 273 model pairs tested (24 models × 23 / 2, minus pairs with fewer than 3 shared questions):

- **239 (87.5%) are significantly different** at α = 0.05 after Holm-Bonferroni correction
- All significant pairs had adjusted p < 0.0001 (permutation test with 10,000 iterations)
- 34 pairs are **not** significantly different

This is a positive finding: despite the noise floor concerns, most model differences are large enough to be statistically significant. The leaderboard ranking is largely robust — models are not interchangeable, even if none of them beat the population marginal baseline. The 34 non-significant pairs typically involve models with very similar architectures or models with limited shared evaluation data.

**Note:** Statistical significance does not imply practical importance. Many significant differences are tiny (0.001–0.005 in JSD similarity), well within what a user would consider equivalent performance.

### Analysis 4: Context Responsiveness — The Headline Finding

This is the most methodologically interesting analysis and required careful handling of multiple comparisons. The question: **when we give a model more demographic context questions in its prompt, does its prediction accuracy improve?**

We evaluated models across 5 context levels (0, 3, 5, 10, and all available context questions per segment) using GD5 and GD6 data.

#### Overall (per-model) results

| Model | Observed Slope | Adjusted p | Significant? |
|-------|---------------|------------|-------------|
| GPT-5 | +0.00387 | 0.0000 | **Yes** |
| Qwen3-32B | +0.00318 | 0.0000 | **Yes** |
| Claude 3.7 Sonnet | +0.00152 | 0.0000 | **Yes** |
| GPT-5.1 | +0.00033 | 0.0756 | No |
| All other models (21) | negative slopes | — | No |

**Three of 24 models** show statistically significant improvement with more context, after Holm-Bonferroni correction across all 24 tests. The other 21 models show flat or negative slopes — more context either doesn't help or slightly hurts their predictions.

#### The multiple comparisons problem at the category level

The per-model results above are correctly controlled for multiple comparisons. But the natural next question — "does context help for *specific* demographic categories?" — introduces a much larger comparison space. With 24 models × 6 categories, we're making 144 implicit comparisons. Without correction, we'd expect ~7 false positives at α = 0.05.

**We ran independent permutation tests (10,000 iterations each) for every model × category pair, then applied Holm-Bonferroni jointly across all 93 testable pairs.** This is a strict correction: a raw p-value of 0.01 might need to survive multiplication by 90+ to remain significant.

#### Category-level results after joint correction

Of 93 model × category pairs tested, **only 8 survived** the joint Holm-Bonferroni correction:

| Category | Model | Slope | Adjusted p |
|----------|-------|-------|------------|
| Country | Qwen3-32B | +0.00299 | 0.0000 |
| Country | GPT-5 | +0.00264 | 0.0000 |
| Country | Claude 3.7 Sonnet | +0.00131 | 0.0000 |
| Religion | GPT-5 | +0.00921 | 0.0000 |
| Religion | Claude 3.7 Sonnet | +0.00181 | 0.0000 |
| Gender | Claude 3.7 Sonnet | +0.00267 | 0.0000 |
| Environment | Claude 3.7 Sonnet | +0.00237 | 0.0000 |
| Environment | GPT-5 | +0.00421 | 0.0430 |

#### Notable casualties of the correction

Several results that *looked* significant in isolation were correctly identified as potential false positives:

- **Qwen3-32B × Gender** — raw slope +0.00319, raw p = 0.055 → adjusted p = 1.0 (261 data points, too few)
- **GPT-5 × Gender** — raw slope +0.00313, raw p = 0.019 → adjusted p = 1.0 (270 data points, didn't survive 93-test correction)
- **GPT-5.1 × Gender** — raw slope +0.00148, raw p = 0.004 → adjusted p = 0.36 (966 data points, but effect too small for the correction)

These are exactly the kind of results that would appear in an uncorrected analysis and be reported as "GPT-5 shows significant context benefit for gender predictions" — when in fact the signal isn't strong enough to distinguish from chance across the full space of comparisons we're making.

#### Interpreting the surviving results

**Claude 3.7 Sonnet** is the most consistent context-responder, with significant positive slopes in 4 of 6 categories (country, religion, gender, environment). This suggests a genuine capability rather than a lucky result in one category.

**GPT-5** shows the strongest individual effects (religion slope of +0.009 is the largest observed), significant in 3 categories (country, religion, environment). The religion effect is particularly large — GPT-5's predictions improve substantially when told the religious background of the respondents.

**Qwen3-32B** only survives correction for country-level predictions, despite having large positive slopes in other categories. The difference is statistical power: Qwen3-32B only has data at 2 of the 5 context levels (fewer evaluation runs), giving the permutation test less data to work with.

#### What the negative slopes mean

21 of 24 models show negative overall slopes — they get *slightly worse* with more context. This is not statistically significant (none of the negative slopes survive even uncorrected testing), but the direction is notable. It suggests that for most models, additional demographic context acts as noise rather than signal. The model doesn't know what to do with "this person is Buddhist, urban, aged 18-25" and the additional prompt text may slightly confuse its predictions.

#### The effect sizes are small

Even for the significant models, the slopes are on the order of +0.001 to +0.004 per context question. With context levels ranging from 0 to ~10 questions, the total gain from maximal context is roughly +0.01 to +0.04 in JSD similarity. This is detectable with our large sample sizes but represents a tiny practical improvement. The context responsiveness capability exists but is not yet strong enough to meaningfully change model rankings.

---

## Updated Assessment: Answering the Original Questions

The introduction to this document posed four questions a rigorous reviewer would ask. We can now partially answer them:

### 1. "What is the null distribution of scores?"

**Answered.** The uniform baseline scores 0.647, the population marginal 0.833, and the shuffled null 0.761. All tested models score between 0.68 and 0.77, meaning they beat uniform and shuffled baselines but **fall short of the population marginal**. The meaningful signal in current model scores is the gap above shuffled (0.761), which ranges from -0.08 to +0.007.

### 2. "Are model score differences statistically significant?"

**Answered.** 87.5% of pairwise model differences are statistically significant after Holm-Bonferroni correction (permutation test, 10,000 iterations). The ranking is largely real, even though all models underperform the population marginal.

### 3. "How much of the observed fairness gap is attributable to ground truth sampling error?"

**Partially answered.** The noise floor analysis shows that country-level segments (the largest category) have insufficient sample sizes for reliable evaluation. Fairness gaps involving country segments should not be trusted. Gender, age, environment, and AI concern categories have adequate data quality. Formal bootstrap CIs on fairness gaps (Option 2/7 from the plan) remain unimplemented.

### 4. "What is the test-retest reliability?"

**Not yet answered.** This requires repeated model evaluations (Option 3), which has not been run due to API costs.

### New finding not originally scoped

**Context responsiveness has a genuine but small signal for a few models.** Three models (GPT-5, Qwen3-32B, Claude 3.7 Sonnet) show statistically significant improvement with more demographic context, and 8 model × category pairs survive joint multiple-comparisons correction. The effect sizes are small but the statistical methodology is sound — these results are robust to the "cast a wide enough net" concern.

---

## Remaining Work

The following analyses from the original plan have not yet been implemented:

| Analysis | Status | Priority |
|----------|--------|----------|
| Null baselines (Option 1) | **Done** | — |
| Analytical noise floor (Option 5) | **Done** | — |
| Pairwise significance (Option 4) | **Done** | — |
| Context responsiveness significance | **Done** (new, not in original plan) | — |
| Bootstrap CIs on ground truth (Option 2) | Not started | High — would give CIs on all scores |
| Sample-size-weighted aggregation (Option 6) | Not started | Medium — may change rankings |
| Fairness gap significance (Option 7) | Not started | Medium — needed for fairness claims |
| Test-retest reliability (Option 3) | Not started | High — requires API budget |
| Prior-round predictor (Option 1d) | Not started | Low — nice-to-have temporal baseline |
