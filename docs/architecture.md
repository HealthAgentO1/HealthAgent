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

## Symptom survey and LLM (implemented in frontend)

The **Symptom Check** flow (`/symptom-check`) is implemented in the React app as a **three-step survey**: intake (free text + insurer), dynamic follow-up questions, then illustrative differentials and facility/cost sections.

- **Prompts** live in versioned text files under `frontend/src/symptomCheck/prompts/` (`followup_context.txt`, `results_context.txt`). The client loads them at build time (Vite `?raw` imports), concatenates them into the `system_prompt` field of a JSON request body, and attaches structured `user_payload` (symptoms, insurer label, and follow-up answers on the second call).
- **Two LLM-shaped calls** (not chat-first): (1) after intake, generate a variable list of follow-up questions with typed controls (`single_choice`, `multi_choice`, `text`, `scale_1_10`); (2) after the questionnaire, return possible conditions, severities, and a **`care_taxonomy`** object for future server-side routing (currently logged in the browser console only; not shown in the UI).
- **Default behavior** is a **mock adapter** (no network): fixed JSON responses exercise parsing, validation, and UI. When **`VITE_SYMPTOM_LLM_URL`** is set in `frontend/.env`, the same payload is `POST`ed to that URL; the integration task can swap the mock for a Django proxy or external LLM gateway without changing the survey UX.

Longer term, the diagram above still applies: orchestration, session persistence, and authoritative triage may move behind **Django** (`API → S1 → A1`) while the frontend keeps the same JSON contracts or a thin wrapper around them.