# Medication Safety Agent — Design Doc

**Status:** Draft  
**Author:** Carl Gombert  
**Last updated:** 2026

---

## Problem

Patients managing multiple medications often have no easy way to check for dangerous drug interactions, active recalls, or safer alternatives — and their providers may not have a full picture of what they're taking. This agent continuously monitors a user's medication list and proactively surfaces safety issues.

## Goals

- Extract medication names from free-text user input using NLP
- Check for drug-drug interactions and side effect profiles via openFDA
- Monitor for active FDA recalls
- Suggest safer alternatives where interactions are found
- Alert the user's provider or pharmacy when a critical issue is detected

## Non-Goals

- Prescribing or recommending specific dosages
- Replacing a pharmacist review
- Real-time pharmacy inventory or pricing

---

## Current UI (active regimen)

The **Medication Safety** page (`/medication-safety`, authenticated) supports:

1. **Add prescription** — User enters free text describing what they take. The app calls **`POST /api/medication-profile/extract/`** with `medications_text`. The backend uses the DeepSeek-compatible LLM (`api/prompts/medication_extract_system.txt`) plus RxNorm resolution (`api/services/medication_extraction.py`) and returns structured medications. The client guides the user through optional regimen fields: **dosage (mg)**, **frequency**, **time to take**, and **refill** (how long before a refill is needed). Any field left blank is shown as **`-`** on the regimen list.
2. **Persistence** — Regimen rows (name, optional fields, RxNorm id when known) are saved in the browser under **`localStorage` key `healthos_active_regimen_v1`** (`frontend/src/medicationSafety/medicationRegimenStorage.ts`). Reloading the page keeps the list; clearing site data removes it. Each extract request still creates a **`MedicationProfile`** row on the server for auditing.
3. **Detail** — `/medication-safety/med/:medicationId` allows editing the same optional fields and **removing** the drug after an in-app confirmation step.

**API errors:** The extract endpoint returns **`{ "error": "..." }`** for LLM failures (typically HTTP **502**), configuration issues (**503**), or bad input (**400**). The UI surfaces these messages to the user.

---

## Agent Workflow (target)

```
User inputs medication list (free text or structured)
    → DeepSeek (LLM) + RxNorm: NLP extraction → normalized drug names
    → openFDA: interaction check, side effect lookup
    → openFDA recalls: check for active recalls on any drug
    → Risk scoring: classify severity (critical / moderate / low)
    → If critical: alert provider/pharmacy
    → Suggest safer alternatives for flagged interactions
    → Store for ongoing monitoring
```

### Risk levels

| Level | Criteria | Action |
|-------|----------|--------|
| Critical | Contraindicated combination or active recall | Immediate alert + provider notification |
| Moderate | Known interaction requiring monitoring | In-app warning + suggestion |
| Low | Minor interaction or informational flag | Informational note |

---

## External APIs

### LLM extraction (implemented)

- **Implementation:** OpenAI-compatible API (DeepSeek by default), server-side in `api/services/medication_llm_service.py` and `api/services/medication_extraction.py`; prompt `api/prompts/medication_extract_system.txt`.
- **Returns:** JSON with `medications: [{ common_name, scientific_name, rxnorm_id }]` (and a consolidated `name` field on the API response for lookup/backward compatibility), then RxNav enrichment when the model does not supply an RxCUI.

### Lexigram (roadmap / alternate)

- Docs: https://docs.lexigram.io/
- Used for: extracting structured drug mentions from free text (not wired in the current codebase)
- Returns: normalized drug names, RxNorm codes
- Auth: API key

### openFDA
- Docs: https://open.fda.gov/
- Used for: drug interactions, adverse events, recalls
- Key endpoints:
  - `GET /drug/label.json` — labeling, interactions, side effects
  - `GET /drug/enforcement.json` — active recalls
  - `GET /drug/event.json` — adverse event reports
- Auth: API key (optional, higher rate limits with key)
- Rate limits: 240 requests/minute with key

---

## Data Model (key fields)

```python
class MedicationProfile(models.Model):
    user = models.ForeignKey(User)
    medications = models.JSONField()   # [{name, rxnorm_code, dose, frequency}]
    last_checked = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

class MedicationAlert(models.Model):
    profile = models.ForeignKey(MedicationProfile)
    severity = models.CharField(choices=SEVERITY_LEVELS)
    drug_a = models.CharField()
    drug_b = models.CharField(null=True)   # null for single-drug recalls
    description = models.TextField()
    suggestion = models.TextField(null=True)
    provider_notified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
```

---

## Alert Output Format

```json
{
  "severity": "critical",
  "type": "interaction",
  "drugs_involved": ["warfarin", "aspirin"],
  "description": "Increased bleeding risk when combined.",
  "recommendation": "Consult prescriber before continuing both.",
  "safer_alternatives": ["..."],
  "sources": ["openFDA label: warfarin"]
}
```

---

## Open Questions

- [ ] How do we handle brand name vs generic name disambiguation?
- [ ] What is the provider/pharmacy notification mechanism — email, webhook, mock?
- [ ] How often do we re-run checks for monitoring? Event-driven vs scheduled?
- [ ] How do we handle drugs not found in openFDA (supplements, compounded meds)?
- [ ] What is the UI pattern for "safer alternatives" — do we show them or just flag?