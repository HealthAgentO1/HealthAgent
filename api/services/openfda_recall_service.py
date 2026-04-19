"""
openFDA drug enforcement (recall) API — query and map results for profile medications.
https://open.fda.gov/apis/drug/enforcement/
"""

from __future__ import annotations

import logging
import re
from typing import Any

import requests
from django.conf import settings

from .medication_profile_service import core_drug_query_term

logger = logging.getLogger(__name__)

OPENFDA_ENFORCEMENT_URL = "https://api.fda.gov/drug/enforcement.json"


def _lucene_quote(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _build_search_clause(term: str) -> str:
    """
    Use spaces around OR — in x-www-form-urlencoded the server decodes '+' as space;
    literal '+' in the query string is wrong for Lucene. See openFDA query examples.
    """
    q = _lucene_quote(term)
    return (
        f"(openfda.brand_name:{q} OR openfda.generic_name:{q} "
        f"OR product_description:{q})"
    )


def parse_recall_classification(raw: str | None) -> tuple[str | None, str | None]:
    """
    Map FDA text like 'Class II' to Roman numeral bucket 'II' for stable clients.
    Returns (normalized, raw).
    """
    if not raw or not isinstance(raw, str):
        return None, raw
    u = raw.strip()
    if not u:
        return None, raw
    upper = u.upper()
    if re.search(r"\bCLASS\s+III\b", upper):
        return "III", u
    if re.search(r"\bCLASS\s+II\b", upper):
        return "II", u
    if re.search(r"\bCLASS\s+I\b", upper):
        return "I", u
    return None, u


def _map_result_row(
    row: dict[str, Any],
    profile_medication: str,
) -> dict[str, Any]:
    classification_norm, classification_raw = parse_recall_classification(
        row.get("classification")
    )
    return {
        "profile_medication": profile_medication,
        "classification": classification_norm,
        "classification_raw": classification_raw,
        "reason_for_recall": row.get("reason_for_recall"),
        "product_description": row.get("product_description"),
        "recall_number": row.get("recall_number"),
        "recall_initiation_date": row.get("recall_initiation_date"),
        "recall_status": row.get("status"),
        "recalling_firm": row.get("recalling_firm"),
        "event_id": row.get("event_id"),
    }


def fetch_recalls_for_medication(
    profile_medication: str,
    *,
    session: requests.Session | None = None,
    timeout: float = 20.0,
) -> list[dict[str, Any]]:
    """
    Query openFDA enforcement for one profile medication name.
    """
    core = core_drug_query_term(profile_medication)
    if not core:
        return []

    own_session = session is None
    sess = session or requests.Session()
    try:
        params: dict[str, Any] = {
            "search": _build_search_clause(core),
            "limit": 100,
        }
        key = getattr(settings, "OPENFDA_API_KEY", "") or ""
        if key:
            params["api_key"] = key

        resp = sess.get(
            OPENFDA_ENFORCEMENT_URL,
            params=params,
            timeout=timeout,
        )
        # openFDA returns HTTP 404 when the query matches no enforcement reports.
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(
            "openFDA enforcement request failed for %r: %s",
            profile_medication,
            e,
        )
        raise
    finally:
        if own_session:
            sess.close()

    results = data.get("results")
    if not isinstance(results, list):
        return []

    out: list[dict[str, Any]] = []
    for row in results:
        if isinstance(row, dict):
            out.append(_map_result_row(row, profile_medication))
    return out


def fetch_recalls_for_medications(
    medications: list[str],
    *,
    timeout: float = 20.0,
) -> dict[str, Any]:
    """
    Run one enforcement search per medication, dedupe by recall_number, collect errors.
    """
    recalls: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    seen_keys: set[str] = set()

    with requests.Session() as session:
        for med in medications:
            core = core_drug_query_term(med)
            if not core:
                continue
            try:
                rows = fetch_recalls_for_medication(
                    med, session=session, timeout=timeout
                )
            except (requests.RequestException, ValueError) as e:
                errors.append(
                    {
                        "medication": med,
                        "detail": str(e),
                    }
                )
                continue
            for row in rows:
                rn = row.get("recall_number") or row.get("event_id")
                key = f"{rn}|{row.get('profile_medication')}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                recalls.append(row)

    return {
        "medications_checked": medications,
        "recalls": recalls,
        "errors": errors,
    }
