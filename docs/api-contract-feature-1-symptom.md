# API contract — Feature 1 (Symptom-to-Care)

**Status:** Draft (pre-implementation)  
**Version:** 1.0  
**Base URL (dev):** `http://127.0.0.1:8000/api`  
**Primary consumer:** React frontend (`VITE_API_URL` + Axios)

This document defines the HTTP contract for the symptom interview, triage submission, and NPPES-backed provider search. Backend implementations MUST preserve these paths, HTTP methods, and JSON field names unless the team agrees on a versioned revision.

**Related:** Domain behavior and data model context live in [sympton-to-care.md](./sympton-to-care.md).

---

## Conventions

| Item | Rule |
|------|------|
| Format | `Content-Type: application/json` on bodies |
| Paths | All paths below are relative to the API prefix `/api/` (e.g. full path `POST /api/symptom/chat/`) |
| Auth | v1: unauthenticated unless/until `Authorization: Bearer <token>` is enabled; clients already send the header when a token exists |
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

## 1. Symptom chat turn

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

## 2. Triage submission

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

## 3. NPPES provider proxy

**`GET /providers/`**

Proxies / normalizes the CMS NPI Registry for the UI (see [NPI Registry API](https://npiregistry.cms.hhs.gov/api-page)). Reduces CORS and encapsulates query shaping.

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
