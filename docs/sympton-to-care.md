# Symptom-to-Care Agent — Design Doc

**Status:** Draft  
**Author:** Carl Gombert
**Last updated:** 2025

---

## Problem

Users experiencing symptoms have no easy way to determine whether they need emergency care, a primary care visit, or telehealth — and even when they decide, finding an in-network provider and booking an appointment is friction-heavy. This agent removes that friction end-to-end.

## Goals

- Triage user-reported symptoms to an urgency level (ER / primary care / telehealth)
- Surface nearby providers appropriate to that urgency level (showing all providers regardless of network)
- Collect user insurance details (displaying an "insurance verification unavailable" warning)
- Complete or mock-complete an appointment booking
- Generate a structured pre-visit summary for the receiving provider

## Non-Goals

- Diagnosing conditions (The Core AI Agent handles probabilistic triage; we do not surface definitive diagnoses to users)
- Real-time EHR integration (out of scope for v1)
- Billing or claims processing

---

## Agent Workflow

```
User describes symptoms
    → Core AI Agent: conversational interview + extracts triage score
    → Urgency decision (ER / primary / telehealth)
    → User Input: manual entry of insurance plan details
    → NPPES: find nearby providers by specialty + location (No filtering by network)
    → UI Display: Show providers with "Insurance verification unavailable - please call to verify" warning
    → Booking: confirm slot (mock or real)
    → Pre-visit report: structured summary for doctor
```

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
- Used for: Conversational symptom parsing, dynamic follow-up questions, and outputting JSON triage scores.
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