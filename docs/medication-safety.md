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
2. **Persistence** — Regimen rows (name, optional fields, RxNorm id when known) are saved in the browser under **`localStorage` keys `healthos_active_regimen_v2:<normalized-email>`** (`frontend/src/medicationSafety/medicationRegimenStorage.ts`), scoped to the signed-in account. Reloading the page keeps the list; clearing site data removes it. Each extract request still creates a **`MedicationProfile`** row on the server for auditing.

3. **Symptom Check pre-visit reports** — The structured symptom survey does **not** read the regimen only from `MedicationProfile`. On the final **`condition_assessment`** call, the SPA sends the same active regimen as **`active_medications`** in `user_payload` so Django can persist it on the session and include **all** drugs with dosage, frequency, time, and refill in **`SymptomSession.pre_visit_report`** (see `docs/architecture.md`, `api/services/report_service.py`). Users can open the resulting report from **Reports** or via **View report** on the Symptom Check results step.
4. **Detail** — `/medication-safety/med/:medicationId` allows editing the same optional fields and **removing** the drug after an in-app confirmation step.
5. **Interaction conflicts (list page)** — When at least one medication is in the regimen, the SPA requests regimen safety via **`loadRegimenSafetyCached`** (`frontend/src/medicationSafety/regimenSafetyCache.ts`), which `POST`s **`/api/medication/regimen-safety/`** only on cache miss or regimen identity change, and dedupes concurrent fetches. Payload: each row’s `name` and optional `rxnorm_id`, `scientific_name`, and `common_name`. The **pairwise** interaction hints render in **`DrugInteractionConflictsPanel`** (`frontend/src/medicationSafety/DrugInteractionConflictsPanel.tsx`) when the API finds conflicting label wording between two drugs. When the server’s **medication OpenAI-compatible client** is configured (`OPENAI_API_KEY`, or **`DEEPSEEK_API_KEY`** which Django maps into the same effective key — see `backend/settings.py`), the backend may call the LLM after openFDA only for **in-process cache misses**: plain-language **`description_plain`** (see **Plain-language layer** below). The conflict modal shows **Plain-language summary** when present and tucks the raw SPL excerpt under **Original FDA label wording**; list previews prefer plain text via **`concisePairwiseExplanation`** (`frontend/src/medicationSafety/conciseText.ts`). **Per-drug** SPL excerpts and recalls render on **`MedicationSafetyDetailPage`** via **`MedicationDetailSafetyPanel`**. Regimen cards show a **!** badge when aggregated label/recall risk is **high** (boxed warning, contraindications, or Class I recall). This call requires authentication and does **not** persist a new `MedicationProfile` (the regimen itself remains browser-local).

**API errors:** The extract endpoint returns **`{ "error": "..." }`** for LLM failures (typically HTTP **502**), configuration issues (**503**), or bad input (**400**). The regimen-safety endpoint returns **400** for an empty or invalid `medications` array, **401** if unauthenticated, and **502** if the safety pipeline raises unexpectedly. The UI surfaces these messages in the alerts panel when the regimen-safety request fails.

---

## Agent Workflow (implemented path for the SPA)

```
User builds active regimen (localStorage) + optional LLM extract when adding a drug
    → POST /api/medication/regimen-safety/ with { medications: [{ name, rxnorm_id? }] }
    → openFDA drug/label.json: SPL sections per drug + pairwise interaction text scan
    → (If LLM configured) one batched JSON call for in-process cache misses: ``enrich_pairwise_with_plain_language`` → ``description_plain`` per positive pair
    → openFDA enforcement: recalls per drug name
    → Aggregate safety_score (low / moderate / high) from interaction severities + recalls
    → Interaction alerts panel shows pairwise hints (severe / moderate / mild), excerpts / summaries, recalls
```

Full check with free text + persistence: **`POST /api/medication/check/`** runs LLM extraction, the same openFDA + recall pipeline, and stores a **`MedicationProfile`**.

### Pairwise interaction hint severity (FDA label text)

Heuristic labels attached to each **positive** pairwise row in `interaction_results.pairwise[].severity`:

| Severity | Typical cues in label excerpt |
|----------|-------------------------------|
| **severe** | Contraindicated, avoid concomitant use, life-threatening, fatal |
| **moderate** | Increased risk, potentiation, serious bleeding, etc. |
| **mild** | Monitor, caution, consider dose adjustment |

Absence of a textual mention in section 7–style text does **not** prove safety.

### Plain-language layer (optional)

- **Module:** `api/services/interaction_excerpt_plain_language.py` — after `compute_pairwise_interactions`, mutates positive pairwise rows in place with `description_plain` when the LLM returns valid JSON.
- **Prompt:** `api/prompts/interaction_excerpt_plain_system.txt` — asks for short, non-clinical paraphrases **only** from the supplied excerpt + drug names + direction; output schema is `{ "items": [ { "i": <row index>, "plain": "..." } ] }` matching batched input `{ "conflicts": [ ... ] }`.
- **HTTP client:** `complete_openai_compatible_json` in `api/services/medication_llm_service.py` (same OpenAI-compatible stack as extraction: model `LLM_MODEL`, base URL from settings).
- **Caching:** In-process `OrderedDict` keyed by SHA-256 of `(drug_a, drug_b, direction, excerpt)`; TTL and max size from **`INTERACTION_PLAIN_CACHE_TTL_SECONDS`** (default 7 days) and **`INTERACTION_PLAIN_CACHE_MAX_ENTRIES`** (default 1024). Failures are logged and non-fatal; the API still returns openFDA excerpts.

### Client session cache (regimen safety)

- **Storage:** `sessionStorage` key **`healthagent_regimen_safety_cache_v2`** (`frontend/src/medicationSafety/regimenSafetyCache.ts`).
- **Invalidation:** Fingerprint includes medication **identity** (client id, trimmed name, RxNorm, common/scientific names); changing only dosage/frequency/time/refill does **not** invalidate the openFDA payload.
- **Scope:** Lowercased signed-in email must match the envelope; switching accounts avoids cross-user reuse.
- **Deduping:** Concurrent requests for the same fingerprint share one in-flight `Promise`.

### Aggregate `safety_score.level`

| Level | Meaning (automated) |
|-------|---------------------|
| **low** | Higher numeric score (fewer penalty factors from hints/recalls) |
| **moderate** | Mid-range |
| **high** | Lower numeric score (more interaction hints and/or recall matches) |

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
- Used for: SPL-derived **drug/label** text (boxed warnings, contraindications, adverse reactions, drug interactions, etc.), and **enforcement** recalls. Adverse **event** (FAERS) reports are not used in the current regimen UI.
- **Label lookup order** (per medication): tokenize a **scientific** name (if present) and search `openfda.generic_name`, then the display `name` on `generic_name`, then **common** (brand) on `openfda.brand_name`, then display `name` on `brand_name`. The SPA sends `scientific_name` and `common_name` from the regimen when available (`POST /api/medication/regimen-safety/`).
- Key endpoints:
  - `GET /drug/label.json` — labeling; implementation in `api/services/openfda_interactions.py` (`fetch_openfda_label_for_medication`, `extract_spl_sections_for_display`, `compute_pairwise_interactions`)
  - `GET /drug/enforcement.json` — active recalls (`api/services/openfda_recall_service.py`)
  - `GET /drug/event.json` — optional future analytics (not wired to the alerts panel)
- Auth: API key (optional, higher rate limits with key)
- Rate limits: 240 requests/minute with key
- Optional env: `OPENFDA_MAX_SECTION_CHARS` (default 6000) caps each SPL section string returned to clients.

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

## `interaction_results` shape (openFDA)

`MedicationProfile.interaction_results` and **`POST /api/medication/regimen-safety/`** return a payload like:

```json
{
  "source": "openfda_drug_label",
  "severity_scale": "…",
  "pairwise": [
    {
      "drug_a": "Warfarin",
      "drug_b": "Aspirin",
      "has_interaction": true,
      "severity": "moderate",
      "description": "… excerpt from label …",
      "description_plain": "Optional LLM plain-English summary of the excerpt when an API key is configured.",
      "direction": "FDA label (Warfarin) drug interactions section references Aspirin."
    }
  ],
  "per_drug_label_safety": [
    {
      "drug": "Warfarin",
      "search_term": "warfarin",
      "label_query": { "field": "generic_name", "term": "warfarin" },
      "label_found": true,
      "sections": {
        "boxed_warning": "…",
        "adverse_reactions": "…",
        "drug_interactions": "…"
      },
      "openfda": { "generic_name": ["warfarin"] }
    }
  ],
  "per_drug_notes": [],
  "pairs_checked": 1
}
```

---

## Open Questions

- [ ] How do we handle brand name vs generic name disambiguation?
- [ ] What is the provider/pharmacy notification mechanism — email, webhook, mock?
- [ ] How often do we re-run checks for monitoring? Event-driven vs scheduled?
- [ ] How do we handle drugs not found in openFDA (supplements, compounded meds)?
- [ ] What is the UI pattern for "safer alternatives" — do we show them or just flag?