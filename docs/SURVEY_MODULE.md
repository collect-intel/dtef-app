# Survey to Blueprint Module

This module enables converting structured survey data into Weval Blueprints to evaluate AI models' ability to predict survey responses based on participant demographics and previous answers.

## Data Structure

### Survey Format

The survey data structure supports:
- **Poll questions** (single-select and multi-select)
- **Open-ended questions**
- **Text content** (contextual information between questions)
- **Demographic information** (flexibly defined)

See `src/types/survey.ts` for the complete type definitions.

### Example Survey Structure

```json
{
  "id": "survey-001",
  "title": "AI Acceptance Survey",
  "demographicQuestions": [
    {
      "id": "age",
      "type": "single-select",
      "text": "What is your age group?",
      "options": ["18-25", "26-35", "36-45", "46+"]
    }
  ],
  "surveyQuestions": [
    {
      "id": "q1",
      "type": "single-select",
      "text": "How do you feel about AI?",
      "options": ["Positive", "Neutral", "Negative"]
    }
  ],
  "participants": [
    {
      "id": "p001",
      "demographics": {
        "age": "18-25",
        "gender": "Female"
      },
      "responses": [
        { "questionId": "q1", "answer": "Positive" }
      ]
    }
  ]
}
```

## CLI Commands

### Generate Example Survey
```bash
pnpm cli survey example -o example-survey.json
```

### Validate Survey Data
```bash
pnpm cli survey validate -s survey-data.json
```

### Generate Blueprints
```bash
# Basic generation
pnpm cli survey generate -s survey.json -t q3

# With demographics and specific participants
pnpm cli survey generate \
  -s survey.json \
  -t q3 q4 \              # Target questions to predict
  -x q1 q2 \              # Context questions to include
  -d age gender \         # Include specific demographics
  -p random \             # Participant selection (all/random/first/specific)
  -n 10 \                 # Number of participants
  -o ./blueprints         # Output directory
```

### Configuration File

You can also use a configuration file:

```yaml
# survey-config.yml
targetQuestionIds:
  - q3
  - q4
contextQuestionIds:
  - q1
  - q2
includeDemographics:
  - age
  - gender
  - country
participantSelection: random
participantCount: 10
modelConfig:
  models:
    - openai:gpt-4o-mini
    - anthropic:claude-3-5-haiku-latest
  temperature: 0.7
  judgeModels:
    - openai:gpt-4o
blueprintTemplate:
  responseFormat: letter-only
```

Then run:
```bash
pnpm cli survey generate -s survey.json -c survey-config.yml
```

## Generated Blueprint Format

The module generates standard Weval Blueprints with:

1. **Demographics Context**: Optional demographic profile in the prompt
2. **Survey Context**: Previous survey responses as context
3. **Target Question**: The question to predict
4. **Evaluation Points**: Automatically generated based on the participant's actual response
5. **Should Not Points**: Incorrect options the model should avoid

### Example Generated Prompt

```
Imagine you are a person who fits the following demographic profile:
    - Age: 18-25
    - Gender: Female
    - Country: United States

You participate in a survey and respond to the following questions with the answers indicated.

<SURVEY>
1. How acceptable is it for people to develop emotional connections with pets?
    a. Completely Acceptable ✓
    b. Mostly Acceptable
    c. Neutral / No Opinion
    d. Mostly Unacceptable
    e. Completely Unacceptable
    Answer: Completely Acceptable

2. How acceptable is it for people to develop emotional connections with plants?
    a. Completely Acceptable
    b. Mostly Acceptable ✓
    c. Neutral / No Opinion
    d. Mostly Unacceptable
    e. Completely Unacceptable
    Answer: Mostly Acceptable
</SURVEY>

How would you most likely respond to the following question?
3. How acceptable is it for people to develop emotional connections with AI chatbots?
    a. Completely Acceptable
    b. Mostly Acceptable
    c. Neutral / No Opinion
    d. Mostly Unacceptable
    e. Completely Unacceptable
```

## Implementation Options

Currently, this module implements **Option #1**: generating individual Blueprints for each participant. This approach:
- Creates separate Blueprint files for each participant
- Stores them in a specified output directory
- Creates an index file for easy navigation

### Future Enhancement: Template Mode (Option #2)

A future enhancement could introduce a Blueprint template type that supports "mail merge" functionality:
- Single template with placeholders
- Dynamic evaluation at runtime
- More efficient for large surveys
- Would require Blueprint parser updates

## API Usage

```typescript
import { SurveyBlueprintService } from '@/cli/services/surveyBlueprintService';
import { SurveyBlueprintConfig } from '@/types/survey';

// Import survey data
const surveyJson = await fs.readFile('survey.json', 'utf-8');
const survey = SurveyBlueprintService.importSurveyData(surveyJson);

// Configure generation
const config: SurveyBlueprintConfig = {
  survey,
  targetQuestionIds: ['q3'],
  includeDemographics: true,
  participantSelection: 'random',
  participantCount: 10
};

// Generate blueprints
const blueprints = await SurveyBlueprintService.generateBlueprints(config);

// Save blueprints
for (const blueprint of blueprints) {
  await fs.writeFile(`${blueprint.configId}.yaml`, yaml.dump(blueprint));
}
```

## Testing

Run tests with:
```bash
pnpm test:cli -- surveyBlueprintService
```

The test suite covers:
- Blueprint generation for different participant selections
- Demographics inclusion
- Context question handling
- Evaluation point generation for different question types
- Survey data import/export validation