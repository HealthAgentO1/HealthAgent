from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _rxcui_from_idgroup_payload(data: dict[str, Any]) -> str | None:
    ig = data.get("idGroup") or {}
    ids = ig.get("rxnormId")
    if ids is None:
        return None
    if isinstance(ids, list) and ids:
        return str(ids[0]).strip()
    if isinstance(ids, (str, int)):
        return str(ids).strip()
    return None


def _best_candidate_rxcui(candidates: list[dict[str, Any]] | dict[str, Any]) -> str | None:
    if isinstance(candidates, dict):
        candidates = [candidates]
    best_rxcui: str | None = None
    best_score = -1.0
    for c in candidates:
        if not isinstance(c, dict):
            continue
        rxcui = c.get("rxcui")
        if not rxcui:
            continue
        try:
            score = float(c.get("score", 0) or 0)
        except (TypeError, ValueError):
            score = 0.0
        if score > best_score:
            best_score = score
            best_rxcui = str(rxcui).strip()
    return best_rxcui


def resolve_rxnorm_id_for_drug_name(name: str, *, timeout: float = 12.0) -> str | None:
    """
    Map a drug name to an RxNorm identifier (RxCUI) via NLM RxNav REST.
    Tries exact name lookup first, then approximate match.
    """
    term = name.strip()
    if not term:
        return None

    base = getattr(settings, "RXNAV_REST_BASE", "https://rxnav.nlm.nih.gov/REST").rstrip("/")

    try:
        r = requests.get(f"{base}/rxcui.json", params={"name": term}, timeout=timeout)
        r.raise_for_status()
        exact = _rxcui_from_idgroup_payload(r.json())
        if exact:
            return exact
    except requests.RequestException as exc:
        logger.warning("RxNav rxcui.json failed for %r: %s", term, exc)

    try:
        r = requests.get(
            f"{base}/approximateTerm.json",
            params={"term": term, "maxEntries": 10},
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()
        group = data.get("approximateGroup") or {}
        candidates = group.get("candidate")
        if candidates is None:
            return None
        return _best_candidate_rxcui(candidates)
    except requests.RequestException as exc:
        logger.warning("RxNav approximateTerm failed for %r: %s", term, exc)
        return None
