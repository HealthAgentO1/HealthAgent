# Two-Round AI-Powered Symptom Assessment

## Feature Overview

This implementation adds an intelligent, AI-driven symptom assessment system that uses Deepseek API to:

1. **Analyze initial symptoms** and identify possible medical conditions
2. **Ask targeted follow-up questions** to narrow down the diagnosis (only when needed)
3. **Skip unnecessary questions** if the initial assessment is already clear
4. **Generate a final assessment** with triage level and recommendations

The system intelligently decides when follow-up questions would be valuable and when to proceed directly to results, making the assessment efficient while maintaining accuracy.

## Key Features

### ✨ Intelligent Two-Round Assessment
- **Round 1**: Initial symptom analysis with confidence assessment
- **Round 2** (Optional): AI-generated questions tailored to differentiate between conditions
- **Smart Skip**: Automatically skips follow-up if diagnosis is clear

### 🎯 Adaptive Question Generation
- Dynamically creates 2-4 questions targeting specific differentiating features
- Questions probe for red flags that affect triage level
- Supports multiple question types:
  - Multiple choice
  - Yes/No binary
  - Severity scales (1-10)
  - Free text responses

### 🚨 Emergency-Aware Triage
- Classifies into three levels: EMERGENCY, URGENT, ROUTINE
- Conservative assessment (prefers over-triage to under-triage)
- Color-coded UI banners for quick visual identification

### 🔍 Comprehensive Results
- List of possible conditions with likelihood (high/medium/low)
- Key findings from assessment
- Actionable recommendations
- Nearby hospital information
- Cost estimates by insurance plan

## Architecture

### Backend (Python/Django)

**New Files:**
- `api/views_symptom.py` - API endpoints
- `api/services/symptom_llm.py` - LLM service logic
- `api/prompts/symptom_chat_system.txt` - LLM system prompt
- `api/services/__init__.py` - Package initialization

**Modified Files:**
- `api/urls.py` - Added 3 new endpoints
- `backend/settings.py` - Added OpenAI configuration

**Endpoints:**
```
POST /api/symptom-check/start/
  → Initial symptom assessment

POST /api/symptom-check/<id>/followup/
  → Get AI-generated follow-up questions

POST /api/symptom-check/<id>/finalize/
  → Finalize assessment with results
```

### Frontend (React/TypeScript)

**New Files:**
- `frontend/src/symptomCheck/symptomLlmClient.ts` - API client
- `frontend/src/symptomCheck/types.ts` - TypeScript types
- `frontend/src/symptomCheck/validatePayloads.ts` - Response validation
- `frontend/src/symptomCheck/parseLlmJson.ts` - JSON parsing

**Modified Files:**
- `frontend/src/pages/SymptomCheckPage.tsx` - Complete rewrite with AI integration

**Features:**
- 4-step progressive flow (Intake → Initial Assessment → Follow-up → Results)
- Dynamic question rendering based on LLM response
- Real-time answer recording
- Error handling and recovery

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- PostgreSQL
- Deepseek API key

### Installation

1. **Set Environment Variables:**
   ```bash
   export DEEPSEEK_API_KEY="your-deepseek-api-key"
   export DEEPSEEK_API_BASE="https://api.deepseek.com"  # Default
   export DEEPSEEK_MODEL="deepseek-chat"  # Default
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   python manage.py migrate
   python manage.py runserver
   ```

3. **Frontend Setup:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Access the app:**
   - Open http://localhost:5173
   - Navigate to the Symptom Check page

## Usage Example

### User Flow:
1. **Enter symptoms:** "Sharp pain in lower right abdomen, nausea"
2. **Select insurance:** "United Healthcare"
3. **AI analyzes:** Generates initial assessment
4. **AI decides:** "Diagnosis could be appendicitis, kidney stone, or gastroenteritis - follow-up needed"
5. **Follow-up questions:**
   - "Where exactly is the pain?"
   - "Do you have a fever?"
   - "Any urinary symptoms?"
6. **User answers:** Provides additional information
7. **AI finalizes:** "Likely appendicitis, triage level: URGENT"
8. **Results shown:** Recommendations, nearby hospitals, cost estimates

### Smart Skip Example:
1. **Enter symptoms:** "Sudden severe chest pain, left arm radiating pain, shortness of breath"
2. **AI analyzes:** "Clear cardiac emergency pattern"
3. **Result:** Skip directly to EMERGENCY triage → "Call 911 immediately"

## API Response Examples

### Initial Assessment
```json
{
  "session_id": 123,
  "assessment": {
    "summary": "Right lower quadrant abdominal pain with nausea",
    "possible_conditions": ["Appendicitis", "Kidney stone", "Gastroenteritis"],
    "needs_followup": true,
    "followup_areas": ["Pain location", "Associated symptoms", "Fever status"],
    "confidence_level": "medium"
  },
  "needs_followup": true
}
```

### Follow-up Questions
```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Where exactly is your pain?",
      "type": "multiple_choice",
      "options": ["Upper right", "Lower right", "Lower left", "Center"],
      "purpose": "Appendicitis typically presents right lower quadrant"
    },
    {
      "id": "q2",
      "question": "Do you have a fever?",
      "type": "yes_no",
      "purpose": "Fever suggests infection, supporting appendicitis"
    }
  ],
  "reasoning": "These questions differentiate between appendicitis and other conditions",
  "should_proceed_to_results": false
}
```

### Final Assessment
```json
{
  "triage_level": "urgent",
  "possible_conditions": [
    {
      "condition": "Appendicitis",
      "likelihood": "high",
      "explanation": "Right lower quadrant pain, fever, and nausea fit classic pattern"
    },
    {
      "condition": "Kidney stone",
      "likelihood": "low",
      "explanation": "No urinary symptoms reported"
    }
  ],
  "key_findings": ["Right lower quadrant pain", "Fever present", "Nausea"],
  "recommendations": [
    "Seek immediate medical evaluation",
    "Emergency imaging recommended",
    "Avoid food/water until evaluated"
  ],
  "differential_diagnosis": "Pattern suggests acute appendicitis",
  "urgency_explanation": "Fever with localized abdominal pain requires urgent evaluation"
}
```

## Configuration

### Environment Variables
```env
# Required
DEEPSEEK_API_KEY=your-deepseek-api-key

# Optional
DEEPSEEK_MODEL=deepseek-chat  # Default: deepseek-chat
DEEPSEEK_API_BASE=https://api.deepseek.com  # Default endpoint
```

### Django Settings
```python
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_BASE = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
```

## File Structure

```
HealthAgent/
├── api/
│   ├── services/
│   │   ├── __init__.py
│   │   └── symptom_llm.py          # LLM service
│   ├── prompts/
│   │   └── symptom_chat_system.txt # System prompt
│   ├── views_symptom.py            # API endpoints
│   ├── urls.py                     # Updated with new routes
│   └── ...
├── backend/
│   ├── settings.py                 # Updated with OpenAI config
│   └── ...
├── frontend/
│   └── src/
│       ├── symptomCheck/
│       │   ├── symptomLlmClient.ts # API client
│       │   ├── types.ts            # TypeScript types
│       │   ├── validatePayloads.ts # Validation
│       │   ├── parseLlmJson.ts     # JSON parsing
│       │   └── __init__.py
│       ├── pages/
│       │   ├── SymptomCheckPage.tsx # Main component
│       │   └── SymptomCheckPage_old.tsx # Backup
│       └── ...
├── docs/
│   ├── two-round-question-system.md # Technical documentation
│   ├── flow-diagrams.md             # Visual diagrams
│   ├── implementation-summary.md    # Implementation details
│   ├── testing-guide.md             # Testing instructions
│   └── ...
└── ...
```

## Error Handling

The system includes comprehensive error handling:

1. **Validation Errors**
   - Checks required fields in LLM responses
   - Validates data types and enum values
   - Provides detailed error messages

2. **API Errors**
   - Network failure handling
   - Timeout recovery
   - Fallback to sensible defaults

3. **User Feedback**
   - Clear error messages
   - Recovery options
   - Ability to restart at any step

## Testing

Comprehensive testing documentation available in `docs/testing-guide.md`:

- **Manual Testing**: Step-by-step test scenarios
- **Automated Testing**: Example E2E test code
- **Edge Cases**: Error conditions and edge cases
- **Performance**: Load and response time tests
- **Browser Compatibility**: Cross-browser testing

## Documentation

Complete documentation available in `docs/`:

1. **two-round-question-system.md** - Technical architecture and design
2. **flow-diagrams.md** - Visual flow diagrams and state machines
3. **implementation-summary.md** - Implementation details and file structure
4. **testing-guide.md** - Testing procedures and success criteria

## Performance Considerations

- Initial assessment: ~3-5 seconds
- Follow-up question generation: ~2-3 seconds
- Final assessment: ~3-5 seconds
- Total flow: ~8-12 seconds (with follow-up)
- Total flow: ~6-8 seconds (skip follow-up)

### Optimization Tips
- Cache LLM responses when possible
- Implement request debouncing
- Use streaming responses for faster feedback
- Lazy load hospital/cost data

## Security

- All API endpoints protected by authentication (when enabled)
- No sensitive data stored in session logs
- HTTPS recommended for production
- API keys should never be exposed client-side
- Validate all user inputs server-side

## Future Enhancements

1. **Multi-Language Support** - Generate questions in different languages
2. **Medication Integration** - Factor in current medications
3. **Lab Value Support** - Incorporate available lab results
4. **Provider Integration** - Direct connection to healthcare providers
5. **Feedback Loop** - Learn from outcomes to improve accuracy
6. **Real-time Streaming** - Stream LLM responses for faster feedback

## Support

For issues or questions:
1. Check the testing guide for common issues
2. Review the flow diagrams for process understanding
3. Check API responses in browser DevTools
4. Enable console logging for debugging

## License

[Your License Here]

## Contributors

HealthAgent Development Team

---

**Status:** ✅ Ready for Testing
**Version:** 1.0
**Last Updated:** April 18, 2026
