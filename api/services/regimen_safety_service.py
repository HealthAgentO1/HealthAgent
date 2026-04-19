"""
Regimen-level medication safety: openFDA labels, pairwise interaction hints,
enforcement recalls, aggregate scoring, and optional batched LLM plain-language
summaries for interaction excerpts when an API key is configured.
"""

from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

from .interaction_excerpt_plain_language import enrich_pairwise_with_plain_language
from .medication_profile_service import distinct_active_names_from_entries
from .medication_safety_scoring import compute_safety_score
from .openfda_interactions import compute_pairwise_interactions
from .openfda_recall_service import fetch_recalls_for_medications


def run_regimen_openfda_check(medications: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Run openFDA label analysis + enforcement recall search + safety score for an
    in-memory list of ``{"name": str, "rxnorm_id": optional}`` rows (same shape as
    extracted medications).

    Optionally enriches positive pairwise rows with ``description_plain`` via a
    single batched LLM call when an OpenAI-compatible API key is configured.
    """
    with requests.Session() as sess:
        interaction_results = compute_pairwise_interactions(medications, session=sess)
    pairwise = interaction_results.get("pairwise")
    if isinstance(pairwise, list):
        try:
            enrich_pairwise_with_plain_language(pairwise)
        except Exception:
            logger.exception(
                "enrich_pairwise_with_plain_language failed; returning openFDA-only pairwise rows",
            )
    active_names = distinct_active_names_from_entries(medications)
    recalls = fetch_recalls_for_medications(active_names)
    safety_score = compute_safety_score(interaction_results, recalls)
    return {
        "interaction_results": interaction_results,
        "recalls": recalls,
        "safety_score": safety_score,
    }
