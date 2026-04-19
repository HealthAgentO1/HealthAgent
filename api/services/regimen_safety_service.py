"""
Regimen-level medication safety without LLM: openFDA labels, pairwise interaction
hints, enforcement recalls, and aggregate scoring.
"""

from __future__ import annotations

from typing import Any

import requests

from .medication_profile_service import distinct_active_names_from_entries
from .medication_safety_scoring import compute_safety_score
from .openfda_interactions import compute_pairwise_interactions
from .openfda_recall_service import fetch_recalls_for_medications


def run_regimen_openfda_check(medications: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Run openFDA label analysis + enforcement recall search + safety score for an
    in-memory list of ``{"name": str, "rxnorm_id": optional}`` rows (same shape as
    extracted medications).
    """
    with requests.Session() as sess:
        interaction_results = compute_pairwise_interactions(medications, session=sess)
    active_names = distinct_active_names_from_entries(medications)
    recalls = fetch_recalls_for_medications(active_names)
    safety_score = compute_safety_score(interaction_results, recalls)
    return {
        "interaction_results": interaction_results,
        "recalls": recalls,
        "safety_score": safety_score,
    }
