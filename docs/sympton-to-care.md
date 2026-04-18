# Symptom-to-Care Agent — Design Doc

**Status:** Draft  
**Author:** Carl Gombert
**Last updated:** 2026-04-18

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

**Note on differentials:** The Core AI Agent may still produce probabilistic triage internally. Any **illustrative list of possible conditions** shown in the product must be clearly labeled as non-diagnostic and educational, and final wording should follow clinical and legal review. The current React prototype uses static copy to demonstrate layout only.

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

The `/symptom-check` route implements the **survey layout** end-to-end in the browser with mock data: intake (symptoms + insurer), a follow-up step (timing + severity slider), then a results view with illustrative differentials, nearby hospitals, and templated cost narratives per hospital and selected insurer. Backend wiring for dynamic follow-ups and live triage is not required for this UI pass.

### Urgency levels

| Level | Criteria | Routing |
|-------|----------|---------|
| Emergency | Life-threatening indicators | Nearest ER, call 911 prompt |
| Urgent | Same-day/next-day warranted | Urgent care or telehealth |
| Routine | Non-urgent | Primary care, telehealth |

---

## External APIs

### Core AI Agent (LLM Provider)
- Docs: Setup via LangChain or direct Anthropic/OpenAI SDK.
- Used for: Parsing structured survey responses, generating any **dynamic** follow-up questions, and outputting JSON triage scores (the UI presents these as form steps rather than a chat thread).
- Context Limits: Must efficiently parse chat history within the token limits.
- Auth: API Keys required.

### NPPES (NPI Registry)
- Docs: https://npiregistry.cms.hhs.gov/search
- Used for: provider search by taxonomy code + ZIP
- Key endpoint: `GET /api/?version=2.1&city=...&taxonomy_description=...`
- Auth: None (public API)

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
- [ ] What is the exact System Prompt required to guarantee strict urgency adherence?
- [ ] Mock booking: what does the UX look like when no real booking API is available?
- [ ] Do we store the pre-visit report or only generate on-demand?
- [ ] How do we handle users outside the US (NPPES is US-only)?