# API contract — Feature 1 (Symptom-to-Care)

**Status:** Draft (pre-implementation)  
**Version:** 1.0.9  
**Base URL (dev):** `http://127.0.0.1:8000/api`  
**Primary consumer:** React frontend (`VITE_API_URL` + Axios)

This document defines the HTTP contract for the Symptom Check survey LLM, session APIs, and NPPES-backed facility search. **There is no `POST /symptom/triage/` route** in the current Django URLconf; urgency, routing hints, and transcript persistence are handled as described in section 3. Backend implementations MUST preserve implemented paths, HTTP methods, and JSON field names unless the team agrees on a versioned revision.

**Related:** Domain behavior and data model context live in [sympton-to-care.md](./sympton-to-care.md).

**Session history & post-visit diagnosis:** Authenticated **`GET /api/sessions/`** returns each row’s **`post_visit_diagnosis`** (nullable JSON). **`GET /api/sessions/<uuid>/`** returns the resume payload including **`post_visit_diagnosis`**. **`PATCH /api/sessions/<uuid>/`** accepts **`{ "post_visit_diagnosis": { ... } }`** or **`null`** to clear; the response body matches **`GET`** (full resume payload). See section 6.

**Symptom Check survey LLM:** The `/symptom-check` UI issues one or more `POST /api/symptom/survey-llm/` calls (authenticated): follow-up question generation (one or two rounds), condition assessment, and optionally **`price_estimate_context`**. The SPA sends `system_prompt` text from `frontend/src/symptomCheck/prompts/*.txt` plus `user_payload`; in **production** the server may **ignore** `system_prompt` and use **`api/prompts/survey/`** keyed by **`phase`** (see **Implementation notes** in section 1). On **`condition_assessment`** the client also sends **`active_medications`** (the browser active regimen: names plus optional dosage, frequency, time, refill) for pre-visit reporting. Django calls the upstream LLM and returns `raw_text` for client-side JSON validation. This is **separate** from **`POST /symptom/chat/`** (section 2), which is **internal / future use** — implemented and tested in Django but **not** called by the current React app.

**Symptom Check nearby facilities:** After the second LLM call, the SPA issues **`POST /api/symptom/nearby-facilities/`** with the user’s address and NUCC `taxonomy_codes` from `care_taxonomy` (see section 4).

---

## Conventions

| Item | Rule |
|------|------|
| Format | `Content-Type: application/json` on bodies |
| Paths | All paths below are relative to the API prefix `/api/` (e.g. full path `POST /api/symptom/chat/`) |
| Auth | JWT: clients send `Authorization: Bearer <access_token>` when present. **`POST /symptom/survey-llm/`**, **`POST /symptom/nearby-facilities/`**, and **`POST /symptom/chat/`** (internal / future; see section 2) require authentication in the current implementation. |
| IDs | `session_id` is a UUID string |
| Timestamps | ISO-8601 UTC strings where present (e.g. `2026-04-18T12:34:56Z`) |

### Triage level enum (`triage_level`)

| Value | Meaning (user-facing copy is separate) |
|-------|----------------------------------------|
| `emergency` | Life-threatening indicators; ER / 911 routing |
| `urgent` | Same-day / next-day care warranted |
| `routine` | Non-urgent; primary care or telehealth |

### Error responses

Validation and request errors use HTTP **400**; not found **404**; server errors **500**. Bodies follow Django REST Framework-style JSON (adjust only if the whole API standardizes on another shape later).

**Example (validation):**

```json
{
  "zip": ["This field is required."],
  "session_id": ["Invalid uuid."]
}
```

**Example (single message):**

```json
{
  "detail": "Symptom session not found."
}
```

---

## 1. Symptom survey LLM (structured)

**`POST /symptom/survey-llm/`**

Runs one **stateless** survey turn for the React Symptom Check flow: follow-up questions, optional second round, condition assessment, or price-estimate context. The server calls the configured LLM with a **system** instruction (client-supplied or server-loaded per settings) and a single synthetic user message whose content is `JSON.stringify(user_payload)`.

### Implementation notes (server behavior)

| Topic | Behavior |
|-------|----------|
| **System prompt source** | If **`SYMPTOM_SURVEY_USE_SERVER_PROMPTS`** is **True** (default when `DEBUG` is False), the server loads text from **`api/prompts/survey/`** by **`phase`** and **ignores** the request body’s **`system_prompt`**. If **False** (typical local dev), **`system_prompt`** from the client is used. |
| **Payload limits** | **`system_prompt`** length and serialized **`user_payload`** size are capped (`SYMPTOM_SURVEY_MAX_SYSTEM_PROMPT_CHARS`, `SYMPTOM_SURVEY_MAX_USER_PAYLOAD_BYTES` in settings). Oversized bodies yield **400**. |
| **Rate limit** | Authenticated requests use DRF **scoped throttling** (`symptom_survey_llm`); exceeding the limit yields **429**. |
| **LLM errors** | Distinct responses: **503** for missing API keys, transport/timeouts, and rate limits; **502** for upstream API failures and invalid/empty model output. Logs include **user id** and **phase**, not raw prompts or payloads. |

### Request

```json
{
  "phase": "followup_questions",
  "system_prompt": "<full system instructions, typically from SPA prompt files>",
  "user_payload": {
    "symptoms": "…",
    "insurance_label": "…"
  },
  "session_id": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `phase` | string | yes | `followup_questions` \| `followup_questions_round_2` \| `condition_assessment` \| `price_estimate_context` (echoed in response) |
| `system_prompt` | string | yes | Non-empty in the contract; **may be ignored** when server-side prompts are enabled (see table above). Max length enforced by the API. |
| `user_payload` | object | yes | JSON object; serialized size capped. **`followup_questions`** may include **`prior_official_diagnoses`**: a string array of patient-recorded official diagnoses from past sessions (`SymptomSession.post_visit_diagnosis`), when the SPA opt-in is enabled. **`condition_assessment`** payloads include `symptoms`, `insurance_label`, `follow_up_answers`, and **`active_medications`** (array of objects: at minimum `name`; optional `dosage_mg`, `frequency`, `time_to_take`, `refill_before`, `common_name`, `scientific_name`) so the backend can attach the same regimen to the pre-visit report. |
| `session_id` | string (UUID) \| null | no | Omit or null on the first survey turn; set to the previously returned `session_id` on later turns so all survey steps share one `SymptomSession`. |

### Response **200 OK**

```json
{
  "raw_text": "{ \"questions\": [ … ] }",
  "phase": "followup_questions",
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `raw_text` | string | Model output; client MUST parse as JSON (may strip optional Markdown fences) |
| `phase` | string | Same as request `phase` |
| `session_id` | string (UUID) | Public id of the `SymptomSession` row; returned on every successful call — client should send it on subsequent turns |

### `condition_assessment` user_payload example (medication context)

```json
{
  "symptoms": "…",
  "insurance_label": "…",
  "follow_up_answers": [],
  "active_medications": [
    {
      "name": "Metformin",
      "dosage_mg": "500",
      "frequency": "twice daily",
      "time_to_take": "morning",
      "refill_before": "14 days"
    }
  ]
}
```

### Errors

| HTTP | When |
|------|------|
| **400** | Serializer validation (e.g. invalid `phase`, empty `system_prompt`, **`user_payload` too large**) |
| **401** | Missing or invalid JWT |
| **429** | Authenticated user exceeded the survey LLM **rate limit** for this scope |
| **502** | Upstream LLM API error, invalid/empty model output, or other non-transport failure |
| **503** | LLM not configured (e.g. missing API key), **transport** failure (cannot reach provider), or **provider rate limit** (retry later) |

---

## 2. Symptom chat turn (internal / future)

**Status:** **Internal / future use.** The backend implements **`POST /symptom/chat/`** with tests; the production SPA does **not** call it today. Contract below is retained for a possible conversational interview UI or tooling.

**`POST /symptom/chat/`**

Runs one conversational turn: persists (or creates) a symptom session, appends the user message, returns the model’s reply.

### Request

```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "message": "I’ve had sharp pain in my lower right abdomen since last night."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `session_id` | string (UUID) | no | Omit on first turn; server creates a session and returns `session_id` |
| `message` | string | yes | Non-empty user utterance |

### Response **200 OK**

```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "assistant_message": "Thank you for sharing that. Are you experiencing fever, nausea, or vomiting along with the pain?",
  "turn_index": 2,
  "interview_complete": false,
  "created_at": "2026-04-18T12:00:00Z",
  "updated_at": "2026-04-18T12:00:05Z"
}
```

| Field | Type | Notes |
|-------|------|--------|
| `session_id` | string (UUID) | Stable for subsequent chat turns; the shipped API has **no** separate triage POST (see section 3) |
| `assistant_message` | string | Markdown allowed only if the UI explicitly supports it; default is plain text |
| `turn_index` | integer | Monotonic count of completed assistant turns (optional but useful for QA) |
| `interview_complete` | boolean | When `true`, the chat view may generate a **`pre_visit_report`** on the server; the React app does not use this endpoint today |
| `created_at` | string | Session creation time |
| `updated_at` | string | Last update time |

---

## 3. Triage, routing, disclaimers, and transcript (no dedicated endpoint)

**`POST /symptom/triage/` is not implemented.** It does not appear in `api/urls.py`. The draft request/response shape that used to live in this section of the contract is **not** exposed over HTTP.

The **Symptom Check** flow (`/symptom-check`) implements the same product concerns across **`POST /symptom/survey-llm/`**, session rows, and **`POST /symptom/nearby-facilities/`**:

| Concern | How the system handles it today |
|--------|----------------------------------|
| **Structured urgency (`triage_level`)** | After **`phase: "condition_assessment"`**, Django parses the LLM’s JSON (`raw_text` in the survey response). Server-side logic maps **`overall_patient_severity`** to **`SymptomSession.triage_level`** (`emergency` \| `urgent` \| `routine`) and persists survey turns on the session. The HTTP response is still **`{ "raw_text", "phase", "session_id" }`** — clients parse `raw_text` for conditions, severity, **`care_taxonomy`**, etc. |
| **Routing / “where to go”** | The SPA reads **`care_taxonomy`** (and related fields) from parsed `raw_text` for copy and for **`POST /symptom/nearby-facilities/`** (`taxonomy_codes`, `suggested_care_setting`). There is no separate **`routing_summary`** JSON field from a triage endpoint. |
| **Provider / facility discovery** | **`POST /symptom/nearby-facilities/`** (section 4) returns ranked **facilities** from NPPES + Census — not a `provider_recommendations.specialties` object from a triage POST. |
| **Disclaimers** | Non-diagnostic and emergency copy is **static UI text** in the React app, not an API-returned `disclaimers[]` array. |
| **Pre-visit summary** | After a successful **`condition_assessment`** turn, the server may build and store **`SymptomSession.pre_visit_report`** (see [sympton-to-care.md](./sympton-to-care.md) § Pre-Visit Report Format). It is returned on **`GET /api/sessions/`** (history list). **`GET /api/sessions/<uuid>/`** returns the **resume** payload for the wizard (`results_raw_text`, `triage_level`, …) and does **not** include `pre_visit_report` in the current API shape. |
| **Transcript / snapshot** | Survey history is **`SymptomSession.ai_conversation_log`** (`survey_turn` entries with `phase`, `user_payload`, `raw_text`). **`GET /api/sessions/<uuid>/`** returns the **resume payload** for the SPA (not a chat `messages[]` array from a triage endpoint). |

**Conversational chat** (`POST /symptom/chat/`, section 2 — internal / future) returns **`triage_level`** per assistant turn and may set **`pre_visit_report`** when **`interview_complete`** is true; there is still **no** separate triage submission route.

**Future:** A dedicated **`POST /symptom/triage/`** could aggregate session state and return a single structured body; until it exists, clients MUST NOT assume that endpoint is available.

---

## 4. Symptom Check nearby facilities (implemented)

**`POST /symptom/nearby-facilities/`**

Authenticated JSON endpoint that searches the CMS NPI Registry for **organizational** providers (`NPI-2`) near the user’s ZIP, filtered by **NUCC taxonomy code**, ranks candidates by **distance** after US Census geocoding, and returns normalized rows for the React results step.

### Request

```json
{
  "street": "100 Congress Ave",
  "city": "Austin",
  "state": "TX",
  "postal_code": "78701",
  "taxonomy_codes": ["282N00000X", "261QU0200X"],
  "suggested_care_setting": "emergency_department"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `street` | string | yes | Non-empty; trimmed |
| `city` | string | yes | Non-empty |
| `state` | string | yes | US state/DC USPS code, e.g. `TX` |
| `postal_code` | string | yes | Exactly **5** digits |
| `taxonomy_codes` | string[] | yes | May be empty; server filters to an allowlist of facility NUCC codes and orders attempts using `suggested_care_setting` |
| `suggested_care_setting` | string | no | `emergency_department` \| `urgent_care` \| `primary_care` \| `telehealth` \| `self_care_monitor` — when omitted, a default ordering is used |

### Response **200 OK**

```json
{
  "facilities": [
    {
      "npi": "1234567890",
      "name": "Example Medical Center",
      "address_line": "1 Main St, Austin, TX 78701",
      "distance_miles": 1.234,
      "distance_label": "1.2 mi",
      "taxonomy_code": "282N00000X",
      "taxonomy_description": "General Acute Care Hospital",
      "relevance_score": 14.5
    }
  ],
  "taxonomy_used": "282N00000X"
}
```

| Field | Type | Notes |
|-------|------|--------|
| `facilities` | array | Sorted by **combined** relevance and distance (see `relevance_score`), not raw miles alone |
| `facilities[].npi` | string | 10-digit NPI |
| `facilities[].relevance_score` | number | Heuristic 0+ from NPI name/taxonomy/org signals (registry has no star ratings) |
| `taxonomy_used` | string \| null | NUCC code that produced non-empty NPPES results (after trying the request list and optional fallback) |

### Errors

| HTTP | When |
|------|------|
| **400** | Validation (serializer) or business rule (`detail` string), e.g. Census could not geocode the user address, or no facilities after search |
| **401** | Missing or invalid JWT |
| **502** | Unexpected failure talking to NPPES/Census or internal error |

---

## 5. NPPES provider proxy (draft)

**`GET /providers/`**

Proxies / normalizes the CMS NPI Registry for the UI (see [NPI Registry API](https://npiregistry.cms.hhs.gov/api-page)). Reduces CORS and encapsulates query shaping.

**Implementation note:** Symptom Check currently uses **`POST /symptom/nearby-facilities/`** (section 4) for facility search; this `GET` remains a draft if a generic provider list endpoint is added later.

### Query parameters

| Param | Required | Example | Notes |
|-------|----------|---------|--------|
| `zip` | yes | `94107` | Practice location filter |
| `specialty` | no | `Family Medicine` or `207Q00000X` | Taxonomy description or code; backend maps to NPPES query fields |

### Response **200 OK**

Array of provider objects. Field set is a **stable v1 contract**; extra NPPES fields MAY be added without breaking clients.

```json
[
  {
    "npi": "1234567890",
    "name": "Jane Doe, MD",
    "specialty": "Family Medicine",
    "address": "123 Market St, San Francisco, CA 94107",
    "distance_approx": "1.2 mi",
    "taxonomy_code": "207Q00000X",
    "phone": "+14155550100"
  }
]
```

| Field | Type | Notes |
|-------|------|--------|
| `npi` | string | 10-digit NPI |
| `name` | string | Display name (individual or organization, normalized by backend) |
| `specialty` | string | Human-readable specialty |
| `address` | string | Single-line formatted practice address |
| `distance_approx` | string | Optional; approximate distance or drive time text when geocoding is available |
| `taxonomy_code` | string | Optional but recommended for debugging / analytics |
| `phone` | string | Optional; primary practice phone when available |

**Empty result:** `200 OK` with `[]` — not an error.

---

## 6. Symptom session detail — resume, post-visit diagnosis (implemented)

**`GET /api/sessions/<uuid>/`**

Returns the same JSON shape as today for resuming Symptom Check (`resume_step`, `symptoms`, `results_raw_text`, …) plus **`post_visit_diagnosis`** when present:

```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "resume_step": "results",
  "post_visit_diagnosis": {
    "text": "Acute viral upper respiratory infection",
    "source": "llm_condition",
    "matched_condition_title": "Common cold"
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `post_visit_diagnosis` | object \| null | Absent or `null` until the patient saves an official diagnosis after a visit |

**`PATCH /api/sessions/<uuid>/`**

Authenticated partial update. Body:

```json
{
  "post_visit_diagnosis": {
    "text": "Acute viral upper respiratory infection",
    "source": "llm_condition",
    "matched_condition_title": "Common cold"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `post_visit_diagnosis` | object \| null | yes | `null` clears the stored diagnosis |
| `post_visit_diagnosis.text` | string | when object | Non-empty trimmed text shown to the user |
| `post_visit_diagnosis.source` | string | when object | `llm_condition` \| `custom` |
| `post_visit_diagnosis.matched_condition_title` | string \| null | when object | Required when `source` is `llm_condition` (must match one of the illustrative condition titles); omit or `null` for `custom` |

**Response `200 OK`:** Full resume payload (same as **`GET`**), including updated `post_visit_diagnosis`.

| HTTP | When |
|------|------|
| **400** | Validation (e.g. invalid `source`, missing `matched_condition_title` for `llm_condition`) |
| **401** | Missing or invalid JWT |
| **404** | Session not found or not owned by the user |

---

## Review & sign-off

All developers MUST review this contract before Feature 1 implementation. Record approval by adding name and date; change the document **Version** and add a changelog row when the contract changes.

| Name | Role | Approved (YYYY-MM-DD) |
|------|------|------------------------|
| _Dev 1_ | | |
| _Dev 2_ | | |
| _Dev 3_ | | |
| _Dev 4_ | | |

### Changelog

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-04-18 | Initial contract for chat, triage, and providers endpoints |
| 1.0.1 | 2026-04-18 | Documented parallel frontend Symptom Check LLM payload (`VITE_SYMPTOM_LLM_URL`, prompt files); clarifies relation to draft `/symptom/chat/` and `/symptom/triage/` |
| 1.0.2 | 2026-04-18 | Added implemented `POST /symptom/survey-llm/`; SPA uses Django + JWT (removed browser-only mock path) |
| 1.0.3 | 2026-04-18 | Documented implemented `POST /symptom/nearby-facilities/` (NPPES + Census via Django) for Symptom Check results |
| 1.0.4 | 2026-04-19 | Documented `followup_questions_round_2`, response `session_id`, and `active_medications` on `condition_assessment` for pre-visit reports |
| 1.0.5 | 2026-04-19 | Documented `post_visit_diagnosis` on session list/detail and **`PATCH /api/sessions/<uuid>/`** |
| 1.0.6 | 2026-04-19 | Documented optional **`prior_official_diagnoses`** on **`followup_questions`** `user_payload` |
| 1.0.7 | 2026-04-19 | Marked **`POST /symptom/chat/`** as internal/future (no current frontend consumer) |
| 1.0.8 | 2026-04-19 | Removed draft **`POST /symptom/triage/`** contract; documented actual triage/routing/transcript behavior (no route in `urls.py`) |
| 1.0.9 | 2026-04-19 | Survey LLM: server prompt option, payload caps, scoped throttle, refined **502**/**503**/**429** errors; documented **`price_estimate_context`** phase |
