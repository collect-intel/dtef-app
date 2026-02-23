# DTEF: Incorporating Statistical Rigor into the Platform UI

**Purpose:** Recommendations for how to surface statistical analysis findings in the digitaltwinseval.org/demographics UI to communicate accuracy, confidence, and methodological rigor to visitors.

---

## Part 1: High-Level Strategy

### Design Principles

1. **Progressive disclosure.** The default view should be clean and accessible. Statistical details (p-values, noise floors, methodology notes) should be available on demand — via tooltips, expandable panels, or a dedicated methodology section — not cluttering the primary leaderboard.

2. **Honest framing.** Our analysis shows no model yet outperforms the population marginal baseline (0.833 vs best model 0.768). The UI should not overstate model capabilities. Framing should emphasize "how well can models do this task?" rather than implying models are already good at it.

3. **Confidence indicators, not raw statistics.** Users care about "can I trust this number?" not "what's the Holm-Bonferroni adjusted p-value?" Surface confidence as visual indicators (icons, color bands, qualitative labels) with raw stats accessible on hover/click.

4. **Baseline anchoring.** Every score is more meaningful when anchored against something. The population marginal baseline (what you'd get ignoring demographics entirely) should always be visible as a reference line, so users can see whether a model is adding demographic-specific value.

5. **Data quality transparency.** Country-level segments (n~33, 30.7% reliable) are fundamentally different from environment segments (n~350, 100% reliable). The UI should make this visible so users don't over-interpret noisy results.

### What the Statistical Analysis Tells Us (Summary)

| Finding | Implication for UI |
|---------|-------------------|
| Population marginal (0.833) beats all models (best: 0.768) | Don't celebrate raw scores; show baseline comparison |
| 87.5% of model pairs are statistically distinguishable | Rankings are meaningful — models genuinely differ |
| Country segments have 30.7% reliable data quality | Flag low-sample segments with warnings |
| Only 3/24 models show significant context responsiveness | Context slopes should carry significance indicators |
| 8/93 model×category pairs survive joint correction | Category-level context claims need qualification |
| Noise floor varies dramatically by category | Per-category confidence indicators are warranted |

---

## Part 2: Specific UI Recommendations

### 2.1 Leaderboard Section — Baseline Reference Line

**Current state:** The leaderboard shows raw scores with colored bars (green ≥0.8, yellow ≥0.6, red <0.6). No baselines are shown.

**Problem:** A score of 0.768 looks good (green bar, high percentage) but is actually below the trivial population marginal baseline. Users may incorrectly conclude models are "good at this."

**Recommendation:**

- Add a **vertical reference line** on the ScoreBar component at the population marginal score (0.833). Label it "Population baseline" on hover. This immediately shows whether any model is adding value beyond knowing the overall population distribution.
- Add a second subtle reference line for the uniform baseline (0.647) as a "random guess" floor.
- Consider recoloring the bar: green only when above population marginal, yellow when between uniform and marginal, red below uniform. This shifts the framing from "absolute accuracy" to "value added."

**Implementation:** Modify `ScoreBar` component. The baselines are static values (computable from survey data or hardcoded initially). Add thin vertical marker lines at baseline positions within the progress bar.

**Data source:** Baselines can be computed from the DTEFSummary data already available in the API response, or added as new fields to the API.

### 2.2 Leaderboard Section — Confidence / Data Quality Column

**Current state:** Columns are Rank, Model, Score, Consistency (std dev), Segments.

**Recommendation:** Add a **"Data Quality"** or **"Confidence"** indicator column that reflects the noise floor for the segments underlying each model's score. When filtered to a specific category (e.g., Country), this would show the average noise floor for that category's segments.

**Visual treatment:**
- High confidence (noise floor >0.85): solid filled circle or checkmark
- Medium confidence (0.70–0.85): half-filled circle or dash
- Low confidence (<0.70): warning icon or empty circle
- Tooltip on hover explains: "Based on sample sizes of the underlying survey segments. Higher = more trustworthy."

**When category-filtered to Country:** The indicator would show low confidence (avg noise floor 0.640), immediately signaling to users that country-level rankings should be interpreted cautiously.

### 2.3 Context Responsiveness Section — Significance Indicators

**Current state:** The Context Responsiveness section shows slopes per model (positive = improves with more context). No significance testing is surfaced.

**Problem:** Users might interpret any positive slope as meaningful, when most slopes are not statistically significant. Only 3 of 24 models show significant context responsiveness.

**Recommendation:**

- Add a visual significance indicator next to each model's slope value. For the 3 significant models, show a filled indicator or asterisk. For non-significant slopes, show the slope value in muted/gray text.
- Add a brief explanatory note: "Only slopes marked with ★ are statistically significant after correction for multiple comparisons (permutation test, Holm-Bonferroni α=0.05)."
- In the per-category drill-down (if implemented), show which model×category pairs survived joint correction (8 of 93).

**Data source:** Significance results would need to be either:
  - Computed at aggregation time and stored in DTEFSummary, or
  - Computed client-side from the raw data (less ideal — permutation tests are expensive), or
  - Pre-computed by the statistical analysis script and stored as a separate JSON artifact that the API serves

**Recommended approach:** Pre-compute during the statistical analysis pipeline and store as a supplementary JSON file alongside the report. The demographics API can optionally serve this data.

### 2.4 Segment Explorer — Sample Size Warnings

**Current state:** The Segment Explorer allows drilling into per-segment scores for each model. It shows segment labels, scores, and run-level data.

**Recommendation:** When viewing segments with low sample sizes (n < threshold for noise floor 0.70), show a subtle warning indicator:
- Small "(n=33)" badge next to segment name
- Tooltip: "This segment has a small sample size. Score differences of ±X% could be due to sampling noise rather than real model differences."

The noise floor formula (`1 - sqrt((k-1) / (2n × ln2))`) is simple enough to compute client-side given n and k (both available in the data).

### 2.5 New Section: Methodology & Transparency Panel

**Current state:** No methodology explanation on the demographics page.

**Recommendation:** Add a collapsible "About This Evaluation" or "Methodology" section, either at the top (collapsed by default) or at the bottom of the page. This section would include:

1. **What we measure:** Brief explanation of the evaluation task (predicting demographic response distributions)
2. **How scores work:** What JSD similarity means, what 0.0 vs 1.0 represents
3. **Baselines explained:** What the population marginal and uniform baselines are and why they matter
4. **Data quality:** How sample size affects reliability, what the noise floor means
5. **Context responsiveness:** What it means for a model to be "evidence-adapting" vs "stereotype-holding"
6. **Statistical rigor:** Brief note on permutation testing and multiple comparison correction
7. **Link to full report:** Link to the detailed statistical validity report (can be a static page or downloadable markdown)

This directly addresses the goal of building confidence that the framework is "mathematically rigorous, robust, defensible, and thoughtfully implemented."

### 2.6 Fairness Analysis — Qualified Interpretations

**Current state:** The Fairness Analysis table shows disparity gaps (best segment − worst segment) per model and category.

**Recommendation:** Add noise-floor-informed qualification:
- For categories with high data quality (environment, gender, AI concern): show gaps with full confidence
- For categories with low data quality (country, religion): show gaps with a caveat icon and note: "Large gaps in this category may partly reflect sampling noise due to small segment sizes (avg n=33)"

This prevents users from over-interpreting fairness gaps that could be artifacts of small samples.

### 2.7 Future: Statistical Summary Cards

As the platform matures, consider a row of summary cards at the top of the demographics page:

| Card | Content |
|------|---------|
| **Models Tested** | "24 models evaluated" |
| **Best vs. Baseline** | "Best model: 92% of population baseline" (0.768/0.833) |
| **Data Quality** | "55% of segment pairs have high data quality" |
| **Context Effect** | "3 models show significant improvement with more context" |

These provide an at-a-glance executive summary before users dive into tables.

---

## Part 3: Data Pipeline Changes Needed

### 3.1 What's Already Available

The current demographics API (`/api/demographics`) returns DTEFSummary data including:
- Model scores, segment breakdowns, runs with context counts
- Context responsiveness slopes
- Fairness disparities (gaps)
- Segment attributes with IDs

### 3.2 What Needs to Be Added

| Data Point | Source | Delivery Mechanism |
|-----------|--------|-------------------|
| Population marginal baseline | Computable from survey data at aggregation time | Add to DTEFSummary |
| Uniform baseline | Trivially computable (depends only on k) | Compute client-side |
| Noise floor per segment | Computable from n and k | Compute client-side from sample sizes (need to add sample size to segment data) |
| Context responsiveness p-values | Permutation test (expensive) | Pre-compute in statistical analysis script, store as JSON |
| Significant model pairs | Permutation test | Pre-compute, store as JSON |
| Sample sizes per segment | Already in survey data | Add to SegmentScore in API response |

### 3.3 Recommended Implementation Order

1. **Baseline reference lines** (low effort, high impact) — hardcode initial values, later compute dynamically
2. **Methodology section** (low effort, high credibility impact) — static content, no data pipeline changes
3. **Sample size / noise floor indicators** (medium effort) — add n to API response, compute noise floor client-side
4. **Context responsiveness significance** (medium effort) — pre-compute JSON from analysis script, serve from API
5. **Statistical summary cards** (low effort once data is available) — depends on items 1, 3, 4
6. **Score bar recoloring** (low effort) — depends on item 1

---

## Part 4: Review Against DTEF Goals and Findings

### Alignment with DTEF Overview Goals

| DTEF Goal | How These Recommendations Address It |
|-----------|-------------------------------------|
| "Assess how well AI models can predict and represent views of different demographic groups" | Baseline anchoring directly shows whether models add value beyond trivial predictions |
| "Evidence-adapting vs. stereotype-holding" | Context responsiveness significance indicators distinguish real adaptation from noise |
| "Which demographic segments are most challenging" | Noise floor indicators expose where data quality limits our ability to evaluate |
| "Report confidence intervals" (Risk mitigation) | Data quality column and sample size warnings directly address this stated risk |
| "Demographic leaderboards aggregating performance by segment" | Enhanced with baselines, confidence, and methodology — not just raw rankings |

### Alignment with Statistical Findings

| Finding | UI Recommendation | Consistency Check |
|---------|-------------------|-------------------|
| Population marginal beats all models | Baseline reference line shows this gap | Consistent — doesn't hide the finding |
| Country segments unreliable (30.7%) | Category-filtered data quality indicators | Consistent — warns when viewing country data |
| Only 3 models significant for context | Significance markers on context slopes | Consistent — prevents overinterpretation of non-significant slopes |
| 87.5% model pairs distinguishable | Rankings are meaningful (no change needed) | Consistent — the leaderboard ordering is well-supported |
| Most models have negative context slopes | Muted/gray rendering for non-significant negative slopes | Consistent — discourages reading into noise |
| 8/93 model×category pairs survive correction | Category drill-down shows significance | Consistent — honest about which findings hold up |

### Potential Concerns

1. **Showing that models underperform the baseline could discourage visitors.** Mitigation: Frame positively as "the gap to close" and emphasize that this is early data from the first evaluations. The evaluation framework itself has value even when models aren't yet performing well — it establishes what "good" looks like.

2. **Statistical terminology could intimidate non-technical users.** Mitigation: Progressive disclosure. Default view uses simple visual indicators (icons, colors). Technical details available on hover/click. Methodology section at bottom for those who want depth.

3. **Pre-computing significance adds pipeline complexity.** Mitigation: Start with hardcoded values from the current analysis run. Automate later when the evaluation pipeline is more mature. The statistical analysis script already outputs all needed data.

### What These Recommendations Don't Cover (Future Work)

- **Population baseline blueprint variant:** A zero-demographic-context evaluation would allow direct measurement of whether demographics help or hurt. The current analysis approximates this with the population marginal baseline but doesn't test the model directly. Once implemented, the UI should show a "with demographics" vs "without demographics" comparison view.
- **Cross-round temporal analysis:** With GD1-GD7 data, future analysis could show whether model performance changes across survey rounds. The UI could eventually include a time-series view.
- **Demographic combinations:** Testing intersectional demographics (age × gender × country) would require a more complex segment explorer. The current single-category analysis is a good starting point.

---

## Implementation Status (2026-02-23)

### Implemented

| Recommendation | Status | Implementation Details |
|----------------|--------|----------------------|
| **2.1 Baseline reference lines** | **Implemented** | `ScoreBar` component now accepts optional `baselines` prop with `populationMarginal` and `uniform` scores. Renders thin vertical markers at baseline positions within the progress bar. Legend below leaderboard table shows baseline values. |
| **2.1 Score bar recoloring** | **Implemented** | When baselines are available, bar color is now relative to population marginal: green = above marginal, yellow = within 90% of marginal, red = below 90%. Falls back to absolute thresholds when baselines are not yet available. |
| **2.5 Methodology section** | **Implemented** | Collapsible "About This Evaluation" section at bottom of demographics page. Covers: what is measured, baseline comparisons, fairness analysis interpretation, and limitations (sample size caveats, JSD properties). |

### Implemented via Backend (data pipeline, not yet visible in UI without baseline results in S3)

| Recommendation | Status | Implementation Details |
|----------------|--------|----------------------|
| **Baseline data pipeline** | **Implemented** | `DTEFSummary.baselines` field added with `populationMarginal` and `uniform` scores. `buildDTEFSummary()` extracts these from `baseline:population-marginal` and `baseline:uniform` model results when present. CLI command `dtef generate-baseline` produces synthetic WevalResult files. |
| **Population marginal as pipeline model** | **Implemented** | `baselineGeneratorService.ts` generates synthetic WevalResult files for population-marginal and uniform predictors. Results flow through normal aggregation pipeline and appear on leaderboard. |

### Partially Implemented / Deferred

| Recommendation | Status | Notes |
|----------------|--------|-------|
| **2.2 Data quality column** | **Deferred** | Noise floor computation is available in `statisticalAnalysis.ts` (`computeNoiseFloorValue`). Requires sample sizes per segment in the API response; these are available in survey data but not yet propagated through the aggregation pipeline to the UI. |
| **2.3 Context responsiveness significance** | **Deferred** | Permutation tests run in `pnpm analyze:stats` script and produce results in the report, but significance data is not yet served via API. Would require pre-computed JSON artifact served by demographics API. |
| **2.4 Sample size warnings** | **Deferred** | Sample sizes are in survey data but not yet included in `SegmentModelScore`. The noise floor formula and weighted aggregation functions exist in `statisticalAnalysis.ts` for when this is connected. |
| **2.6 Fairness gap qualification** | **Deferred** | Category-stratified comparison analysis exists in the statistical analysis pipeline. Noise-floor-informed caveats could be added once sample sizes flow through to the UI. |
| **2.7 Statistical summary cards** | **Deferred** | Depends on baselines being visible and sample sizes being available. All underlying data exists in the analysis pipeline. |

### Related Statistical Analysis Work (Completed)

These analyses were implemented as part of the statistical infrastructure build-out. They produce data used by the above recommendations:

1. **Gap decomposition** (`statisticalAnalysis.ts`): Decomposes prediction errors into directional accuracy and magnitude calibration relative to population marginal.
2. **Bootstrap confidence intervals** (`statisticalAnalysis.ts`): Multinomial bootstrap resampling for CIs on JSD similarity scores.
3. **Category-stratified marginal comparison** (`statistical-analysis.ts`): Compares model-vs-marginal broken down by demographic category.
4. **Sample-size-weighted aggregation** (`statisticalAnalysis.ts`): sqrt(n) weighting functions for giving more influence to well-sampled segments.
5. **Shift evaluation type** (`demographicBlueprintService.ts`): New `--eval-type shift` provides population marginal in prompt and asks models to adjust for demographics.

## Summary

The core strategy is: **anchor scores against baselines, qualify results by data quality, mark statistical significance, and explain methodology** — all while keeping the default view clean and accessible. These changes transform the demographics page from a raw leaderboard into a credible, transparent evaluation dashboard that honestly communicates both what models can and cannot do.
