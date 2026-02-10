

# Digital Twin Evaluation Framework (DTEF)

**A platform for evaluating the accuracy, adaptability, and equity of AI models in representing diverse demographic perspectives.**

## Overview

DTEF is an open-source evaluation platform built on top of [weval](https://github.com/weval-org/app) that enables systematic assessment of how well AI models can predict and represent the views of different demographic groups. The platform consists of two repositories:

- **dtef-app**: The evaluation platform (forked from weval)
- **dtef-configs**: Repository for DTEF evaluation blueprints and survey data configurations

## 1. Why Digital Twin Evals Matter

The concept of "**digital twins**"—AI models that can simulate and predict human responses or behaviors—is rapidly advancing.[^1] [^2] [^3] As these technologies emerge, a critical question arises: can these models truly and fairly represent the diverse tapestry of human experience, particularly across different demographic groups likely to be simulated by organizations modeling collective human behaviors? Without robust methods to verify this representative capability, we risk deploying AI systems that could be inaccurate, biased, or misaligned with the very populations they aim to serve.

Currently, a critical gap exists: there is no standardized methodology to rigorously assess how accurately these models can predict and represent the nuanced views of diverse demographic segments. The **Digital Twin Evaluation Framework** (DTEF) directly confronts this challenge. This verification is the bedrock upon which any subsequent use of AI for understanding or acting on behalf of diverse populations must be built.

If this project is successful, the implications are profound. Establishing that AI can faithfully represent varied demographic viewpoints opens transformative possibilities:

* **Enhancing understanding & trust:** It provides a pathway to understanding if and how AI models can serve as reliable proxies for diverse human perspectives, a prerequisite for users to trust AI systems to represent their viewpoints.
* **Enabling better collective deliberation:** Validated "representative models" lay the groundwork for new forms of scalable, legible, and inclusive deliberation: AI agents, each accurately reflecting the perspectives of different communities or individuals, engaging to explore complex issues and identify solutions or consensus points more holistically informed than those derived from existing democratic institutions or expert-driven processes.
* **Unlock value in applied domains:** Ultimately, the ability to create, validate, and trust AI models as representatives of diverse groups can translate into real-world impact: more responsive public services, efficient allocation of resources, quicker public and private policy feedback loops, lowered transaction costs, deeper consumer understanding, new tools for civic engagement, and routes to depolarization.

Survey datasets like [Global Dialogues](https://globaldialogues.ai/) provide demographically rich data that can serve as ground truth for these evaluations.



## 2. Goal

DTEF is a platform that enables users to:

* **Upload structured survey data** with demographic segmentation and response distributions
* **Generate evaluation blueprints** automatically from survey data using pre-defined evaluation types
* **Run evaluations** on multiple AI models to assess their demographic prediction accuracy
* **View results** through specialized UI views including demographic segment leaderboards

The platform assesses:

* How effectively LLMs can **predict** the **response distributions** of specific demographic segments for poll questions
* The **conditions** (e.g., context volume, demographic specificity) under which LLMs are most and least accurate
* Which **question types** and **demographic segments** are most challenging for LLMs to predict accurately
* Comparative performance across different LLMs and model versions

## 3. The Framework

DTEF is built as a platform on top of weval, adapting its evaluation infrastructure for demographic prediction tasks.

### 3.1 Data Requirements

DTEF accepts structured survey data containing:

* **Poll questions** with predefined answer options
* **Response distributions** broken down by demographic segments (e.g., percentage of each segment selecting each option)
* **Demographic segmentation variables** (e.g., age, gender, country, religion, urban/rural)

The platform is designed to be survey-agnostic—any properly formatted survey data can be used, though initial development uses [Global Dialogues](https://github.com/collect-intel/global-dialogues) data for testing.

### 3.2 Evaluation Types

DTEF uses pre-defined **evaluation types** rather than user-defined prompts. The system generates evaluation blueprints automatically based on the selected evaluation type and survey data.

**Primary Evaluation Type: Demographic Distribution Prediction**

This evaluation type assesses an AI model's ability to predict a demographic segment's distribution of responses to poll questions.

* **Input to LLM:**
    * Demographic profile of a target segment (e.g., "Age: 18-25, Gender: Female, Country: Brazil")
    * Context: response distributions for other questions from that demographic segment
    * Target poll question text and answer options
* **LLM Output:** Predicted percentage distribution across answer options
* **Evaluation:** Compare predicted vs. actual distributions using metrics like Jensen-Shannon divergence or MAE

**Variable Settings:**

| Setting | Description |
|---------|-------------|
| Questions to evaluate | How many poll questions to ask the model to predict at a time |
| Context questions | How many questions and their response distributions to provide as context |
| Demographic detail level | Granularity of demographic specification (e.g., "Age: 18-25" vs "Age: 18-25, Gender: Female, Religion: None") |

The system automatically generates multiple evaluation variants with varying demographic specificity levels.

**Core Research Design: Varying-Context Comparison**

A central research dimension of DTEF is comparing model performance at **different levels of provided context**. The platform generates multiple blueprint sets for the *same* segment + question combinations, but with different amounts of context questions (other survey question distributions) provided as input:

| Context Level | Description | What It Measures |
|---------------|-------------|------------------|
| **Zero context** | Only demographic attributes + target question | Baseline: model's priors/stereotypes about this demographic |
| **Low context** | A few other question distributions provided | Whether models begin adapting to evidence |
| **Full context** | All available question distributions (up to token budget) | Maximum evidence-informed prediction |

This enables measuring two key model behaviors:

* **Evidence-adapting**: The model improves its predictions when given more evidence about how this demographic actually responds to other questions. Performance improves with more context.
* **Stereotype-holding**: The model ignores provided evidence and relies on prior assumptions about the demographic. Performance stays flat or doesn't improve with added context.

The **delta between zero-context and full-context performance** for a given model is a key metric: it quantifies the degree to which a model can genuinely learn from demographic response patterns rather than relying on stereotypical priors. A model that performs well with zero context but doesn't improve with full context may be applying stereotypes that happen to be accurate — the context comparison helps distinguish this from genuine evidence-based reasoning.

### 3.3 Methodology

* **Blueprint Generation:** The system automatically generates weval-compatible blueprints from survey data based on selected evaluation types
* **Scheduled Evaluations:** Blueprints in dtef-configs are run on a scheduled basis (similar to weval-configs)
* **Results Storage:** Evaluation results are stored and made available through the platform UI
* **Metric Development:** Clear quantitative metrics including MAE, RMSE, and Jensen-Shannon divergence for distribution comparisons

## 4. Architecture

DTEF leverages the weval platform infrastructure while adding:

* **Survey data ingestion** pipeline for structured demographic survey data
* **Blueprint generation** from survey data using evaluation type templates
* **Demographic leaderboard views** aggregating performance by segment
* **Extensible evaluation types** for future expansion



## 5. Success Metrics

Success of DTEF will be measured by:

* **Functional Platform:** A working evaluation platform that can ingest survey data, generate blueprints, run evaluations, and display results
* **Model Benchmarks:** Quantitative measures of LLM ability to predict demographic-specific responses
* **Demographic Leaderboards:** Aggregated views of model performance across demographic segments
* **Extensibility:** Clear patterns for adding new evaluation types and supporting new survey data formats

## 6. Research Questions

DTEF aims to enable investigation of:

* How accurately can LLMs predict the collective responses of specific demographic groups?
* What context (amount, type) is required for reliable demographic predictions?
* Which demographic segments and question types are most challenging?
* Do models show evidence of stereotypical reasoning vs. data-adaptive predictions?
* **How does prediction accuracy change as more context is provided?** (The "evidence-adapting vs. stereotype-holding" question: comparing zero-context, low-context, and full-context performance for the same model, segment, and question to measure whether models genuinely incorporate provided demographic evidence or default to stereotypical priors.)

## 7. Risks

* **Data Representativeness:** Small sample sizes for specific demographic segments can lead to unstable ground truth distributions
    * Mitigation: Only test on segments with sufficient sample size; report confidence intervals
* **LLM Prediction Noise:** Models may produce highly variable predictions across runs
    * Mitigation: Aggregate scores across multiple runs; use consistent temperature settings

## 8. Example Workflow: Distribution Prediction

**Objective:** Evaluate an LLM's ability to predict how a demographic segment will respond to a poll question.

**Process:**
1. **Input Survey Data:** Structured data with poll questions and response distributions by demographic segment
2. **Generate Blueprint:** System creates evaluation prompts with context questions and target questions
3. **Run Evaluation:** Model receives demographic profile, context distributions, and predicts target distribution
4. **Score Results:** Compare predicted vs. actual distributions using JSD or MAE

**Example:**

*Context provided to model:*
```
Demographic: Age 18-25, Female, Urban
Q1 "Should AI be used in hiring decisions?" → Strongly Agree: 15%, Agree: 25%, Neutral: 30%, Disagree: 20%, Strongly Disagree: 10%
Q2 "Do you trust AI recommendations?" → Strongly Agree: 10%, Agree: 35%, Neutral: 25%, Disagree: 20%, Strongly Disagree: 10%
```

*Target question:*
```
Q3 "Would you use an AI therapist?" → Predict distribution
```

*Model output:* `Strongly Agree: 8%, Agree: 22%, Neutral: 35%, Disagree: 25%, Strongly Disagree: 10%`

*Actual:* `Strongly Agree: 12%, Agree: 28%, Neutral: 30%, Disagree: 22%, Strongly Disagree: 8%`

*Score:* Calculate MAE or JSD between predicted and actual distributions

**Varying-Context Comparison:**

The same evaluation is run at multiple context levels to measure evidence-adaptation:

| Blueprint Variant | Context Provided | Purpose |
|-------------------|-----------------|---------|
| `gd4-age:18-25` (zero-context) | None — only demographic + target question | Baseline stereotype measure |
| `gd4-age:18-25-ctx` (full-context) | Q1, Q2, Q4–Q116 distributions for this segment | Evidence-informed prediction |

By comparing the same model's JSD score on the zero-context vs. full-context variant for the same question and segment, DTEF measures how much a model benefits from (or ignores) provided demographic evidence.

## 9. Leaderboards

DTEF provides specialized leaderboard views for analyzing model performance:

**Segment-Specific Leaderboards:** How well each model performs for specific demographic segments (e.g., "Age 18-25, Urban" or "Age 50+, Rural")

**Cross-Segment Consistency:** Models ranked by their ability to perform consistently across *all* demographic segments, not just on average

**Overall Performance:** Aggregate scores across all evaluations

## References

* [Generative Agent Simulations of 1,000 People](https://arxiv.org/abs/2411.10109)
* [Digital Twin Simulation Market Report](https://market.us/report/digital-twin-simulation-market/)
* [Stanford Digital Twin Research](https://med.stanford.edu/news/all-news/2025/04/digital-twin.html)

[^1]: https://med.stanford.edu/news/all-news/2025/04/digital-twin.html
[^2]: https://arxiv.org/abs/2411.10109
[^3]: https://market.us/report/digital-twin-simulation-market/
