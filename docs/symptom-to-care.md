# Symptom-to-Care Agent — Design Doc

**Status:** Draft  
**Author(s):** Carl Gombert, Zander McGinley
**Last updated:** 2026-04-19 (survey LLM: server prompt option, caps, throttling; pre-visit report shapes documented in § Pre-Visit Report Format)

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
    → Pre-visit report: structured summary for doctor (medications prefer browser active regimen with dosage/frequency/time/refill when present)
```

### Frontend (current prototype)

The `/symptom-check` route implements the **survey flow** in the browser:

| Step | Behavior |
|------|----------|
| 1 — Intake | Free-text symptoms + optional **Include my past official diagnoses** (checkbox + info dialog): when signed in and at least one past symptom session has **`post_visit_diagnosis`** saved, the user may send deduplicated diagnosis labels to the **first** LLM call as **`prior_official_diagnoses`** alongside symptoms. Insurer selection (fixed carrier list) + **validated US address** (street, city, state, 5-digit ZIP). Address is required to rank nearby facilities on step 3. If the user has saved a **default address** on **Settings & profile** (`GET/PATCH /api/auth/me/` `default_address`), the form **prefills** when step 1 is opened with no address yet, shows a **prefilled** notice, and supports **Clear address** to start over. |
| 2 — Follow-up | On **Continue**, the app issues the **first** LLM request. Prompt **system** text is loaded from `frontend/src/symptomCheck/prompts/followup_context.txt`; **user** context is JSON (`symptoms`, `insurance_label`). The model must return **JSON only** describing a `questions[]` array. Each question has an `input_type` so the UI can render radios, checkboxes, text areas, or a numeric scale. The server returns a **`session_id`**; the client sends it on later turns. If the model returns a second round of questions, the app uses **`followup_round2_context.txt`** and phase `followup_questions_round_2` before results. |
| 3 — Results | On **See results**, the **condition assessment** LLM request sends symptom/insurer context, structured follow-up answers, and **`active_medications`** from the user’s Medication Safety **`localStorage`** regimen (`symptomLlmClient.ts` / `medicationRegimenStorage.ts`) so the backend can attach the full list with optional fields to the pre-visit report. Prompt **system** text comes from `frontend/src/symptomCheck/prompts/results_context.txt`. Parsed JSON drives **possible conditions** (title, explanation, why it remains plausible, per-condition severity), **overall_patient_severity**, and **`care_taxonomy`** (suggested care setting, **NUCC taxonomy code strings**, internal rationale). **`care_taxonomy` is not shown as a primary patient label**; its `taxonomy_codes` drive **`POST /api/symptom/nearby-facilities/`** together with the saved address. The UI lists **NPPES organizational** providers near the user’s ZIP, sorted by **relevance and distance** (see `api/services/nppes_nearby.py`). The first three rows are visible by default; additional matches appear under a disclosure. **Estimated cost** copy remains **illustrative and not tied to listed facilities** until billing integration. After success, **View report** refetches session history, navigates to **`/reports?session=<uuid>`** with router state so the shell **scrolls to the top**, and the Reports page selects that session once the list includes it (see `docs/architecture.md`). |

**Client modules:** `frontend/src/symptomCheck/symptomLlmClient.ts` builds `{ phase, system_prompt, user_payload }` and `POST`s it to **`POST /api/symptom/survey-llm/`** via `apiClient` (requires JWT — users who are not signed in see an error). **Parsing** tolerates optional Markdown JSON fences; **validation** is in `validatePayloads.ts` so bad model output fails fast with a user-visible error. **`frontend/src/symptomCheck/nppesFacilitiesClient.ts`** `POST`s address + `taxonomy_codes` to **`POST /api/symptom/nearby-facilities/`** and validates the facility list JSON.

**Backend:** `api/views_symptom.py` (`SymptomSurveyLlmView`) forwards to `complete_symptom_survey_turn` in `api/services/symptom_llm.py` (OpenAI-compatible or Anthropic per `LLM_PROVIDER`). The HTTP response is `{ "raw_text": "<model output>", "phase": "...", "session_id": "<uuid>" }`. In **production**, Django can **ignore** the client `system_prompt` and load instructions from **`api/prompts/survey/`** by phase (**`SYMPTOM_SURVEY_USE_SERVER_PROMPTS`** — see `backend/settings.py` and **`docs/architecture.md`**); prompt text should stay aligned with the SPA copies under `frontend/src/symptomCheck/prompts/`. Requests are **size-limited**, **rate-limited**, and errors are mapped to HTTP statuses without logging raw PHI in application logs. On **`condition_assessment`**, after persisting the turn, Django runs **`build_pre_visit_report`** in **`api/services/report_service.py`** (transcript + formatted medication lines + LLM JSON for chief complaint, HPI, etc.) and saves **`pre_visit_report`** on the session. **`SymptomNearbyFacilitiesView`** calls `find_nearby_facilities` in **`api/services/nppes_nearby.py`** (NPPES + Census; no API key).

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
- **Survey:** The SPA bundles prompt text from `frontend/src/symptomCheck/prompts/*.txt`; production Django may instead load **`api/prompts/survey/`** by phase (**`SYMPTOM_SURVEY_USE_SERVER_PROMPTS`**). **API keys never leave the server.** Survey calls are capped, throttled, and error-mapped (see **`docs/architecture.md`**).
- **Chat transcript API** (`POST /api/symptom/chat/`): **internal / future use** (not wired in the current frontend). System instructions load from `api/prompts/symptom_chat_system.txt` (distinct from the survey prompts).
- Used for: Survey — **dynamic** follow-up questions (JSON), then **differential-style conditions**, **severity** fields, and **care_taxonomy** for downstream routing. If chat is enabled later — conversational JSON with `assistant_message` and `triage_level`.
- Context limits: `LLM_MAX_INPUT_TOKENS` trims the single survey user message if needed; chat uses `trim_chat_messages` on the transcript.

### NPPES (NPI Registry)
- Docs: https://npiregistry.cms.hhs.gov/api-page
- Used for: organizational provider search by **taxonomy code**, **ZIP**, and **state** (see `api/services/nppes_nearby.py`). The Read API uses **`taxonomy_code`** for NUCC codes and **`taxonomy_description`** for human-readable specialty text; **`NPPESService.search_providers`** maps inputs accordingly (`api/services/nppes_service.py`).
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
    post_visit_diagnosis = models.JSONField(null=True, blank=True)  # official diagnosis after a visit
    created_at = models.DateTimeField(auto_now_add=True)
```

**Post-visit (official) diagnosis:** After the patient sees a clinician, they can return to Symptom Check (or open the session from the dashboard/reports list), and—once they have left the results screen at least once—record the **official diagnosis** the doctor gave them. The value is stored on **`post_visit_diagnosis`** as JSON: `text`, `source` (`llm_condition` if chosen from the same illustrative list the LLM showed, else `custom`), and optional `matched_condition_title`. This marks the check **complete** for reporting and appears in the **Reports** “Drafts” sidebar detail and on **Dashboard** history cards.

---

## Pre-Visit Report Format

The structured survey stores an LLM-shaped object on **`SymptomSession.pre_visit_report`**, including fields such as **`chief_complaint`**, **`hpi`**, **`patient_description`**, **`risk_factors`**, **`triage_level`**, and **`medications`** (array of strings). Medication strings are typically **one line per drug**, optionally including regimen details when **`active_medications`** was present on the final survey turn (e.g. `Name — dosage: 10 mg; frequency: daily; …`). The patient-facing **Reports** page maps this JSON via `frontend/src/utils/preVisitReportPatientView.ts`.

A minimal **intermediate** shape may exist briefly before the full LLM merge (see `apply_condition_assessment_summary` in `api/services/survey_session_persist.py`). Sessions created only via the chat endpoint (if used) may still rely on the latest **`MedicationProfile`** names when building reports if no browser regimen was sent.

```json
{
  "chief_complaint": "...",
  "hpi": "...",
  "triage_level": "routine",
  "patient_description": "...",
  "risk_factors": ["..."],
  "medications": ["Metformin — dosage: 500 mg; frequency: twice daily; time: morning; refill: 14 days", "Aspirin"]
}
```

---

## Open Questions

- [ ] How do we mitigate LLM hallucinations during symptom triage?
- [ ] How do we enforce strict JSON and urgency behavior in production (schema validation, constrained decoding, or server-side repair)?
- [ ] Mock booking: what does the UX look like when no real booking API is available?
- [ ] Do we store the pre-visit report or only generate on-demand?
- [ ] How do we handle users outside the US (NPPES is US-only)?