"""
Aggregate a simple medication safety score from openFDA interaction hints and recalls.

Scores are informational only — not clinical decision support.
"""

from __future__ import annotations

from typing import Any


def compute_safety_score(
    interactions: dict[str, Any],
    recalls: dict[str, Any],
) -> dict[str, Any]:
    """
    Return a JSON-serializable score object: ``level`` (low | moderate | high),
    ``numeric`` (0–100), ``factors`` (counts), and a short ``summary`` string.
    """
    factors: dict[str, int] = {
        "interaction_major": 0,
        "interaction_moderate": 0,
        "interaction_minor": 0,
        "interaction_lookup_error": 0,
        "recall_class_i": 0,
        "recall_class_ii": 0,
        "recall_class_iii": 0,
        "recall_unclassified": 0,
    }

    err = interactions.get("error")
    if isinstance(err, str) and err.strip():
        factors["interaction_lookup_error"] = 1

    for row in interactions.get("pairwise") or []:
        if not isinstance(row, dict) or not row.get("has_interaction"):
            continue
        sev = (row.get("severity") or "").strip().lower()
        if sev == "major":
            factors["interaction_major"] += 1
        elif sev == "minor":
            factors["interaction_minor"] += 1
        else:
            factors["interaction_moderate"] += 1

    for row in recalls.get("recalls") or []:
        if not isinstance(row, dict):
            continue
        c = row.get("classification")
        if c == "I":
            factors["recall_class_i"] += 1
        elif c == "II":
            factors["recall_class_ii"] += 1
        elif c == "III":
            factors["recall_class_iii"] += 1
        else:
            factors["recall_unclassified"] += 1

    penalties = (
        factors["interaction_major"] * 25
        + factors["interaction_moderate"] * 12
        + factors["interaction_minor"] * 5
        + factors["interaction_lookup_error"] * 18
        + factors["recall_class_i"] * 30
        + factors["recall_class_ii"] * 15
        + factors["recall_class_iii"] * 8
        + factors["recall_unclassified"] * 6
    )
    recall_errors = recalls.get("errors") or []
    if isinstance(recall_errors, list):
        penalties += min(15, len(recall_errors) * 3)

    numeric = max(0, min(100, 100 - penalties))
    if numeric >= 75:
        level = "low"
    elif numeric >= 45:
        level = "moderate"
    else:
        level = "high"

    parts: list[str] = []
    if factors["interaction_major"]:
        parts.append(
            f"{factors['interaction_major']} major drug-interaction hint(s) from FDA labels"
        )
    if factors["interaction_moderate"]:
        parts.append(f"{factors['interaction_moderate']} moderate interaction hint(s)")
    if factors["interaction_minor"]:
        parts.append(f"{factors['interaction_minor']} minor interaction hint(s)")
    if factors["interaction_lookup_error"]:
        parts.append("interaction lookup did not complete")
    if factors["recall_class_i"]:
        parts.append(f"{factors['recall_class_i']} Class I recall match(es)")
    if factors["recall_class_ii"]:
        parts.append(f"{factors['recall_class_ii']} Class II recall match(es)")
    if factors["recall_class_iii"]:
        parts.append(f"{factors['recall_class_iii']} Class III recall match(es)")
    if factors["recall_unclassified"]:
        parts.append(f"{factors['recall_unclassified']} recall match(es) without class")

    if not parts:
        summary = (
            "Automated checks did not surface major interaction or recall signals "
            "for the medications parsed."
        )
    else:
        summary = "; ".join(parts) + "."

    return {
        "level": level,
        "numeric": numeric,
        "factors": factors,
        "summary": summary,
    }
