# DTEF Project Context for Claude Code Agents

This document provides essential context for AI agents working on the Digital Twin Evaluation Framework (DTEF) platform.

## Project Overview

DTEF is a platform for evaluating the accuracy, adaptability, and equity of AI models in predicting demographic-specific survey response distributions. It is built by adapting the [weval](https://github.com/weval-org/app) evaluation platform.

**Repositories:**
- `dtef-app` - The evaluation platform (this repo, forked from weval)
- `dtef-configs` - Evaluation blueprints and survey data configurations

## Relationship to Weval

DTEF is a **modified fork of weval**. Key differences:

| Weval | DTEF |
|-------|------|
| Users create custom evaluation blueprints | System generates blueprints from survey data using pre-defined evaluation types |
| Generic model evaluation | Focused on demographic prediction accuracy |
| User-defined prompts/criteria | Pre-defined evaluation types with configurable parameters |
| Standard leaderboards | Demographic segment leaderboards |

**What to preserve from weval:**
- Evaluation execution infrastructure
- Scheduled evaluation runs from config repo
- Results storage and retrieval
- Core blueprint parsing/execution

**What needs modification or addition:**
- Survey data ingestion pipeline
- Blueprint generation from survey data
- Evaluation type system (pre-defined types)
- UI views for demographic leaderboards
- Results aggregation by demographic segment

## Initial Evaluation Type

The first evaluation type to implement is **Demographic Distribution Prediction**:

**Task:** Predict a demographic segment's response distribution for a poll question

**Input to Model:**
```
- Demographic profile (e.g., "Age: 18-25, Gender: Female, Country: Brazil")
- Context: N questions with response distributions for this segment
- Target question text and answer options
```

**Model Output:** Predicted percentage for each answer option

**Scoring:** Compare predicted vs actual distributions (MAE, Jensen-Shannon divergence)

**Configurable Parameters:**
- Number of target questions per evaluation
- Number of context questions provided
- Demographic detail level (single attribute vs multiple)

## Survey Data Format

Survey data should include:
- Poll questions with answer options
- Response counts/percentages by demographic segment
- Demographic segmentation variables (age, gender, country, etc.)

The platform should be **survey-agnostic** - not hardcoded to any specific survey format. Initial testing uses [Global Dialogues](https://github.com/collect-intel/global-dialogues) data.

## Architecture Considerations

### Modularity Requirements

1. **Evaluation Types:** Design as pluggable modules; new types can be added later
2. **Demographics:** Defined by survey data, not hardcoded in platform
3. **Survey Data:** Standard input format that works across different surveys
4. **Blueprint Generation:** Template-based generation from evaluation type + survey data

### Key Components to Build/Modify

1. **Survey Data Ingestion**
   - Parse structured survey data
   - Extract questions, options, demographic segments, distributions

2. **Blueprint Generation Service**
   - Take evaluation type + survey data
   - Generate weval-compatible blueprints
   - Create variants with different demographic specificity levels

3. **Evaluation Type Registry**
   - Define evaluation type interface
   - Register available evaluation types
   - Handle parameter configuration

4. **Results Aggregation**
   - Aggregate by demographic segment
   - Calculate segment-level metrics

5. **UI Modifications**
   - Demographic leaderboard views
   - Survey data upload interface
   - Evaluation type selection

## Implementation Approach

Development should be **incremental**:

1. Start with minimal working pieces that can be tested
2. Get basic evaluation running before building full UI
3. Don't try to build everything at once
4. Learn and adjust as testing reveals what works

## Open Questions / Areas of Uncertainty

- Exact weval infrastructure for scheduled runs may not be fully documented in this repo
- Some preliminary work exists but may be out of sync with current goals (was focused on individual participant predictions rather than demographic distributions)
- May need to clarify how weval runs evaluations if documentation is insufficient

## Key Files to Understand

Before making changes, review:
- `DTEF_OVERVIEW.md` - Full project description
- Existing weval code for evaluation execution
- Any existing DTEF-specific code (may be from earlier iteration)

## Success Criteria

1. Users can upload structured survey data
2. System generates evaluation blueprints from data
3. Evaluations run on schedule (like weval-configs)
4. Results stored and accessible
5. Demographic leaderboard views functional
6. Extensible for new evaluation types

## Testing Data

Initial testing uses Global Dialogues survey data, but implementation should not assume GD-specific structure. The data format should be specified separately and work for any compatible survey data.
