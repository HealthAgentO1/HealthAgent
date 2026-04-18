# Two-Round AI Question System Implementation Summary

## Overview
Implemented an intelligent symptom assessment system that uses AI to ask targeted follow-up questions to narrow down possible diagnoses. The system intelligently decides whether to ask follow-up questions based on how broad the initial diagnosis list is, and can skip the second round entirely if sufficient information is already available.

## Files Created

### Backend Files

#### 1. `api/views_symptom.py` (NEW)
Three new API endpoints:
- `/api/symptom-check/start/` - Initial symptom assessment
- `/api/symptom-check/<id>/followup/` - Get AI-generated follow-up questions
- `/api/symptom-check/<id>/finalize/` - Finalize assessment with results

#### 2. `api/services/symptom_llm.py` (NEW)
LLM service class with methods:
- `assess_initial_symptoms()` - Analyzes symptoms and determines if follow-up needed
- `generate_followup_questions()` - Creates targeted questions to narrow diagnosis
- `generate_final_assessment()` - Produces final triage and recommendations

Features:
- Validates LLM responses for required fields
- Implements error handling with fallbacks
- Loads system prompt from file
- Uses OpenAI API (configurable endpoint)

#### 3. `api/prompts/symptom_chat_system.txt` (NEW)
System prompt that guides the LLM to:
- Emphasize not providing diagnoses
- Use evidence-based medical knowledge
- Be conservative with urgency assessments
- Structure responses in strict JSON format
- Consider red flags and risk factors

#### 4. `api/services/__init__.py` (NEW)
Package initialization file

### Frontend Files

#### 1. `frontend/src/symptomCheck/symptomLlmClient.ts` (NEW)
API client functions:
- `startSymptomCheck()` - Initiates assessment
- `getFollowupQuestions()` - Requests follow-up questions
- `finalizeAssessment()` - Gets final results

Type definitions:
- `InitialAssessment`
- `FollowupQuestion`
- `FollowupQuestionResponse`
- `FinalAssessment`
- `PossibleCondition`

#### 2. `frontend/src/symptomCheck/types.ts` (NEW)
TypeScript types and utilities:
- `FlowStep` - Flow state type
- `AssessmentState` - Component state interface
- `getTriageLevelColor()` - UI utility
- `getTriageLevelLabel()` - Display label utility

#### 3. `frontend/src/symptomCheck/validatePayloads.ts` (NEW)
Validation functions for LLM responses:
- `validateInitialAssessment()`
- `validateFollowupQuestionResponse()`
- `validateFinalAssessment()`

Features:
- Type checking
- Required field validation
- Enum value validation
- Graceful error handling

#### 4. `frontend/src/symptomCheck/parseLlmJson.ts` (NEW)
JSON parsing utility:
- `parseLlmJson()` - Extracts JSON from text, handles partial responses

#### 5. `frontend/src/pages/SymptomCheckPage.tsx` (UPDATED)
Complete rewrite with 4-step flow:

**Step 1: Intake**
- Symptom description textarea
- Insurance provider selection
- Manual insurance input for "Other"

**Step 2: Initial Questions (Loading State)**
- Shows initial assessment summary
- Lists possible conditions being considered
- Button to proceed to follow-up

**Step 3: Follow-up (Conditional)**
- Dynamically renders AI-generated questions
- Supports 4 question types:
  - Multiple choice
  - Yes/No
  - Scale (1-10)
  - Text input
- Only shown if AI determines follow-up needed

**Step 4: Results**
- Triage level banner (Emergency/Urgent/Routine)
- List of possible conditions with likelihood
- Key findings
- Recommendations
- Nearby hospitals
- Cost estimates by insurance plan

### Configuration

#### `backend/settings.py` (UPDATED)
Added OpenAI configuration:
- `OPENAI_API_KEY` - API key from environment
- `OPENAI_BASE_URL` - Optional custom endpoint
- `OPENAI_MODEL` - Model to use (default: gpt-4)

#### `api/urls.py` (UPDATED)
Added three new URL routes:
- `symptom-check/start/` - POST to start assessment
- `symptom-check/<id>/followup/` - POST to get follow-up questions
- `symptom-check/<id>/finalize/` - POST to finalize assessment

### Documentation

#### `docs/two-round-question-system.md` (NEW)
Comprehensive documentation including:
- Flow architecture and decision points
- API endpoint specifications
- Frontend implementation details
- Example scenario walkthrough
- Triage level definitions
- Question generation strategy
- Error handling approach
- Future enhancement ideas

## Key Features

### 1. Intelligent Two-Round System
- **Round 1**: AI analyzes initial symptoms and decides if more questions help
- **Round 2 (Optional)**: AI generates 2-4 targeted questions if needed
- **Smart Skip**: Skips follow-up entirely if diagnosis is already narrow or clear

### 2. Dynamic Question Generation
- Questions target specific differentiating features between conditions
- Questions probe for red flags that might elevate triage level
- Questions adapt to user's initial symptoms

### 3. Flexible Question Types
- Multiple choice with 2+ options
- Yes/No binary questions
- 1-10 severity scales
- Free text responses

### 4. Comprehensive Assessment
- Initial assessment with confidence level
- Follow-up reasoning explaining question selection
- Final triage level determination
- Likelihood-based condition ranking
- Key findings and recommendations

### 5. Robust Validation
- Validates all LLM responses before display
- Requires specific JSON structure
- Type checking for all fields
- Graceful fallbacks for errors
- User-friendly error messages

### 6. UI Integration
- Four-step progressive disclosure
- Loading states with animated feedback
- Step progress indicator
- Error display in each step
- Restart functionality at any point

## Flow Decision Logic

```typescript
// Initial Assessment Decision
if (assessment.needs_followup === true) {
  // Proceed to follow-up questions step
  setStep("initial_questions");
} else {
  // Skip directly to results
  await handleFinalizeDirectly();
}

// Follow-up Response Decision
if (result.should_proceed_to_results === true || 
    result.questions.length === 0) {
  // Skip follow-up questions, finalize immediately
  await handleFinalize();
} else {
  // Show follow-up questions to user
  setStep("followup");
}
```

## Data Flow

```
User Input (Symptoms + Insurance)
    ↓
POST /symptom-check/start/
    ↓
Initial Assessment (LLM Analysis)
    ↓
Decision: needs_followup?
    ├─ NO → Finalize directly → Results
    └─ YES ↓
        POST /symptom-check/<id>/followup/
        ↓
        Follow-up Questions (Generated)
        ↓
        Decision: should_proceed_to_results?
        ├─ YES → Finalize → Results
        └─ NO ↓
            User Answers Questions
            ↓
            POST /symptom-check/<id>/finalize/
            ↓
            Final Assessment (LLM) → Results
```

## Environment Variables Required

```
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4  # or gpt-3.5-turbo, etc.
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional
```

## Testing Recommendations

1. **Test Path 1**: Symptoms that clearly point to one condition
   - Should skip follow-up questions
   - Should go directly to results

2. **Test Path 2**: Ambiguous symptoms requiring clarification
   - Should generate 2-4 follow-up questions
   - Questions should be relevant to possible conditions

3. **Test Path 3**: High-severity symptoms
   - Should assign emergency triage level
   - Should recommend immediate care

4. **Test Question Types**:
   - Multiple choice questions
   - Yes/No questions
   - Scale questions
   - Text questions

5. **Test Error Handling**:
   - Invalid LLM responses
   - Network timeouts
   - Missing API keys

## Next Steps (Future Enhancements)

1. **Real Provider Integration**
   - Connect to actual healthcare provider network
   - Enable direct scheduling

2. **Multi-language Support**
   - Generate questions in user's language
   - Support non-English responses

3. **Enhanced Context**
   - Include patient demographics
   - Factor in medication history
   - Incorporate lab results

4. **Analytics**
   - Track assessment accuracy
   - Monitor question effectiveness
   - Improve triage calibration

5. **Feedback Loop**
   - Collect user outcomes
   - Refine question generation
   - Improve condition ranking

## Files Modified
- `api/urls.py` - Added 3 new endpoints
- `backend/settings.py` - Added OpenAI configuration
- `frontend/src/pages/SymptomCheckPage.tsx` - Complete rewrite with AI integration

## Files Created
- `api/views_symptom.py` - New symptom assessment endpoints
- `api/services/symptom_llm.py` - LLM service implementation
- `api/services/__init__.py` - Package init
- `api/prompts/symptom_chat_system.txt` - LLM system prompt
- `frontend/src/symptomCheck/symptomLlmClient.ts` - API client
- `frontend/src/symptomCheck/types.ts` - TypeScript types
- `frontend/src/symptomCheck/validatePayloads.ts` - Response validation
- `frontend/src/symptomCheck/parseLlmJson.ts` - JSON parsing
- `docs/two-round-question-system.md` - Technical documentation
