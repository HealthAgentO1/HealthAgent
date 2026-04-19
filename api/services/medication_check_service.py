"""
Full medication safety pipeline: LLM extraction, label interactions, recalls, scoring.
"""

from __future__ import annotations

from typing import Any

import requests

from ..models import MedicationProfile
from .medication_extraction import extract_medications_with_rxnorm
from .medication_profile_service import distinct_active_names_from_entries
from .medication_safety_scoring import compute_safety_score
from .openfda_interactions import compute_pairwise_interactions
from .openfda_recall_service import fetch_recalls_for_medications


def run_medication_check(user, raw_text: str) -> dict[str, Any]:
    """
    Run extraction → pairwise openFDA label interactions → enforcement recalls → score.

    Persists a ``MedicationProfile`` (same persistence model as extract-only) and returns
    a payload suitable for ``POST /api/medication/check/``:

    - ``id``, ``created_at``, ``medications_raw``, ``extracted_medications``,
      ``interaction_results`` — aligned with medication profile / extract responses
    - ``recalls`` — ``medications_checked``, ``recalls``, ``errors``
    - ``safety_score`` — ``level``, ``numeric``, ``factors``, ``summary``
    """
    raw = (raw_text or "").strip()
    extracted = extract_medications_with_rxnorm(raw)

    with requests.Session() as sess:
        try:
            interaction_results = compute_pairwise_interactions(
                extracted, session=sess
            )
        except Exception as exc:
            interaction_results = {
                "source": "openfda_drug_label",
                "error": str(exc),
                "pairwise": [],
                "per_drug_notes": [],
                "per_drug_label_safety": [],
                "pairs_checked": 0,
            }

    active_names = distinct_active_names_from_entries(extracted)
    recalls = fetch_recalls_for_medications(active_names)
    safety_score = compute_safety_score(interaction_results, recalls)

    profile = MedicationProfile.objects.create(
        user=user,
        medications_raw=raw,
        extracted_medications=extracted,
        interaction_results=interaction_results,
    )

    return {
        "id": profile.id,
        "created_at": profile.created_at,
        "medications_raw": raw,
        "extracted_medications": extracted,
        "interaction_results": interaction_results,
        "recalls": recalls,
        "safety_score": safety_score,
    }
