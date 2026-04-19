# Symptom-to-Care Agent — Design Doc

**Status:** Draft  
**Author:** Carl Gombert
**Last updated:** 2026-04-18 (survey LLM via Django `symptom/survey-llm/`)

---

## Problem

Users experiencing symptoms have no easy way to determine whether they need emergency care, a primary care visit, or telehealth — and even when they decide, finding an in-network provider and booking an appointment is friction-heavy. This agent removes that friction end-to-end.

## Goals

- Triage user-reported symptoms to an urgency level (ER / primary care / telehealth)
- Capture symptoms through a **structured survey** (free-text chief complaint, insurer selection, and conditional follow-up prompts) rather than a free-form chat transcript as the primary UX
- Surface nearby providers appropriate to that urgency level (showing all providers regardless of network)
- Collect user insurance details (displaying an "insurance verification unavailable" warning where verification is not wired)
- Complete or mock-complete an appointment booking
- Generate a structured pre-visit summary for the receiving provider

## Non-Goals

- Acting as a substitute for a clinician or emergency services
- Real-time EHR integration (out of scope for v1)
- Billing or claims processing or personalized benefit quotes

**Note on differentials:** The Core AI Agent may still produce probabilistic triage internally. Any **illustrative list of possible conditions** shown in the product must be clearly labeled as non-diagnostic and educational, and final wording should follow clinical and legal review. The Symptom Check UI consumes **structured JSON** returned from Django after an upstream LLM call; copy and labels still require clinical and legal review before production.

---

## Agent Workflow

```
User completes symptom survey (free text + structured follow-ups)
    → Core AI Agent: structured Q&A / extraction + triage score (not chat-first)
    → Urgency decision (ER / primary / telehealth)
    → User Input: insurer / plan context (prototype: fixed carrier list)
    → NPPES: find nearby providers by specialty + location (No filtering by network)
    → UI Display: nearby hospitals or providers + illustrative in-network price *ranges*
          (not the member's actual liability; deductible/coinsurance apply)
    → Booking: confirm slot (mock or real)
    → Pre-visit report: structured summary for doctor
```

### Frontend (current prototype)

The `/symptom-check` route implements the **survey flow** in the browser:

| Step | Behavior |
|------|----------|
| 1 — Intake | Free-text symptoms + insurer selection (fixed carrier list) + **validated US address** (street, city, state, 5-digit ZIP). Address is required to rank nearby facilities on step 3. |
| 2 — Follow-up | On **Continue**, the app issues the **first** LLM request. Prompt **system** text is loaded from `frontend/src/symptomCheck/prompts/followup_context.txt`; **user** context is JSON (`symptoms`, `insurance_label`). The model must return **JSON only** describing a `questions[]` array. Each question has an `input_type` so the UI can render radios, checkboxes, text areas, or a numeric scale. |
| 3 — Results | On **See results**, the **second** LLM request sends the same symptom/insurer context plus structured follow-up answers. Prompt **system** text comes from `frontend/src/symptomCheck/prompts/results_context.txt`. Parsed JSON drives **possible conditions** (title, explanation, why it remains plausible, per-condition severity), **overall_patient_severity**, and **`care_taxonomy`** (suggested care setting, **NUCC taxonomy code strings**, internal rationale). **`care_taxonomy` is not shown as a primary patient label**; its `taxonomy_codes` drive **`POST /api/symptom/nearby-facilities/`** together with the saved address. The UI lists **NPPES organizational** providers near the user’s ZIP, sorted by **geodesic distance** after Census geocoding (see `api/services/nppes_nearby.py`). The first three rows are visible by default; additional matches appear under a disclosure. **Estimated cost** copy remains **illustrative and not tied to listed facilities** until billing integration. |

**Client modules:** `frontend/src/symptomCheck/symptomLlmClient.ts` builds `{ phase, system_prompt, user_payload }` and `POST`s it to **`POST /api/symptom/survey-llm/`** via `apiClient` (requires JWT — users who are not signed in see an error). **Parsing** tolerates optional Markdown JSON fences; **validation** is in `validatePayloads.ts` so bad model output fails fast with a user-visible error. **`frontend/src/symptomCheck/nppesFacilitiesClient.ts`** `POST`s address + `taxonomy_codes` to **`POST /api/symptom/nearby-facilities/`** and validates the facility list JSON.

**Backend:** `api/views_symptom.py` (`SymptomSurveyLlmView`) forwards to `complete_symptom_survey_turn` in `api/services/symptom_llm.py` (OpenAI-compatible or Anthropic per `LLM_PROVIDER`). The HTTP response is `{ "raw_text": "<model output>", "phase": "..." }`. **`SymptomNearbyFacilitiesView`** calls `find_nearby_facilities` in **`api/services/nppes_nearby.py`** (NPPES + Census; no API key).

Per-insurer **cost** text on the results page is **generic illustrative copy** (not facility-specific) until benefit integration exists.

### Urgency levels

| Level | Criteria | Routing |
|-------|----------|---------|
| Emergency | Life-threatening indicators | Nearest ER, call 911 prompt |
| Urgent | Same-day/next-day warranted | Urgent care or telehealth |
| Routine | Non-urgent | Primary care, telehealth |

---

## External APIs

### Core AI Agent (LLM Provider)
- Docs: OpenAI-compatible HTTP or Anthropic Messages API, configured in Django (`LLM_PROVIDER`, `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, etc.).
- **Survey:** Prompt bodies ship in the SPA from `frontend/src/symptomCheck/prompts/*.txt` and are posted to Django; **API keys never leave the server**.
- **Chat transcript API** (`POST /api/symptom/chat/`): system instructions load from `api/prompts/symptom_chat_system.txt` (distinct from the survey prompts).
- Used for: Survey — **dynamic** follow-up questions (JSON), then **differential-style conditions**, **severity** fields, and **care_taxonomy** for downstream routing. Chat — conversational JSON with `assistant_message` and `triage_level`.
- Context limits: `LLM_MAX_INPUT_TOKENS` trims the single survey user message if needed; chat uses `trim_chat_messages` on the transcript.

### NPPES (NPI Registry)
- Docs: https://npiregistry.cms.hhs.gov/api-page
- Used for: organizational provider search by **taxonomy code**, **ZIP**, and **state** (see `api/services/nppes_nearby.py`).
- Key endpoint: `GET https://npiregistry.cms.hhs.gov/api/?version=2.1&...` (parameters include `postal_code`, `taxonomy_code`, `enumeration_type=NPI-2`, `address_purpose=LOCATION`).
- Auth: None (public API). Requests originate from the **Django** app, not the browser (avoids CORS and keeps query shaping centralized).

### US Census Geocoder
- Used for: resolving the patient line address and each candidate practice address to latitude/longitude for distance ranking (`geocoding.geo.census.gov`, public, no API key in this integration).

---

## Data Model (key fields)

```python
class SymptomSession(models.Model):
    user = models.ForeignKey(User)
    ai_conversation_log = models.JSONField(default=list)
    triage_level = models.CharField(choices=URGENCY_LEVELS, null=True, blank=True)
    provider_npi = models.CharField(null=True)
    insurance_details = models.JSONField(null=True)
    booking_status = models.CharField(choices=BOOKING_STATES)
    pre_visit_report = models.JSONField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

---

## Pre-Visit Report Format

```json
{
  "patient_summary": "...",
  "reported_symptoms": ["..."],
  "duration": "...",
  "triage_level": "routine",
  "relevant_history": "...",
  "current_medications": ["..."],
  "questions_for_provider": ["..."]
}
```

---

## Open Questions

- [ ] How do we mitigate LLM hallucinations during symptom triage?
- [ ] How do we enforce strict JSON and urgency behavior in production (schema validation, constrained decoding, or server-side repair)?
- [ ] Mock booking: what does the UX look like when no real booking API is available?
- [ ] Do we store the pre-visit report or only generate on-demand?
- [ ] How do we handle users outside the US (NPPES is US-only)?