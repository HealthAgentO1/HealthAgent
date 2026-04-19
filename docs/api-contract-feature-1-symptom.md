# API contract — Feature 1 (Symptom-to-Care)

**Status:** Draft (pre-implementation)  
**Version:** 1.0.3  
**Base URL (dev):** `http://127.0.0.1:8000/api`  
**Primary consumer:** React frontend (`VITE_API_URL` + Axios)

This document defines the HTTP contract for the symptom interview, triage submission, and NPPES-backed provider search. Backend implementations MUST preserve these paths, HTTP methods, and JSON field names unless the team agrees on a versioned revision.

**Related:** Domain behavior and data model context live in [sympton-to-care.md](./sympton-to-care.md).

**Symptom Check survey LLM:** The `/symptom-check` UI issues two `POST /api/symptom/survey-llm/` calls (authenticated). The SPA sends `system_prompt` text from `frontend/src/symptomCheck/prompts/*.txt` plus `user_payload`; Django calls the upstream LLM and returns `raw_text` for client-side JSON validation. This is **separate** from `POST /symptom/chat/` (conversational JSON contract below).

**Symptom Check nearby facilities:** After the second LLM call, the SPA issues **`POST /api/symptom/nearby-facilities/`** with the user’s address and NUCC `taxonomy_codes` from `care_taxonomy` (see section 4).

---

## Conventions

| Item | Rule |
|------|------|
| Format | `Content-Type: application/json` on bodies |
| Paths | All paths below are relative to the API prefix `/api/` (e.g. full path `POST /api/symptom/chat/`) |
| Auth | JWT: clients send `Authorization: Bearer <access_token>` when present. **`POST /symptom/survey-llm/`**, **`POST /symptom/nearby-facilities/`**, and **`POST /symptom/chat/`** require authentication in the current implementation. |
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

Runs one **stateless** survey turn for the React Symptom Check flow: either generating follow-up questions from intake data, or generating condition assessment JSON after follow-ups. The server calls the configured LLM with the provided `system_prompt` and a single synthetic user message whose content is `JSON.stringify(user_payload)`.

### Request

```json
{
  "phase": "followup_questions",
  "system_prompt": "<full system instructions, typically from SPA prompt files>",
  "user_payload": {
    "symptoms": "…",
    "insurance_label": "…"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `phase` | string | yes | `followup_questions` \| `condition_assessment` (echoed in response for debugging) |
| `system_prompt` | string | yes | Non-empty; in production the SPA bundles known-good templates |
| `user_payload` | object | yes | JSON object; second call typically includes `follow_up_answers` array |

### Response **200 OK**

```json
{
  "raw_text": "{ \"questions\": [ … ] }",
  "phase": "followup_questions"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `raw_text` | string | Model output; client MUST parse as JSON (may strip optional Markdown fences) |
| `phase` | string | Same as request `phase` |

### Errors

| HTTP | When |
|------|------|
| **400** | Serializer validation (e.g. invalid `phase`, empty `system_prompt`) |
| **401** | Missing or invalid JWT |
| **502** | Upstream LLM or transport failure |
| **503** | LLM not configured (e.g. missing API key) |

---

## 2. Symptom chat turn

**`POST /symptom/chat/`**

Runs one conversational turn: persists (or creates) a symptom session, appends the user message, returns the model’s reply. Intended for the live interview UI.

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
| `session_id` | string (UUID) | Stable for subsequent turns and for `POST /symptom/triage/` |
| `assistant_message` | string | Markdown allowed only if the UI explicitly supports it; default is plain text |
| `turn_index` | integer | Monotonic count of completed assistant turns (optional but useful for QA) |
| `interview_complete` | boolean | When `true`, UI SHOULD prompt the user to submit triage (still use `POST /symptom/triage/` for structured result) |
| `created_at` | string | Session creation time |
| `updated_at` | string | Last update time |

---

## 3. Triage submission

**`POST /symptom/triage/`**

Submits the **full session** for structured triage: urgency, routing guidance, and **provider recommendations**. The canonical source of truth for the conversation is server-side history keyed by `session_id`; the request only needs identifiers and location context for provider search.

### Request

```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "zip": "94107"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `session_id` | string (UUID) | yes | Must reference an existing session with at least one user message |
| `zip` | string | yes | US ZIP (5 digits) or ZIP+4; used for NPPES-backed provider discovery |

**Optional extension (only if product requires offline / replay):**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `conversation` | array | no | If present, MAY override stored server history for this request only; same shape as `messages` in response below |

### Response **200 OK**

```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "triage_level": "urgent",
  "routing_summary": "Same-day in-person evaluation is appropriate. If symptoms worsen suddenly, seek emergency care.",
  "disclaimers": [
    "This is not a medical diagnosis. If you believe you are having an emergency, call 911 or go to the nearest emergency department."
  ],
  "provider_recommendations": {
    "zip": "94107",
    "specialties": [
      {
        "taxonomy_code": "207Q00000X",
        "display_name": "Family Medicine",
        "rationale": "Initial evaluation of abdominal pain and coordination of follow-up."
      }
    ]
  },
  "pre_visit_report": {
    "patient_summary": "Adult reports localized RLQ abdominal pain for ~24h without fever reported so far.",
    "reported_symptoms": ["lower right abdominal pain"],
    "duration": "since last night",
    "triage_level": "urgent",
    "relevant_history": "",
    "current_medications": [],
    "questions_for_provider": ["Any guarding or rebound tenderness on exam?"]
  },
  "messages": [
    {
      "role": "user",
      "content": "I’ve had sharp pain in my lower right abdomen since last night.",
      "timestamp": "2026-04-18T12:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Thank you for sharing that. Are you experiencing fever, nausea, or vomiting along with the pain?",
      "timestamp": "2026-04-18T12:00:05Z"
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `triage_level` | string | One of `emergency` \| `urgent` \| `routine` |
| `routing_summary` | string | Short, user-facing explanation of suggested care setting |
| `disclaimers` | string[] | Non-empty in production UI when showing triage results |
| `provider_recommendations` | object | Hints for `GET /providers/` (taxonomy + human labels) |
| `provider_recommendations.specialties` | array | At least one entry when `triage_level` is `urgent` or `routine`; may be empty for `emergency` if UI routes to ER only |
| `pre_visit_report` | object | Aligns with the structured summary in [sympton-to-care.md](./sympton-to-care.md) |
| `messages` | array | Full transcript snapshot for audit/UI replay (optional for clients that only need summary) |

**Implementation note:** The server MAY hydrate concrete provider rows by calling NPPES internally, but the **minimum** contract is `provider_recommendations.specialties` plus client-side or follow-up calls to `GET /providers/`.

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
