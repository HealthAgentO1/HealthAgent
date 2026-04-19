"""
Pairwise drug–drug interaction hints using the openFDA **drug label** API
(`drug/label.json`). Labels expose `drug_interactions` (FDA section 7) as searchable text.

This is informational only — not a substitute for clinical decision support or pharmacist review.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from typing import Any, Union

import requests
from django.conf import settings


class _Missing:
    pass


_MISSING = _Missing()

logger = logging.getLogger(__name__)

OPENFDA_LABEL_URL = getattr(
    settings,
    "OPENFDA_LABEL_URL",
    "https://api.fda.gov/drug/label.json",
)
OPENFDA_API_KEY = getattr(settings, "OPENFDA_API_KEY", "") or ""
# Local process cache to avoid duplicate openFDA calls (per deploy / worker).
OPENFDA_CACHE_TTL_SECONDS = int(getattr(settings, "OPENFDA_CACHE_TTL_SECONDS", 86_400))

_cache_lock = threading.Lock()
# key -> (monotonic_expiry, payload) where payload is raw first "results" item or None marker
_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}


class OpenfdaInteractionError(Exception):
    """openFDA request failed or returned an unexpected shape."""


def _cache_get(key: str) -> Union[dict[str, Any], None, _Missing]:
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return _MISSING
        exp, val = entry
        if exp < now:
            del _cache[key]
            return _MISSING
        return val


def _cache_set(key: str, value: dict[str, Any] | None) -> None:
    exp = time.monotonic() + OPENFDA_CACHE_TTL_SECONDS
    with _cache_lock:
        _cache[key] = (exp, value)


def _primary_search_term(name: str) -> str:
    """Derive a conservative generic-style token for openFDA `openfda.generic_name` search."""
    raw = (name or "").strip()
    if not raw:
        return ""
    # Prefer first token for "Lisinopril 10mg" -> lisinopril; keep hyphenated roots.
    first = raw.split()[0]
    cleaned = re.sub(r"[^a-zA-Z0-9\-]", "", first).lower()
    if len(cleaned) >= 3:
        return cleaned
    # e.g. "IV" — fall back to alnum-only full string head
    alt = re.sub(r"[^a-zA-Z0-9\-]", "", raw.replace(" ", ""))[:40].lower()
    return alt


def _collect_match_tokens(drug_name: str) -> list[str]:
    """Tokens / substrings used to find `drug_b` inside another drug's interaction text."""
    name = (drug_name or "").strip()
    if not name:
        return []
    tokens: list[str] = []
    primary = _primary_search_term(name)
    if primary:
        tokens.append(primary)
    low = name.lower()
    if low not in tokens:
        tokens.append(low)
    # Add whole-name alnum compact form if distinct
    compact = re.sub(r"[^a-z0-9]+", "", low)
    if len(compact) >= 4 and compact not in tokens:
        tokens.append(compact)
    return tokens


def _concat_interaction_sections(label: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("drug_interactions", "drug_interactions_table", "warnings_and_cautions"):
        block = label.get(key)
        if isinstance(block, list):
            parts.extend(str(x) for x in block if x)
        elif isinstance(block, str):
            parts.append(block)
    return "\n\n".join(parts)


def fetch_openfda_label_for_term(session: requests.Session, term: str) -> dict[str, Any] | None:
    """
    GET openFDA drug label (first hit) for `openfda.generic_name` ~ term.
    Results are cached in-process for OPENFDA_CACHE_TTL_SECONDS.
    """
    term = (term or "").strip()
    if not term:
        return None

    cache_key = f"gen:{term.lower()}"
    cached = _cache_get(cache_key)
    if cached is not _MISSING:
        return cached

    params: dict[str, str | int] = {
        "search": f'openfda.generic_name:"{term}"',
        "limit": 1,
    }
    if OPENFDA_API_KEY:
        params["api_key"] = OPENFDA_API_KEY

    try:
        resp = session.get(
            OPENFDA_LABEL_URL,
            params=params,
            timeout=getattr(settings, "OPENFDA_REQUEST_TIMEOUT", 25),
        )
        resp.raise_for_status()
        body = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("openFDA label request failed for term=%r: %s", term, e)
        _cache_set(cache_key, None)
        return None

    results = body.get("results")
    first = results[0] if isinstance(results, list) and results else None
    if isinstance(first, dict):
        _cache_set(cache_key, first)
        return first

    # Broad fallback without inner quotes (some labels index differently)
    params2 = {"search": f"openfda.generic_name:{term}", "limit": 1}
    if OPENFDA_API_KEY:
        params2["api_key"] = OPENFDA_API_KEY
    try:
        resp2 = session.get(
            OPENFDA_LABEL_URL,
            params=params2,
            timeout=getattr(settings, "OPENFDA_REQUEST_TIMEOUT", 25),
        )
        resp2.raise_for_status()
        body2 = resp2.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("openFDA label fallback failed for term=%r: %s", term, e)
        _cache_set(cache_key, None)
        return None

    results2 = body2.get("results")
    first2 = results2[0] if isinstance(results2, list) and results2 else None
    if isinstance(first2, dict):
        _cache_set(cache_key, first2)
        return first2

    _cache_set(cache_key, None)
    return None


def _text_mentions_drug(haystack_lower: str, drug_b_name: str) -> bool:
    for tok in _collect_match_tokens(drug_b_name):
        if len(tok) < 3:
            continue
        if tok in haystack_lower:
            return True
    return False


def _snippet_around(haystack: str, needle: str, radius: int = 380) -> str:
    low = haystack.lower()
    idx = low.find(needle.lower())
    if idx < 0:
        return haystack[: min(800, len(haystack))].strip()
    start = max(0, idx - radius)
    end = min(len(haystack), idx + len(needle) + radius)
    snip = haystack[start:end].strip()
    if start > 0:
        snip = "…" + snip
    if end < len(haystack):
        snip = snip + "…"
    return snip


def _severity_from_snippet(snippet_lower: str) -> str:
    if any(
        x in snippet_lower
        for x in (
            "contraindicated",
            "contraindication",
            "do not use",
            "coadministration is not recommended",
            "avoid concomitant",
            "fatal",
            "life-threatening",
        )
    ):
        return "major"
    if any(
        x in snippet_lower
        for x in (
            "increase the risk of bleeding",
            "increased risk",
            "increase inr",
            "decrease inr",
            "potentiate",
            "may potentiate",
            "serious",
            "hemorrhage",
            "bleeding",
        )
    ):
        return "moderate"
    if any(x in snippet_lower for x in ("monitor", "caution", "consider", "dose adjustment")):
        return "minor"
    return "moderate"


def compute_pairwise_interactions(
    extracted_medications: list[dict[str, Any]],
    *,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """
    For each unordered pair (A, B), load FDA label text for A and check whether the
    `drug_interactions` (+ related) sections mention B by name; repeat for B mentioning A.

    Returns a JSON-serializable dict suitable for `MedicationProfile.interaction_results`.
    """
    own_session = session is None
    sess = session or requests.Session()

    meds: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in extracted_medications or []:
        if not isinstance(item, dict):
            continue
        n = item.get("name")
        if not isinstance(n, str) or not n.strip():
            continue
        key = n.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        meds.append({"name": n.strip(), "rxnorm_id": item.get("rxnorm_id")})

    out: dict[str, Any] = {
        "source": "openfda_drug_label",
        "label_url": OPENFDA_LABEL_URL,
        "pairwise": [],
        "per_drug_notes": [],
        "pairs_checked": 0,
    }

    if len(meds) < 2:
        if own_session:
            sess.close()
        return out

    # Pre-fetch label blobs per unique primary term
    term_to_text: dict[str, str] = {}
    for m in meds:
        term = _primary_search_term(m["name"])
        if not term or term in term_to_text:
            continue
        label = fetch_openfda_label_for_term(sess, term)

        if not label:
            out["per_drug_notes"].append(
                {
                    "drug": m["name"],
                    "term": term,
                    "note": "No matching FDA label found for this search term.",
                },
            )
            term_to_text[term] = ""
            continue

        text = _concat_interaction_sections(label)
        term_to_text[term] = text

    n = len(meds)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = meds[i], meds[j]
            term_a = _primary_search_term(a["name"])
            term_b = _primary_search_term(b["name"])
            out["pairs_checked"] += 1

            text_a = term_to_text.get(term_a, "")
            text_b = term_to_text.get(term_b, "")
            low_a, low_b = text_a.lower(), text_b.lower()

            hit_from_a = bool(text_a) and _text_mentions_drug(low_a, b["name"])
            hit_from_b = bool(text_b) and _text_mentions_drug(low_b, a["name"])

            if not hit_from_a and not hit_from_b:
                out["pairwise"].append(
                    {
                        "drug_a": a["name"],
                        "drug_b": b["name"],
                        "has_interaction": False,
                        "severity": None,
                        "description": "",
                        "direction": None,
                    },
                )
                continue

            if hit_from_a:
                needle = next(
                    (t for t in _collect_match_tokens(b["name"]) if t in low_a),
                    _primary_search_term(b["name"]),
                )
                snippet = _snippet_around(text_a, needle)
                sev = _severity_from_snippet(snippet.lower())
                out["pairwise"].append(
                    {
                        "drug_a": a["name"],
                        "drug_b": b["name"],
                        "has_interaction": True,
                        "severity": sev,
                        "description": snippet,
                        "direction": f"FDA label ({a['name']}) drug interactions section references {b['name']}.",
                    },
                )
            elif hit_from_b:
                needle = next(
                    (t for t in _collect_match_tokens(a["name"]) if t in low_b),
                    _primary_search_term(a["name"]),
                )
                snippet = _snippet_around(text_b, needle)
                sev = _severity_from_snippet(snippet.lower())
                out["pairwise"].append(
                    {
                        "drug_a": a["name"],
                        "drug_b": b["name"],
                        "has_interaction": True,
                        "severity": sev,
                        "description": snippet,
                        "direction": f"FDA label ({b['name']}) drug interactions section references {a['name']}.",
                    },
                )

    if own_session:
        sess.close()

    return out


def clear_openfda_cache_for_tests() -> None:
    with _cache_lock:
        _cache.clear()


__all__ = [
    "OpenfdaInteractionError",
    "compute_pairwise_interactions",
    "fetch_openfda_label_for_term",
    "clear_openfda_cache_for_tests",
]
