# Survey Data to JSON Conversion Script Generation

## Your Task
You need to generate a Python script that converts survey data from CSV or SQLite database format into a specific JSON structure required by the Weval survey evaluation system.

## Context
The Weval system uses structured survey data to generate evaluation blueprints for testing AI models' ability to predict human survey responses. The system creates prompts that test whether models can accurately predict participant answers based on demographic information and other survey responses. Your script will transform raw survey data into the required JSON format.

## Required Output Structure
The Python script should produce a JSON file with the following structure:

```json
{
  "id": "string (unique identifier for the survey)",
  "title": "string (survey title)",
  "description": "string (optional survey description)",
  "demographicQuestions": [
    {
      "id": "string (e.g., 'age_group', 'gender', 'education')",
      "type": "single-select | multi-select | open-ended",
      "text": "string (the question text)",
      "options": ["array", "of", "options"] // only for select types
    }
  ],
  "surveyQuestions": [
    {
      "id": "string (e.g., 'q1', 'q2')",
      "type": "single-select | multi-select | open-ended | text-content",
      "text": "string (the question text or content)",
      "options": ["array", "of", "options"] // only for select types
    }
  ],
  "participants": [
    {
      "id": "string (e.g., 'p001', 'p002')",
      "demographics": {
        "age_group": "value",
        "gender": "value",
        // ... other demographic fields matching demographicQuestions ids
      },
      "responses": [
        {
          "questionId": "string (matching question id)",
          "answer": "string | array (single string for single-select/open-ended, array for multi-select)"
        }
      ]
    }
  ]
}
```

## Important Requirements

### 1. Data Structure Rules
- **No order field**: Questions are ordered by their position in the arrays
- **No duplication**: Demographics should only appear in the `demographics` object, not in `responses`
- **Readable keys**: Use descriptive keys like `age_group`, not `demo-age`
- **Text content**: Survey instructions or context should use type `text-content` (no responses expected)
- **Missing demographics**: Handle gracefully - empty string, null, or omit the field

### 2. Question Types
- `single-select`: One choice from options list, answer is a string
- `multi-select`: Multiple choices from options list, answer is an array of strings
- `open-ended`: Free text response, no options field, answer is a string
- `text-content`: Display text only (for instructions/context), no responses expected

### 3. Data Validation
The script should:
- Ensure all question IDs are unique
- Ensure all participant IDs are unique
- Validate that single-select answers match available options
- Validate that multi-select answers are arrays with valid options
- Skip responses to text-content items
- Handle missing responses gracefully
- Validate demographics match defined demographic questions

### 4. Common Data Sources

#### CSV Format
Typical survey CSV might have columns like:
- `participant_id` or `ResponseId`
- Demographic columns: `Age`, `Gender`, `Education`, `Country`, etc.
- Question columns: `Q1`, `Q2`, `Q3`, etc.
- Metadata: `Timestamp`, `Duration`, etc.

#### SQLite Database
Typical survey database might have tables like:
- `participants`: id, age, gender, education, etc.
- `questions`: id, text, type, options
- `responses`: participant_id, question_id, answer
- `survey_metadata`: title, description, created_at

## Script Requirements

Your Python script should:

1. **Accept input parameters**:
   - Input file path (CSV or SQLite .db)
   - Output JSON file path
   - Survey metadata (id, title, description)
   - Mapping configuration (which columns/fields map to which questions)

2. **Handle different formats**:
   ```python
   # Detect input format
   if input_path.endswith('.csv'):
       # Process CSV
   elif input_path.endswith('.db'):
       # Process SQLite
   ```

3. **Process demographics separately**:
   - Identify demographic columns/questions
   - Extract unique values for options (if single/multi-select)
   - Store in participant.demographics, not in responses

4. **Clean and validate data**:
   - Handle missing values
   - Normalize answer formats
   - Validate against options
   - Remove invalid responses

5. **Generate proper IDs**:
   - Create consistent participant IDs (e.g., 'p001', 'p002')
   - Create consistent question IDs (e.g., 'q1', 'q2' or descriptive like 'ai_trust')

## Example Usage

```python
python convert_survey_data.py \
  --input survey_responses.csv \
  --output survey.json \
  --survey-id "ai-attitudes-2024" \
  --survey-title "AI Attitudes Survey 2024" \
  --demographic-columns "Age,Gender,Education,Country" \
  --question-columns "Q1,Q2,Q3,Q4,Q5"
```

## Required Input Files

You should have been provided with the following files to complete this task:

1. **Type definitions** (`src/types/survey.ts`): Contains the exact TypeScript interfaces for the survey structure
2. **Example survey** (`example-survey.json`): A complete, valid example of the target JSON format
3. **Validator** (`src/cli/services/surveyValidator.ts`): Contains validation rules and requirements
4. **Actual survey data**: 
   - If CSV: First 10-20 rows of the actual data
   - If SQLite: Database schema and sample data
   - Survey codebook or column descriptions (if available)

If you do not have access to these files, please request them before proceeding. Specifically ask:
- "I need to see the TypeScript type definitions to ensure correct data structure"
- "I need the example-survey.json to understand the exact format required"
- "I need to see a sample of your actual survey data to understand its current structure"

## Additional Considerations

1. **Multi-select handling**: 
   - CSV might store as: "Option1;Option2;Option3" or "Option1|Option2"
   - Parse and convert to array format

2. **Missing responses**:
   - Might be empty string, "NA", "N/A", null, or missing
   - Only include actual responses in the responses array

3. **Question text**:
   - If not in data, might need separate mapping file
   - Maintain exact wording for evaluation accuracy

4. **Options extraction**:
   - For categorical questions, extract unique values as options
   - Maintain consistent ordering

5. **Special characters**:
   - Handle quotes, commas, newlines in CSV properly
   - Escape JSON special characters

## Output Validation

Your script should end with validation:
```python
# Validate the generated JSON
with open(output_path, 'r') as f:
    survey_data = json.load(f)
    
print(f"✓ Generated survey with:")
print(f"  - {len(survey_data['participants'])} participants")
print(f"  - {len(survey_data['demographicQuestions'])} demographic questions")
print(f"  - {len(survey_data['surveyQuestions'])} survey questions")
print(f"  - Output saved to: {output_path}")

# Optional: Run through validator if available
# validate_survey(survey_data)
```

## What You Should Generate

Create a Python script that:
1. Is well-documented with clear comments explaining each step
2. Handles errors gracefully with helpful error messages
3. Can be easily modified for different survey formats
4. Produces valid JSON that passes the Weval survey validator
5. Includes a requirements.txt file if any external libraries are needed (pandas, sqlite3, etc.)
6. Optionally includes a config file for complex column-to-question mappings

Base your script on the actual data format you've been provided. If you haven't been given the actual data yet, create a flexible template that can be easily adapted once you receive the data sample.

## Starting Point

Begin by examining the provided files (if available) and then generate the conversion script. If files are missing, request them first before proceeding with the script generation.