# System Architecture

```mermaid
flowchart TD
    FE["React / TypeScript frontend\nSurvey-style symptom check, medication input, reports"]
    API["Django REST API\nAuth, orchestration, session state, DB"]

    FE --> API

    API --> S1["Symptom-to-Care Agent\nTriage → provider → insurance → booking"]
    API --> S2["Medication Safety Agent\nExtract → check interactions → alert"]

    S1 --> A1["Core AI Agent (LLM)\nSymptom Triage & Extraction"]
    S1 --> A2["NPPES\nFind providers"]
    S1 --> A3["User Input\nInsurance Form"]

    A1 & A2 & A3 --> B1["Booking + pre-visit report\nMock or real integration, PDF/structured output"]

    S2 --> B2["Lexigram\nNLP extraction"]
    S2 --> B3["openFDA\nInteractions, recalls"]
    S2 --> B4["Alerts\nProvider / pharmacy"]

    B2 & B3 & B4 --> C1["Monitoring + safer alternatives\nOngoing checks, alert logic, suggestions"]

    B1 --> DB["Shared DB + user context\nPostgreSQL — patient profile, history, sessions"]
    C1 --> DB

    style S1 fill:#1D9E75,color:#fff,stroke:#0F6E56
    style A1 fill:#5DCAA5,color:#085041,stroke:#1D9E75
    style A2 fill:#5DCAA5,color:#085041,stroke:#1D9E75
    style A3 fill:#5DCAA5,color:#085041,stroke:#1D9E75
    style B1 fill:#5DCAA5,color:#085041,stroke:#1D9E75

    style S2 fill:#D85A30,color:#fff,stroke:#993C1D
    style B2 fill:#F0997B,color:#4A1B0C,stroke:#D85A30
    style B3 fill:#F0997B,color:#4A1B0C,stroke:#D85A30
    style B4 fill:#F0997B,color:#4A1B0C,stroke:#D85A30
    style C1 fill:#F0997B,color:#4A1B0C,stroke:#D85A30
```

## Symptom survey and LLM (frontend + Django)

The **Symptom Check** flow (`/symptom-check`) is a **three-step survey** in React: intake (free text + insurer), dynamic follow-up questions, then illustrative differentials and facility/cost sections.

- **Prompts** for the survey live in `frontend/src/symptomCheck/prompts/` (`followup_context.txt`, `results_context.txt`). The SPA loads them at build time (Vite `?raw`), sends them as `system_prompt` on each call, and sends structured `user_payload` (symptoms, insurer label, and follow-up answers on the second call).
- **Runtime:** the SPA `POST`s to **`/api/symptom/survey-llm/`** (`SymptomSurveyLlmView`) with `{ phase, system_prompt, user_payload }`, using **`apiClient`** (same base URL as the rest of the app) and **`Authorization: Bearer`** when `access_token` is in `localStorage`. Django calls the configured OpenAI-compatible or Anthropic API (keys in `.env`) and returns `{ raw_text, phase }`; the browser parses and validates JSON before rendering.
- **Two phases** (not chat-first): (1) `followup_questions` → variable `questions[]` with `input_type` for controls; (2) `condition_assessment` → conditions, severities, and **`care_taxonomy`** for future routing (logged in the browser console only for now).
- **Conversational chat** (`POST /api/symptom/chat/`) uses a separate system prompt file on the server: `api/prompts/symptom_chat_system.txt` (JSON reply with `assistant_message`, `triage_level`, etc.).

The diagram above remains the target for deeper orchestration (sessions, NPPES); the survey path already routes LLM traffic through **Django** for credential safety.