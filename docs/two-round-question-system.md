# Two-Round AI Question System for Symptom Assessment

## Overview

This document describes the implementation of the two-round AI-powered symptom assessment system that narrows down possible diagnoses through intelligent follow-up questions.

## Flow Architecture

### Step 1: Intake (User Input)
- User enters symptom description
- User selects insurance provider
- User optionally provides additional details

### Step 2: Initial Assessment (LLM)
The backend AI analyzes the initial symptoms and:
1. Provides a summary of the symptoms
2. Generates initial list of 3-5 possible conditions
3. Determines if follow-up questions would help narrow the diagnosis
4. Returns `needs_followup: true/false` flag

**Decision Point:**
- If `needs_followup = true` → Proceed to Step 3 (Follow-up Questions)
- If `needs_followup = false` → Skip to Step 5 (Finalize & Results)

### Step 3: Follow-up Questions (LLM)
If the initial assessment indicates follow-up is helpful:
1. AI generates 2-4 targeted questions designed to differentiate between conditions
2. Questions are tailored to the specific possible conditions identified
3. Each question includes:
   - Question ID
   - Question text
   - Question type (multiple_choice, yes_no, scale, text)
   - Options (for multiple choice)
   - Purpose statement

**Follow-up Decision:**
- If the AI determines the list is already narrow enough → `should_proceed_to_results = true`
- If more information is needed → `should_proceed_to_results = false`

### Step 4: User Answers Follow-up Questions
- User responds to AI-generated questions
- Answers are collected and sent to backend for final assessment

### Step 5: Final Assessment & Results
The backend AI:
1. Analyzes all collected information (initial symptoms + follow-up answers)
2. Refines the list of possible conditions with likelihood levels
3. Assigns triage level (emergency/urgent/routine)
4. Provides key findings and recommendations
5. Returns final assessment data

## Backend Implementation

### Endpoint: `/api/symptom-check/start/`
**Method:** POST
**Input:**
```json
{
  "symptoms": "string describing symptoms",
  "insurance_details": {
    "plan": "plan name",
    "provider": "provider name"
  }
}
```

**Output:**
```json
{
  "session_id": number,
  "assessment": {
    "summary": "string",
    "possible_conditions": ["condition1", "condition2"],
    "needs_followup": boolean,
    "followup_areas": ["area1", "area2"],
    "confidence_level": "high|medium|low"
  },
  "needs_followup": boolean
}
```

### Endpoint: `/api/symptom-check/<session_id>/followup/`
**Method:** POST
**Input:**
```json
{
  "answers": {
    "field1": "value1"
  }
}
```

**Output:**
```json
{
  "questions": [
    {
      "id": "question_id",
      "question": "Question text",
      "type": "multiple_choice|yes_no|scale|text",
      "options": ["option1", "option2"],
      "purpose": "Why this question matters"
    }
  ],
  "reasoning": "Why these questions were chosen",
  "expected_impact": "How answers help narrow diagnosis",
  "should_proceed_to_results": boolean
}
```

### Endpoint: `/api/symptom-check/<session_id>/finalize/`
**Method:** POST
**Input:**
```json
{
  "final_answers": {
    "question_id": "answer",
    "another_id": "value"
  }
}
```

**Output:**
```json
{
  "triage_level": "emergency|urgent|routine",
  "possible_conditions": [
    {
      "condition": "name",
      "likelihood": "high|medium|low",
      "explanation": "why"
    }
  ],
  "key_findings": ["finding1", "finding2"],
  "recommendations": ["recommendation1"],
  "differential_diagnosis": "explanation",
  "urgency_explanation": "why this triage level"
}
```

## Frontend Implementation

### Component: `SymptomCheckPage.tsx`
Manages the full assessment flow with 4 steps:

1. **intake** - Initial symptom collection
2. **initial_questions** - Loading state while AI analyzes
3. **followup** - Shows AI-generated follow-up questions (skipped if not needed)
4. **results** - Final assessment and recommendations

### Key Functions:
- `handleStartAssessment()` - Initiates LLM assessment
- `handleRequestFollowup()` - Requests follow-up questions
- `handleFollowupAnswer()` - Records user answers
- `handleFinalize()` - Submits answers for final assessment
- `handleFinalizeDirectly()` - Skips follow-up and goes straight to results

### Smart Skip Logic:
```typescript
// If AI says no follow-up needed
if (validated.needs_followup === false) {
  await handleFinalizeDirectly(sessionId, assessment);
}

// If follow-up questions returned but AI says skip to results
if (validated.should_proceed_to_results === true) {
  await handleFinalize();
}
```

## AI System Prompt

Located in: `api/prompts/symptom_chat_system.txt`

Key directives for the LLM:
- Always emphasize not a diagnosis
- Use evidence-based medical knowledge
- Conservative with urgency (err on side of emergency care)
- Structure responses in required JSON format
- Focus on symptom patterns and red flags
- Consider patient risk factors

## Triage Levels

- **EMERGENCY**: Immediate threat to life
  - Examples: Chest pain, severe shortness of breath, sudden weakness
  
- **URGENT**: Needs evaluation within hours
  - Examples: Moderate pain not responding to medication, concerning symptoms in high-risk patients
  
- **ROUTINE**: Can be addressed in days/weeks
  - Examples: Mild symptoms, chronic conditions, preventive care

## Question Generation Strategy

When generating follow-up questions, the AI considers:

1. **Differentiating Features**: Questions that help distinguish between identified conditions
2. **Red Flags**: Questions about symptoms that might elevate triage level
3. **Risk Factors**: Questions about age, medical history, medications
4. **Symptom Severity**: Questions about progression, associated symptoms
5. **Functional Impact**: How symptoms affect the patient's ability to function

## Example Flow

### Scenario: User reports abdominal pain

**Initial Assessment:**
- Summary: "Right-sided abdominal pain with nausea"
- Possible conditions: ["Appendicitis", "Kidney stone", "Gastroenteritis"]
- needs_followup: true
- followup_areas: ["Fever status", "Pain characteristics", "Recent illnesses"]

**Follow-up Questions Generated:**
1. Do you have a fever? (yes_no)
2. Where exactly is the pain? (multiple_choice)
3. Is the pain constant or comes and goes? (multiple_choice)
4. Have you had any urinary symptoms? (yes_no)

**User Answers:**
- No fever
- Lower right quadrant
- Constant and worsening
- No urinary symptoms

**Final Assessment:**
- Triage level: "urgent"
- Most likely: "Acute appendicitis"
- Recommendations: "Seek evaluation at emergency department"

## Error Handling

- Invalid JSON responses from LLM: Falls back to defaults
- Missing required fields: Logs errors and uses fallback values
- API failures: Shows user-friendly error messages
- Network timeouts: Implements retry logic

## Future Enhancements

1. **Multi-language Support**: Generate questions and responses in different languages
2. **Gender/Age-Specific Variations**: Tailor questions based on demographics
3. **Medication Interactions**: Include current medications in assessment
4. **Lab Value Integration**: Factor in available lab results
5. **Conversation History**: Learn from previous interactions
6. **Provider Integration**: Connect to actual healthcare providers for follow-up
