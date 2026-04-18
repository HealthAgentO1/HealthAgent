# Symptom-to-Care Agent — Design Doc

**Status:** Draft  
**Author:** Carl Gombert
**Last updated:** 2025

---

## Problem

Users experiencing symptoms have no easy way to determine whether they need emergency care, a primary care visit, or telehealth — and even when they decide, finding an in-network provider and booking an appointment is friction-heavy. This agent removes that friction end-to-end.

## Goals

- Triage user-reported symptoms to an urgency level (ER / primary care / telehealth)
- Surface nearby, in-network providers appropriate to that urgency level
- Confirm insurance coverage before booking
- Complete or mock-complete an appointment booking
- Generate a structured pre-visit summary for the receiving provider

## Non-Goals

- Diagnosing conditions (APImedic handles probabilistic triage; we do not surface diagnoses to users)
- Real-time EHR integration (out of scope for v1)
- Billing or claims processing

---

## Agent Workflow

```
User describes symptoms
    → APImedic: interview + triage score
    → Urgency decision (ER / primary / telehealth)
    → NPPES: find nearby providers by specialty + location
    → Healthcare.gov: check plan coverage for provider
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

### APImedic
- Docs: https://apimedic.com/
- Used for: symptom parsing, follow-up question generation, triage score
- Key endpoints: `/parse`, `/interview`, `/triage`
- Auth: App-Id + App-Key headers
- Rate limits: check plan tier

### NPPES (NPI Registry)
- Docs: https://npiregistry.cms.hhs.gov/search
- Used for: provider search by taxonomy code + ZIP
- Key endpoint: `GET /api/?version=2.1&city=...&taxonomy_description=...`
- Auth: None (public API)

### Healthcare.gov
- Docs: https://www.healthcare.gov/developers/
- Used for: insurance plan lookup, provider network check
- Auth: API key required

---

## Data Model (key fields)

```python
class SymptomSession(models.Model):
    user = models.ForeignKey(User)
    symptoms_raw = models.TextField()
    apimedic_interview = models.JSONField()
    triage_level = models.CharField(choices=URGENCY_LEVELS)
    provider_npi = models.CharField(null=True)
    insurance_verified = models.BooleanField(default=False)
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

- [ ] How do we handle APImedic rate limits under concurrent users?
- [ ] Mock booking: what does the UX look like when no real booking API is available?
- [ ] Do we store the pre-visit report or only generate on-demand?
- [ ] How do we handle users outside the US (NPPES is US-only)?