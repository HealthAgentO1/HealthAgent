"""
Heuristic "notability" scoring for NPI Registry organizations.

NPPES does not expose ratings or visit counts. We approximate likely usefulness using:
- Name / taxonomy keywords (urgent care, hospital, medical center, known regional wording)
- Mild bonuses when the record lists multiple practice locations or endpoints (larger org signal)
- Small penalties for patterns common to tiny or sole-prop-style listings

Combined ranking (see `combined_rank_score`) lets a farther, higher-signal site rank above a
nearby low-signal row — addressing cases where geocoding lands on a marginal address first.
"""

from __future__ import annotations

import re
from typing import Any

# One mile of straight-line distance consumes this many relevance points when comparing rows.
_DISTANCE_WEIGHT: float = 0.32

# Keyword boosts (substring match on organization name + taxonomy description, lowercased).
_NAME_POSITIVE_KEYWORDS: tuple[tuple[str, float], ...] = (
    ("urgent care", 5.0),
    ("immediate care", 4.5),
    ("emergency", 4.0),
    ("hospital", 4.5),
    ("medical center", 4.0),
    ("health system", 3.5),
    ("walk-in", 2.5),
    ("walk in clinic", 2.5),
    ("family medicine", 1.5),
    ("primary care", 2.0),
    ("clinic", 1.0),  # weak alone; stacks with others
    ("regional medical", 3.0),
    ("community hospital", 4.0),
    ("children's hospital", 3.5),
    ("childrens hospital", 3.5),
    ("trauma", 3.0),
    ("fqhc", 2.0),
    ("federally qualified", 2.0),
)

# Common chain / network fragments (not exhaustive; avoids overfitting one market).
_CHAIN_HINTS: tuple[tuple[str, float], ...] = (
    ("concentra", 2.0),
    ("citymd", 2.0),
    ("medexpress", 2.0),
    ("carewell", 1.5),
    ("fastmed", 1.5),
    ("gohealth", 1.5),
    ("wellnow", 1.5),
    ("afc urgent", 2.0),
    ("patient first", 1.5),
    ("banner health", 2.0),
    ("hca ", 1.5),
    ("dignity health", 2.0),
    ("tenet", 1.0),
    ("kaiser", 1.5),
    ("mayo clinic", 2.5),
    ("cleveland clinic", 2.5),
)

# Patterns that often indicate a very small org or ambiguous listing (not definitive).
_SOLE_PROP_PENALTY_PATTERNS: tuple[tuple[re.Pattern[str], float], ...] = (
    (re.compile(r"^dr\.?\s+[\w'.-]+\s+[\w'.-]+\s*$", re.I), -4.0),
    (re.compile(r"^[\w'.-]+\s+[\w'.-]+\s+md\s*$", re.I), -3.5),
    (re.compile(r"\bpllc\b", re.I), -1.0),
)


def _blob(name: str, taxonomy_description: str | None) -> str:
    return f"{name} {taxonomy_description or ''}".lower()


def relevance_score_from_nppes_row(
    row: dict[str, Any],
    display_name: str,
    taxonomy_description: str | None,
) -> float:
    """
    Higher scores suggest a more typical facility destination for triage UIs.
    Typical range ~0–35; uncapped but additive.
    """
    text = _blob(display_name, taxonomy_description)
    score = 0.0

    for needle, pts in _NAME_POSITIVE_KEYWORDS:
        if needle in text:
            score += pts

    for needle, pts in _CHAIN_HINTS:
        if needle in text:
            score += pts

    for rx, delta in _SOLE_PROP_PENALTY_PATTERNS:
        if rx.search(display_name.strip()):
            score += delta

    # Very short names are often DBAs or ambiguous (not always wrong — small penalty).
    if len(display_name.strip()) < 14 and score < 3.0:
        score -= 1.5

    # Larger orgs often have multiple locations / endpoints in the registry.
    pl = row.get("practiceLocations")
    if isinstance(pl, list) and len(pl) >= 3:
        score += 2.0
    elif isinstance(pl, list) and len(pl) >= 1:
        score += 0.5

    eps = row.get("endpoints")
    if isinstance(eps, list) and len(eps) >= 1:
        score += 1.0

    return max(0.0, score)


def combined_rank_score(relevance: float, distance_miles: float) -> float:
    """
    Sort descending: higher means "better overall" (more relevant vs farther away).
    """
    return relevance - _DISTANCE_WEIGHT * float(distance_miles)


def distance_weight() -> float:
    """Exposed for tests / documentation."""
    return _DISTANCE_WEIGHT
