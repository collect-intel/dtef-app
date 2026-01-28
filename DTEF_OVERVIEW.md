

# Global Dialogues: Digital Twin Eval Framework

**An evaluation methodology to assess the accuracy, adaptability, and equity of AI in representing diverse global demographic perspectives.**



1. Why Digital Twins Evals matter

The concept of "**digital twins**"—AI models that can simulate and predict human responses or behaviors—is rapidly advancing.[^1] [^2] [^3] As these technologies emerge, a critical question arises: can these models truly and fairly represent the diverse tapestry of human experience, particularly across different demographic groups likely to be simulated by organizations modeling collective human behaviors? Without robust methods to verify this representative capability, we risk deploying AI systems that could be inaccurate, biased, or misaligned with the very populations they aim to serve.

Currently, a critical gap exists: there is no standardized methodology to rigorously assess how accurately these models can predict and represent the nuanced views of diverse demographic segments. The **Global Dialogues Digital Twins Evaluation Framework** (GD-DTEF) directly confronts this challenge. This verification is the bedrock upon which any subsequent use of AI for understanding or acting on behalf of diverse populations must be built.

If this project is successful, the implications are profound. Establishing that AI can faithfully represent varied demographic viewpoints opens transformative possibilities:



* **Enhancing understanding & trust: **It provides a pathway to understanding if and how AI models can serve as reliable proxies for diverse human perspectives, a prerequisite for users to trust AI systems to represent their viewpoints.
* **Enabling better collective deliberation:** Validated “representative models” lay the groundwork for new forms of scalable, legible, and inclusive deliberation: AI agents, each accurately reflecting the perspectives of different communities or individuals, engaging to explore complex issues and identify solutions or consensus points more holistically informed than those derived from existing democratic institutions or expert-driven processes.
* **Unlock value in applied domains:** Ultimately, the ability to create, validate, and trust AI models as representatives of diverse groups can translate into real-world impact: more responsive public services, efficient allocation of resources, quicker public and private policy feedback loops, lowered transaction costs,, deeper consumer understanding, new tools for civic engagement, and routes to depolarization.

The [Global Dialogues](https://globaldialogues.ai/) (GD) project, with its large-scale, demographically rich, unique and unprecedented question set, and longitudinal survey data, provides a unique and powerful foundation to address this challenge.



2. Goal

This project will develop and pilot the Global Dialogues Digital Twin Evaluation Framework (GD-DTEF). The GD-DTEF will be a concrete methodology to:



* Assess how effectively LLMs can **predict** the **agreement patterns** (for open-ended opinion questions) and **poll choices** of specific demographic segments.
* Identify the **conditions** (e.g., data volume, question types, demographic specificity) under which LLMs are most and least accurate in these predictions.
* Understand **which types** of questions (e.g., moral, consumer, personal, political) elicit responses that are most strongly differentiated by demographics and how well LLMs capture these nuances.
* Establish a baseline for comparing different LLMs and future iterations of models.
3. The Framework

The GD-DTEF will be a systematic process built upon the existing Global Dialogues [data infrastructure](https://github.com/collect-intel/global-dialogues).


### 3.1 Data



* **Source Data:** Primarily utilize the processed `GD&lt;N>_aggregate_standardized.csv` files from Global Dialogues cadences (e.g., piloting with GD4). This file provides aggregated agreement rates for *Ask Opinion* questions and choice percentages for *Poll Single Select* and *Poll Multi Select *questions, broken down by various demographic segments.
* **Demographic Segmentation:** Leverage the rich demographic data collected in GD surveys (e.g., age, gender, country, religion, urban/rural environment) to define target segments for prediction.
* **Ground Truth:** Actual response patterns from the `_aggregate_standardized.csv` will serve as the ground truth against which LLM predictions are compared. We acknowledge that for *Ask Opinion* questions, the "agreement rate" in the source data is itself an estimate derived from Remesh's platform. For individual participant predictions,, Responses to Polls are sourced from `_participants.csv`, preference votes on *Ask Opinion* questions from `_preference.csv`, and Agree/Disagree votes on *Ask Opinions* from `_binary.csv`.


### 3.2 Core Evaluation Tasks

**Task 1: Predicting Segment Agreement for "Ask Opinion" Questions:**



* **Input to LLM:**
    * demographic profile of a target segment
    * the text of an "Ask Opinion" question
    * a specific participant response (statement) to that question
    * [optional] some range of other question responses from a target segment or target participant
* **LLM Prediction:**
    * Option 1a: “Agree” or “Disagree” for a particular participant identified by sufficient additional question data.
    * Option 1b: Particular participant’s preferred response between two responses
    * Option 2: The percentage of the target demographic segment that would "Agree" with the given statement.
    * Option 3: Percent likelihood that an individual participant identified by the target demographic segment and any additional question data would “Agree” with the given statement. (Could be used to effectively do both Option 1 & 2)
* **Evaluation:** Compare the LLM's predicted vote/agreement rate/likelihood against the actual agreement rate for that segment and statement found in `GD&lt;N>_aggregate_standardized.csv` and votes in `GD&lt;N>_binary.csv` and `GD&lt;N>_preference.csv`.

**Task 2: Predicting Segment Choices for "Poll" Questions:**



* **Input to LLM:**
    * demographic profile of a target segment
    * the text of a Poll question
    * list of predefined answer options
    * [optional] some range of other question responses from a target segment or target participant
* **LLM Prediction:**
    * Option 1: Poll choice for a particular participant identified by sufficient additional question data
    * Option 2: The distribution of choices (percentage for each option) or the single most likely option chosen by the target demographic segment.
    * Option 3: Percent likelihood that an individual participant identified by the target demographic segment and any additional question data would select each Poll choice
* **Evaluation:** Compare the LLM's predicted distribution/choice/likelihood against the actual distribution/choice/likelihood for that segment and poll question found in `GD&lt;N>_aggregate_standardized.csv`.

**Task 3: Predicting Baseline Poll Shift from participating in a collective deliberation:**



* **Input to LLM:**
    * demographic profile of a target segment
    * text of the Baseline Poll question
    * list of predefined answer options
    * entirety of survey text experienced by participants from `GD&lt;N>_discussion_guide.csv`.
    * [optional] some range of other question responses from a target segment or target participant
* **LLM Prediction:**
    * Option 1: Change in poll choice for a particular participant identified by sufficient additional question data
    * Option 2: Change in distribution of choices or shift in average rating (if Poll choices are ordinal, esp. Likert scale) by the target demographic segment
    * Option 3: Change in percent likelihood that an individual participant identified by the target segment and additional question data would select each Poll choice
* **Evaluation: **Compare the LLM’s predicted change in distribution/choice/likelihood against the actual change in distribution/choice/likelihood for that segment and baseline poll questions found in `GD&lt;N>_aggregate_standardized.csv`.


### 3.3. Methodology:



* **Test Set Construction:** Curate a diverse test set of questions and demographic segments from the GD data, selecting questions across various domains.
* **Prompt Engineering:** Systematically test variations in prompt design (e.g., zero-shot, few-shot with examples from GD data) to understand their impact on prediction accuracy.
* **Assessing Prediction Adaptability (Sensitivity to In-Segment Data): **Evaluate how LLM predictions for a target demographic change as specific in-segment data (responses to other survey questions) is incrementally added. This will gauge the model's reliance on initial demographic assumptions versus its ability to adapt to additional evidence, and identify tendencies toward stereotypical reasoning (i.e., resistance to updating predictions).
* **Data Volume Experiments:** Investigate how the amount of contextual data (e.g., number of example responses provided to the LLM, number of additional question data points) influences performance.
* **Metric Development:** Employ clear quantitative metrics for measuring accuracy, such as Mean Absolute Error (MAE) or Root Mean Squared Error (RMSE) for agreement rates, and accuracy scores or distribution similarity measures (e.g., Jensen-Shannon divergence) for poll choices.
4.  Pilot Implementation: GD4

The [GD4](https://docs.google.com/document/u/0/d/1jBYa5cTbcTIThAo1MtAvGq0z0iV4W74WbDgbXGrKKfI/edit) round on Human-AI relationships will serve as the primary pilot for developing and testing the GD-DTEF.

Initial experimentation will be developed under the [digital-twins-eval](https://github.com/collect-intel/digital-twins-eval) project.



5. Defining Success: Key Outcomes

Success of the GD-DTEF will be measured by:



* **Validated Evaluation Framework:** The establishment of a robust, replicable, and well-documented framework for Digital Twin Evaluations
* **Model Performance Benchmarks:** Quantitative measures of current LLMs' ability to predict demographic-specific responses to questions
* **Identification of Predictive Factors:** Understanding which question domains, data configurations (e.g., minimum dataset size for prompting), and demographic characteristics yield the most (and least) accurate predictions.
* **Insights into Model Capabilities:** Deeper understanding of how LLMs process and generalize from demographic information and survey responses.
* **Dataset Differentiation:** Highlighting the unique value of the Global Dialogues dataset for this type of advanced AI evaluation by including a broad range of questions, including those on sensitive, novel, and “cutting-edge” new topics for which there is little existing data or documented opinion on.
6. Research Questions

This project aims to answer critical questions, like:



* How accurately can LLMs predict the collective responses of specific demographic groups?
* How accurately can LLMs predict the individual responses of individual survey participants?
* What is the minimal set of characteristic data (demographics, prior responses from similar groups or on related topics) required for an LLM to make reliable predictions for a target demographic segment?
* Which question domains (e.g., moral, consumer, personal, political, taboo) and types (poll vs. open-ended agreement) are most challenging for LLMs to predict across different demographics?
* How do variations in prompt engineering and the volume/nature of input data affect predictive accuracy?
* How responsive are LLM predictions to the incremental introduction of specific, in-segment data beyond an initial demographic profile? Specifically, how significantly and rapidly do models update their forecasts when presented with new evidence from within that group, providing a measure of their potential reliance on "stereotypes" versus their adaptability to nuanced data?
* Can the GD-DTEF reveal potential biases or stereotypical representations embedded in LLM predictions for certain demographic groups?
7. Open Questions

As this evaluation develops and research progresses, we anticipate exploring:



* What additional question domains or dimensions of human experience are crucial for a comprehensive evaluation?
* Should the eval prioritize highly specific predictions tied to individual GD rounds and participants, or aim for broader, more generalizable predictive capabilities across time and context?
* What is the optimal mix and utility of "Poll" question data (reflecting explicit individual choices) versus "Ask Opinion" question data (reflecting agreement with peer statements) in prompting LLMs?
* Potential integration of other relevant datasets to augment the evaluation or provide comparative benchmarks.
* The distinction and relationship between "collective digital twins" (predicting aggregate group behavior, our primary focus) and "sovereign digital twins" (predicting individual behavior, which presents greater data sparsity challenges within the current GD structure).
* How models handle "pluralistic flexibility" within defined demographic segments.
8. Risks
* **Data Representativeness:** Limitations in the representativeness of survey samples for highly specific or marginalized demographic segments. With a small sample size of ~1000 participants, demographic groups are highly sensitive to individual responses in a very *unrepresentative* way.
    * Mitigation: increase sample size, and only test on questions where “enough” data is collected (defined by stable error)
* **LLM prediction noise: **The open nature of the survey questions could make LLM predictions chaotically responsive to prompts, resulting in highly variable and seemingly random predictions
    * Mitigation: test with multiple prompts, use multiple tests per LLM with different `temperature`, and aggregate scores per model. Consider dropping questions or prompts with high variability across all models
9. Example Workflows


### Workflow 1: Predict Segment Agreement on “Ask Opinion” Questions



1. **Objective: **evaluate an LLM's ability to predict the percentage of a defined demographic segment that will "Agree" with a specific statement derived from a GD "Ask Opinion" question.
2. **Data Inputs:**
* Round: **GD4**
* Data file: `GD4_aggregate_standardized.csv`
* Target Demographic Segment: (based on available Poll segment questions), e.g “Age: 18-29, Country: Brazil, Environment: Urban”)
* Target “Ask Opinion” Questions & Response: select question and specific `Response`
    * Question: "What is your primary concern, if any, about the increasing use of AI in daily life?
    * Response: “My main concern is the potential for job displacement across many industries.”
* Ground Truth:
    * Option 1: Extract individual participant Agree/Disagree and Preference votes from `_preference` and `_binary` csv’s for **Task 1**. Extract individual Poll response choices from `_participants.csv` for Tasks **2** & **3**.
    * Options 2 & 3: Extract actual agreement percentage for chosen Response within target demographic segment (e.g. "Age: 18-29, Country: Brazil, Environment: Urban" and 62.5%) from `_aggregate_standardized.csv`
3. **LLM Interaction**
* LLM Input (Prompt Example - Zero-Shot):
* LLM Input (Prompt Example - Few-Shot):
    * Precede the above prompt with 2-3 examples of other questions, statements, segments, and their *actual* agreement rates from `GD4_aggregate_standardized.csv` to provide context. Ensure these examples are distinct from the test case.
* LLM Input (Prompt Example - Added Data Context):
    * For a range *N* indicating the amount of context to provide, append above prompt with additional *N* additional questions and responses from this demographic or individual participant
4. **Evaluation & Metrics:**
    * LLM Output: A percentage (e.g., `58.0`).
    * Comparison: Calculate difference between LLM prediction and ground truth.
        * Prediction: `58.0`
        * Ground Truth: `62.5`
    * Metrics (for this single prediction):
        * Absolute Error: `|58.0 - 62.5| = 4.5`
    * Overall Metrics (across many predictions):
        * Mean Absolute Error (MAE)
        * Root Mean Squared Error (RMSE)
    * Analysis
        * How does MAE, RMSE vary with prompt type, segment, segment specificity, question, range *N* of added question context?


### Workflow 2: Predict Segment Choice Distribution on Poll Questions



1. **Objective: **evaluate LLM's ability to predict the distribution of choices (or the most popular choice) made by a defined demographic segment for a Poll question
2. **Data Inputs:**
    1. Round: **GD4**
    2. Data file: `GD4_aggregate_standardized.csv`
    3. Target Demographic Segment: (based on available Poll segment questions), e.g., "Gender: Female, Religion: None, Age: 40-49”.
    4. Target Poll Questions & Options:
        1. Question: "How acceptable is it for an AI system to lie to a human if doing so would prevent immediate psychological harm to that human?”
        2. Options:
            1. Completely Unacceptable
            2. Somewhat Unacceptable
            3. Neutral / Not sure
            4. Somewhat Acceptable
            5. Completely Acceptable
    5. Ground Truth: From `_aggregate_standardized.csv`, for the target segment and question, extract the actual percentage of participants who selected each option.
        * Example distribution for "Gender: Female, Religion: None, Age: 40-49":
            * Completely Unacceptable: 10.0%
        * Somewhat Unacceptable: 35.0%
        * Neutral / Not sure: 30.0%
        * Somewhat Acceptable: 15.0%
        3. Completely Acceptable: 10.0%
        4. Alternatively extract individual Poll response choices from `_participants.csv` for Tasks **2** & **3**
3. **LLM Interaction**
    6. Similar prompts as above for Workflow 1, but with Poll Options
4. **Evaluation & Metrics:**
    7. LLM Output (Distribution): (e.g., Completely Unacceptable: 15%, etc)
    8. LLM Output (Most Likely): (e.g., "Somewhat Unacceptable")
    9. Comparison & Metrics:
        5. For Distribution:
            6. Mean Absolute Error (MAE) per option category
            7. Jensen-Shannon Divergence (or other distribution similarity metrics) between predicted and actual distributions
        6. For Most Likely:
            8. Accuracy (1 if correct, 0 if incorrect)
    10. Overall Metrics: Aggregate across many predictions
    11. Analysis: Similar to Workflow 1
1. Leaderboard

To translate this evaluation data into transparent benchmarks, we will develop a series of LLM performance leaderboards. These leaderboards will track model proficiency in accurately representing diverse demographic segments, drawing upon the full suite of metrics generated, including



* prediction accuracy for both "Ask Opinion" agreement rates and "Poll Single Select" choices
* prediction adaptability (or "stereotype sensitivity")
1. **Segment-Specific Performance Leaderboards:**

Granular insight into how well LLMs perform for distinct demographic segments (e.g., "Young Adults, Urban, Southeast Asia" or "Older Adults, Rural, Western Europe"). Models ranked by their aggregate prediction scores across relevant questions and sub-demographics within defined demographic segments.



2. **Overall Cross-Segment Performance Leaderboard:**

Assess an LLM's ability to consistently represent *all* targeted demographic segments, rather than excelling on average while failing specific groups. Rather than simple average, use metric engineered to reward models that demonstrate strong predictive performance consistently across the full spectrum of diverse segments.



3. **Population-Weighted Global Impact Leaderboard:**

Estimate how well LLMs serve the global population in aggregate, considering the varying sizes of different demographic groups. Model scores for each demographic segment weighted by the estimated real-world population size of that segment.


## Literature / References



* [A consistency evaluation method for digital twin models - ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0278612522001492)
* [[2411.10109] Generative Agent Simulations of 1,000 People](https://arxiv.org/abs/2411.10109)

<!-- Footnotes themselves at the bottom. -->
## Notes

[^1]:
     [https://med.stanford.edu/news/all-news/2025/04/digital-twin.html](https://med.stanford.edu/news/all-news/2025/04/digital-twin.html)

[^2]:
     [https://arxiv.org/abs/2411.10109](https://arxiv.org/abs/2411.10109)

[^3]:
     [https://market.us/report/digital-twin-simulation-market/#:~:text=In%20parallel%2C%20the%20Global%20AI,the%20forecast%20period%202025%E2%80%932034](https://market.us/report/digital-twin-simulation-market/#:~:text=In%20parallel%2C%20the%20Global%20AI,the%20forecast%20period%202025%E2%80%932034).
