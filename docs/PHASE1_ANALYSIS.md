# Phase 1 Analysis: Survey Types Review

**Created:** 2025-02-04
**Task:** 1.1 - Review Current Survey Types
**Status:** Complete

---

## Overview

This document analyzes the existing survey type definitions in `src/types/survey.ts` to determine what modifications are needed to support DTEF's demographic aggregate evaluation approach.

---

## Current Type Analysis

### Question Types (Can Reuse)

```typescript
type QuestionType = 'single-select' | 'multi-select' | 'open-ended' | 'text-content';
```

**Assessment:** ✅ Can be reused as-is. These cover the main question types needed for demographic surveys.

### Survey Question Structure (Can Reuse)

```typescript
interface SingleSelectQuestion {
    id: string;
    type: 'single-select';
    text: string;
    options: string[];
}
```

**Assessment:** ✅ Can be reused as-is. The question structure with options is exactly what DTEF needs to define the possible responses.

### ParticipantResponse (NOT Suitable)

```typescript
interface ParticipantResponse {
    questionId: string;
    answer: string | string[] | null;  // Single answer
}
```

**Assessment:** ❌ Not suitable for demographics. DTEF needs response **distributions** (percentages), not individual answers.

**DTEF Needs Instead:**
```typescript
interface DemographicResponse {
    questionId: string;
    distribution: number[];  // e.g., [45.2, 30.1, 15.5, 9.2] for 4 options (must sum to ~100)
}
```

### Participant (NOT Suitable)

```typescript
interface Participant {
    id: string;
    demographics: Record<string, string | number | boolean>;
    responses: ParticipantResponse[];
}
```

**Assessment:** ❌ Not suitable for demographics. Models one person, not a demographic segment.

**DTEF Needs Instead:**
```typescript
interface DemographicSegment {
    id: string;
    label: string;  // e.g., "Men aged 18-29 in USA"
    attributes: Record<string, string>;  // e.g., { gender: "male", ageGroup: "18-29", country: "USA" }
    sampleSize: number;  // How many actual respondents this represents
    responses: DemographicResponse[];
}
```

### Survey (Partially Reusable)

```typescript
interface Survey {
    id: string;
    title: string;
    description?: string;
    demographicQuestions: SurveyQuestion[];
    surveyQuestions: SurveyQuestion[];
    participants: Participant[];  // NOT suitable
}
```

**Assessment:** ⚠️ Partially reusable. Question structure is good, but `participants` array needs replacement with demographic segments.

### SurveyBlueprintConfig (NOT Suitable)

```typescript
interface SurveyBlueprintConfig {
    survey: Survey;
    targetQuestionIds: string[];
    participantSelection?: 'all' | 'random' | 'first' | 'specific';
    participantCount?: number;
    participantIds?: string[];
    // ...
}
```

**Assessment:** ❌ Not suitable. Designed for selecting individual participants, not demographic segments.

**DTEF Needs Instead:**
```typescript
interface DTEFBlueprintConfig {
    surveyData: DTEFSurveyData;
    targetQuestionIds: string[];
    segmentSelection?: 'all' | 'specific';
    segmentIds?: string[];
    tokenBudget?: number;
    // ...
}
```

### GeneratedBlueprint (Needs Extension)

```typescript
interface GeneratedBlueprint {
    participantId: string;
    configId: string;
    configTitle: string;
    prompts: Array<{
        id: string;
        promptText: string;
        points: string[];
        idealResponse: string;  // Single correct answer
    }>;
}
```

**Assessment:** ⚠️ Needs extension. Currently stores one ideal response; DTEF needs to store expected distributions.

**DTEF Needs:**
```typescript
interface DTEFGeneratedBlueprint {
    segmentId: string;
    configId: string;
    configTitle: string;
    prompts: Array<{
        id: string;
        promptText: string;
        expectedDistribution: number[];  // e.g., [45.2, 30.1, 15.5, 9.2]
        optionLabels: string[];  // e.g., ["Strongly agree", "Agree", "Disagree", "Strongly disagree"]
    }>;
}
```

---

## Key Questions Answered

### 1. Does `Survey` type support aggregate response distributions?

**No.** The current `Survey` type stores individual participant responses as single answers, not percentage distributions across demographic segments.

### 2. Can `SurveyQuestion` hold percentage breakdowns by demographic?

**No.** `SurveyQuestion` defines the question structure (text, options) but doesn't hold responses at all. Responses are stored in `Participant` objects as individual answers.

### 3. Is `Participant` structure needed for demographic-aggregate approach?

**No.** The `Participant` structure models individual people. DTEF needs `DemographicSegment` structures that represent aggregate groups with response distributions.

---

## Recommendation

**Create new types in `src/types/dtef.ts`** rather than modifying existing types.

### Rationale

1. **Fundamentally Different Data Model:** DTEF uses distributions (percentages across options) while existing types use individual responses. These are incompatible approaches.

2. **Preserve Future Flexibility:** The existing participant-based types may be useful for future individual prediction features mentioned in the project plan.

3. **Clean Separation:** New types clearly indicate DTEF-specific functionality without confusion about backward compatibility.

4. **Incremental Migration:** New types can coexist with old types, allowing gradual migration.

### Types to Reuse

- `QuestionType` - import and use directly
- `SurveyQuestion` and variants - import and use for question definitions

### Types to Create New

- `DemographicSegment` - replaces `Participant`
- `DemographicResponse` - replaces `ParticipantResponse`
- `DTEFSurveyData` - replaces `Survey`
- `DTEFBlueprintConfig` - replaces `SurveyBlueprintConfig`
- `DTEFGeneratedBlueprint` - replaces `GeneratedBlueprint`
- `DistributionMetricResult` - new type for evaluation results

---

## Next Steps

1. **Task 1.2:** Design and implement `src/types/dtef.ts` with the new type definitions
2. **Task 1.3:** Assess existing `surveyBlueprintService.ts` for patterns to reuse
3. **Task 1.4:** Mark existing participant-based code as legacy

---

## Appendix: Current Types Location

**File:** `src/types/survey.ts`

**Line Count:** 89 lines

**Exports:**
- `QuestionType`
- `BaseQuestion`
- `SingleSelectQuestion`
- `MultiSelectQuestion`
- `OpenEndedQuestion`
- `TextContent`
- `SurveyQuestion`
- `ParticipantResponse`
- `Participant`
- `Survey`
- `SurveyBlueprintConfig`
- `GeneratedBlueprint`
