# DTEF Evaluation Methodology

## 1. Introduction

This document provides a detailed technical overview of the data processing pipeline, statistical methods, and scoring mechanisms used in the Digital Twin Evaluation Framework (DTEF). Its purpose is to ensure full transparency, enabling users and researchers to understand how our metrics are derived, and to be aware of the underlying assumptions and limitations of the approach.

DTEF is built on the [weval](https://github.com/weval-org/app) evaluation platform. It adapts weval's infrastructure for a specific class of evaluation: measuring how accurately AI models can predict the survey response distributions of diverse demographic groups.

## 2. Architecture and Data Flow

DTEF is a multi-stage pipeline that transforms structured demographic survey data into quantitative assessments of AI model prediction accuracy.

```
Survey Data (CSV/JSON)
    → Data Ingestion & Validation
    → Blueprint Generation (one per demographic segment)
    → Model Prediction (LLMs predict response distributions)
    → Distribution Comparison (predicted vs. actual)
    → Results Aggregation & Leaderboards
```

## 3. The Evaluation Pipeline

### 3.1. Data Ingestion

The platform accepts structured survey data in a standardized JSON format (`DTEFSurveyData`). This data contains:

*   **Poll questions** with predefined answer options.
*   **Demographic segments** defined by attributes (e.g., age, gender, country, religion, urban/rural environment).
*   **Response distributions** for each question within each segment, expressed as percentages across answer options.

For known data formats, adapters handle conversion automatically. The initial implementation includes an adapter for [Global Dialogues](https://globaldialogues.ai/) survey data, which provides demographically segmented poll responses from participants across multiple countries and rounds.

### 3.2. Blueprint Generation

From the ingested survey data, the system automatically generates evaluation blueprints—one per demographic segment.

Each blueprint contains a series of prompts, each structured as follows:

1.  **System prompt**: Instructs the model to act as a demographic survey analyst and to return a percentage distribution in a strict format.
2.  **Demographic profile**: Describes the target segment (e.g., "Age: 18–25, Gender: Female, Country: Brazil").
3.  **Context questions**: A configurable number of other poll questions and the segment's *actual* response distributions, provided as reference material for the model.
4.  **Target question**: The poll question the model must predict a distribution for, with its answer options listed.

The system enforces a **token budget** to ensure prompts remain within model context limits. If the requested context exceeds the budget, the number of context questions is reduced automatically.

### 3.3. Model Prediction

The generated blueprints are executed against multiple AI models. Each model receives the prompt and returns a predicted percentage distribution across the answer options. The system parses multiple response formats, including JSON arrays (`[45.2, 30.1, 15.5, 9.2]`), comma-separated values, percentage-annotated values, and labeled lists.

### 3.4. Scoring

The model's predicted distribution is compared to the actual (ground truth) distribution from the survey data using quantitative divergence and similarity metrics. The result is a score on a 0–1 scale where higher values indicate closer alignment between the model's prediction and reality.

## 4. Core Evaluation Metrics

### 4.1. Jensen-Shannon Distance (default)

The primary metric is based on the **Jensen-Shannon Distance (JSD)**, the square root of the Jensen-Shannon Divergence. It is a true metric (satisfies the triangle inequality) and produces scores in a more discriminative range than the raw divergence, which clusters near 1.0 for distributions that are even roughly similar.

*   **Process**: Both the predicted and actual distributions are normalized to sum to 1.0. The Jensen-Shannon Divergence is computed as the average of the Kullback-Leibler divergences of each distribution from their midpoint:
    ```math
    \text{JSD}(P \| Q) = \frac{1}{2} D_{\text{KL}}(P \| M) + \frac{1}{2} D_{\text{KL}}(Q \| M)
    ```
    Where $M = \frac{1}{2}(P + Q)$ and $D_{\text{KL}}$ is the Kullback-Leibler divergence using base-2 logarithms.

*   **Distance and similarity conversion**: The Jensen-Shannon Distance is $\sqrt{\text{JSD}}$, bounded in $[0, 1]$. The final similarity score is:
    ```math
    S = 1 - \sqrt{\text{JSD}(P \| Q)}
    ```
    A score of 1.0 indicates identical distributions; a score of 0.0 indicates maximally divergent distributions. Using the square root spreads scores across a wider range — e.g., a raw divergence of 0.04 yields a distance of 0.20, producing a similarity of 0.80 instead of 0.96.

*   **Why JS Distance**: Unlike KL divergence, JS divergence is symmetric ($\text{JSD}(P \| Q) = \text{JSD}(Q \| P)$) and always finite, even when one distribution assigns zero probability to an outcome. The square root makes it a proper distance metric and produces more meaningful score differentiation between models.

### 4.2. Cosine Similarity

An alternative metric that measures the angular similarity between two distribution vectors.

*   **Formula**:
    ```math
    \text{Cosine}(P, Q) = \frac{\sum_{i} P_i \cdot Q_i}{\sqrt{\sum_{i} P_i^2} \cdot \sqrt{\sum_{i} Q_i^2}}
    ```

*   **Interpretation**: Values range from 0 (orthogonal) to 1 (identical direction). Cosine similarity captures the *shape* of the distribution but is less sensitive to magnitude differences. This means a prediction that gets the relative ordering right but is off in absolute percentages may still score well.

### 4.3. Earth Mover's Distance Similarity

Also known as the 1D Wasserstein distance, this metric measures the minimum "work" required to transform one distribution into another.

*   **Process**: The cumulative distribution functions of both distributions are compared, and the total absolute difference is summed:
    ```math
    \text{EMD}(P, Q) = \sum_{i} \left| \text{CDF}_P(i) - \text{CDF}_Q(i) \right|
    ```

*   **Similarity conversion**: $S_{\text{EMD}} = \max(0, 1 - \text{EMD})$

*   **Why EMD**: EMD is sensitive to the *ordering* of categories. For ordinal scales (e.g., Likert-type responses from "Strongly Disagree" to "Strongly Agree"), EMD penalizes predictions that shift mass to distant categories more heavily than those that shift to adjacent ones. This makes it particularly suitable for opinion scales.

### 4.4. Response Parsing

Before scoring, the model's free-text response must be parsed into a numerical distribution. The parser handles several formats:

1.  **JSON arrays**: `[45.2, 30.1, 15.5, 9.2]`
2.  **Comma-separated values**: `45.2, 30.1, 15.5, 9.2`
3.  **Percentage-annotated**: `45.2%, 30.1%, 15.5%, 9.2%`
4.  **Labeled lists**: `a. Option A: 45.2%`

If parsing fails entirely, the prompt receives a score of 0. If the parsed distribution has a different number of elements than the expected distribution, it receives a score of 0.1 (partial credit for attempting a response).

## 5. Aggregate Statistical Measures

### 5.1. Model-Level Aggregation

For each model evaluated against a demographic segment, the platform calculates:

*   **Average similarity score** across all target questions in the blueprint.
*   **Parse rate**: The fraction of responses that could be successfully parsed into a distribution. This serves as a proxy for instruction-following ability.
*   **Per-question breakdown**: Individual scores for each target question, enabling identification of question types that are easier or harder to predict.

### 5.2. Demographic Leaderboards

The platform provides several aggregated views of model performance:

*   **Overall Leaderboard**: Models ranked by their average score across all demographic segments and all questions.
*   **Segment-Specific Leaderboards**: Performance within a single demographic segment (e.g., "Age 18–25, Urban"), revealing which models best represent specific communities.
*   **Cross-Segment Consistency**: Models ranked by the consistency of their performance across all segments, not just average accuracy. A model that performs uniformly across demographics may be more trustworthy than one with high average but uneven coverage.

### 5.3. Demographic Attribute Breakdown

Scores can be disaggregated by individual demographic attributes (age, gender, country, religion, etc.) to identify systematic biases. For example, a model might predict urban populations well but struggle with rural segments, or perform differently across religious groups.

## 6. Data Sources

### 6.1. Global Dialogues

The initial data source is [Global Dialogues](https://globaldialogues.ai/), a multi-round international survey on AI governance and societal attitudes. The dataset provides:

*   **Multiple rounds** (GD1–GD7, GD6UK) of survey data collected from participants worldwide.
*   **Demographic segmentation** across seven dimensions:
    *   O1: Language
    *   O2: Age group
    *   O3: Gender
    *   O4: Environment (urban/rural)
    *   O5: AI concern level
    *   O6: Religion
    *   O7: Country
*   **Standardized aggregate data** with percentage distributions and segment sample sizes.

### 6.2. Extensibility

DTEF is designed to be survey-agnostic. Any survey dataset that provides poll questions with predefined options and response distributions by demographic segment can be converted to the `DTEFSurveyData` format and evaluated. Custom adapters can be written for specific data sources.

## 7. Risks, Assumptions, and Limitations

### 7.1. Foundational Assumptions

*   **Assumption of representative ground truth**: The survey data used as ground truth is itself a sample. Small segment sample sizes may produce unstable distributions that are difficult for models to predict—not because the model lacks understanding, but because the ground truth is noisy.
*   **Assumption of metric appropriateness**: Different metrics capture different aspects of distributional similarity. JSD treats all category confusions equally; EMD respects ordinal ordering. The choice of metric influences which models appear to perform best.
*   **Assumption of context informativeness**: The evaluation assumes that providing a model with response distributions for other questions from the same demographic segment gives it meaningful signal. This may not hold for questions with low inter-question correlation.

### 7.2. Known Risks and Limitations

*   **Risk of stereotypical reasoning**: Models may rely on stereotypical associations (e.g., "young people think X") rather than genuinely learning from the provided context distributions. High accuracy does not necessarily imply faithful representation—it may reflect the model's prior biases aligning with survey data by coincidence.
*   **Risk of format sensitivity**: Scores are partly a function of the model's ability to follow formatting instructions (returning a valid distribution array). A model that reasons well but formats poorly will score lower than one that outputs clean numbers. The parse rate metric helps diagnose this, but does not fully resolve it.
*   **Risk of overinterpretation**: A model scoring 0.85 on JSD similarity does not mean it "understands" a demographic group. These scores measure distributional alignment on specific poll questions, not deep sociological insight.
*   **Data representativeness**: Survey data may not be representative of the broader populations described by the segment labels. Results should be interpreted as "prediction accuracy on this survey sample," not "ability to represent this demographic group in general."

### 7.3. Recommended Use

*   **Use as a screening tool**, not a certification. High scores indicate distributional alignment on the tested questions, not general representational fidelity.
*   **Always examine per-segment and per-question breakdowns.** Aggregate scores can mask important disparities.
*   **Consider the context volume.** Models given more context questions may perform better simply due to having more information, not due to superior reasoning.
*   **Compare across metrics.** If a model ranks highly on JSD but poorly on EMD, investigate whether it gets the general shape right but misplaces mass along the ordinal scale.
