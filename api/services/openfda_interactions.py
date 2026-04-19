"""
Pairwise drug–drug interaction hints using the openFDA **drug label** API
(`drug/label.json`). Labels expose `drug_interactions` (FDA section 7) as searchable text.

We also surface other SPL-derived sections (boxed warning, contraindications, adverse
reactions, etc.) for display alongside interaction hints.

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
# Cap each SPL text blob so API responses stay bounded (labels can be very long).
OPENFDA_MAX_SECTION_CHARS = int(getattr(settings, "OPENFDA_MAX_SECTION_CHARS", 6_000))

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
    """Text used to search for mentions of another drug (interactions + related warnings)."""
    parts: list[str] = []
    for key in ("drug_interactions", "drug_interactions_table", "warnings_and_cautions"):
        block = label.get(key)
        if isinstance(block, list):
            parts.extend(str(x) for x in block if x)
        elif isinstance(block, str):
            parts.append(block)
    return "\n\n".join(parts)


# SPL-derived keys present on many openFDA label results (not every product has every field).
# See https://open.fda.gov/apis/drug/label/searchable-fields/
_SPL_TEXT_FIELD_KEYS: tuple[str, ...] = (
    "boxed_warning",
    "boxed_warning_table",
    "contraindications",
    "contraindications_table",
    "warnings_and_cautions",
    "warnings",
    "warnings_table",
    "precautions",
    "precautions_table",
    "general_precautions",
    "adverse_reactions",
    "adverse_reactions_table",
    "drug_interactions",
    "drug_interactions_table",
    "drug_and_or_laboratory_test_interactions",
    "drug_and_or_laboratory_test_interactions_table",
    "information_for_patients",
    "user_safety_warnings",
    "nursing_mothers",
    "pediatric_use",
    "geriatric_use",
    "use_in_specific_populations",
)


def _spl_field_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "\n\n".join(str(x).strip() for x in value if x)
    return str(value).strip()


def _truncate_for_api(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max(0, max_chars - 1)] + "…"


def extract_spl_sections_for_display(
    label: dict[str, Any] | None,
    *,
    max_chars: int | None = None,
) -> dict[str, str]:
    """
    Map openFDA label JSON to a flat dict of non-empty SPL section id -> text for API/UI.

    Keys mirror openFDA field names so the frontend can apply stable display titles.
    """
    if not label or not isinstance(label, dict):
        return {}
    cap = max_chars if max_chars is not None else OPENFDA_MAX_SECTION_CHARS
    out: dict[str, str] = {}
    for key in _SPL_TEXT_FIELD_KEYS:
        raw = _spl_field_to_text(label.get(key))
        if not raw:
            continue
        out[key] = _truncate_for_api(raw, cap)
    return out


def _escape_lucene_term(term: str) -> str:
    return term.replace("\\", "\\\\").replace('"', '\\"')


def _fetch_label_by_field(
    session: requests.Session,
    openfda_field: str,
    term: str,
) -> dict[str, Any] | None:
    """
    GET openFDA drug label (first hit) for ``openfda.<field>`` matching ``term``.

    ``openfda_field`` is ``generic_name`` or ``brand_name``. Results are cached per process.
    """
    term = (term or "").strip()
    if not term or openfda_field not in ("generic_name", "brand_name"):
        return None

    q = _escape_lucene_term(term)
    cache_key = f"{openfda_field}:{term.lower()}"
    cached = _cache_get(cache_key)
    if cached is not _MISSING:
        return cached

    params: dict[str, str | int] = {
        "search": f'openfda.{openfda_field}:"{q}"',
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
        logger.warning(
            "openFDA label request failed field=%s term=%r: %s",
            openfda_field,
            term,
            e,
        )
        _cache_set(cache_key, None)
        return None

    results = body.get("results")
    first = results[0] if isinstance(results, list) and results else None
    if isinstance(first, dict):
        _cache_set(cache_key, first)
        return first

    # Broad fallback without inner quotes (some labels index differently)
    params2 = {"search": f"openfda.{openfda_field}:{term}", "limit": 1}
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
        logger.warning(
            "openFDA label fallback failed field=%s term=%r: %s",
            openfda_field,
            term,
            e,
        )
        _cache_set(cache_key, None)
        return None

    results2 = body2.get("results")
    first2 = results2[0] if isinstance(results2, list) and results2 else None
    if isinstance(first2, dict):
        _cache_set(cache_key, first2)
        return first2

    _cache_set(cache_key, None)
    return None


def fetch_openfda_label_for_term(session: requests.Session, term: str) -> dict[str, Any] | None:
    """
    GET openFDA drug label (first hit) for ``openfda.generic_name`` ~ term.

    Kept for tests and call sites that only have a generic-style token.
    """
    return _fetch_label_by_field(session, "generic_name", term)


def _openfda_lookup_attempts(med: dict[str, Any]) -> list[tuple[str, str]]:
    """
    Build ordered (openfda_field, token) attempts.

    Prefer **scientific** / generic strings on ``generic_name``, then display name on
    ``generic_name``, then **common** (brand) and display name on ``brand_name``.
    """
    attempts: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(field: str, raw: str | None) -> None:
        if not isinstance(raw, str) or not raw.strip():
            return
        t = _primary_search_term(raw)
        if len(t) < 3:
            return
        sig = f"{field}:{t}"
        if sig in seen:
            return
        seen.add(sig)
        attempts.append((field, t))

    sci = med.get("scientific_name")
    if isinstance(sci, str) and sci.strip():
        add("generic_name", sci)
    add("generic_name", med.get("name"))
    com = med.get("common_name")
    if isinstance(com, str) and com.strip():
        add("brand_name", com)
    add("brand_name", med.get("name"))
    return attempts


def fetch_openfda_label_for_medication(
    session: requests.Session,
    med: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    """
    Try generic-name search (scientific first), then brand-name search, until a label hits.

    Returns ``(label, {"field": "generic_name"|"brand_name", "term": "..."})`` or ``(None, None)``.
    """
    for field, token in _openfda_lookup_attempts(med):
        label = _fetch_label_by_field(session, field, token)
        if label:
            return label, {"field": field, "term": token}
    return None, None


def _med_key(display_name: str) -> str:
    return (display_name or "").strip().lower()


def _match_tokens_for_pairwise_med(med: dict[str, Any]) -> list[str]:
    """Distinct tokens (name / scientific / common) used to find ``med`` inside label text."""
    out: list[str] = []
    seen: set[str] = set()
    for key in ("name", "scientific_name", "common_name"):
        raw = med.get(key)
        if not isinstance(raw, str) or not raw.strip():
            continue
        for tok in _collect_match_tokens(raw.strip()):
            if len(tok) < 3:
                continue
            k = tok.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append(tok)
    return out


def _text_mentions_drug(haystack_lower: str, other_med: dict[str, Any]) -> bool:
    for tok in _match_tokens_for_pairwise_med(other_med):
        if len(tok) < 3:
            continue
        if tok.lower() in haystack_lower:
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
    """
    Map a label excerpt to mild / moderate / severe using keyword heuristics.

    These strings are consumed by the aggregate safety score and the SPA; they are
    not clinical grades.
    """
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
        return "severe"
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
        return "mild"
    return "moderate"


def _smart_interaction_excerpt(haystack: str, other_med: dict[str, Any]) -> str:
    """
    Pick FDA label text that best highlights co-mention of ``other_med``.

    Prefer whole paragraphs (split on blank lines) that both mention the other drug and carry
    stronger interaction language; fall back to a centered window around the longest matching
    token. This avoids leading with unrelated boilerplate when the first substring hit is a
    passing reference.
    """
    raw = (haystack or "").strip()
    if not raw:
        return ""

    tokens = _match_tokens_for_pairwise_med(other_med)
    tokens = [t for t in tokens if len(t) >= 3]
    if not tokens:
        return raw[: min(800, len(raw))].strip()

    low = raw.lower()
    if not any(t.lower() in low for t in tokens):
        return _snippet_around(raw, tokens[0], radius=420)

    # Prefer longest token when narrowing a huge paragraph (brand + generic substrings).
    tokens_by_len = sorted(tokens, key=len, reverse=True)

    candidates: list[str] = []
    for chunk in re.split(r"\n\s*\n+", raw):
        c = chunk.strip()
        if not c:
            continue
        cl = c.lower()
        if not any(t.lower() in cl for t in tokens):
            continue
        if len(c) > 1100:
            needle = next((t for t in tokens_by_len if t.lower() in cl), tokens[0])
            c = _snippet_around(c, needle, radius=480)
        candidates.append(c)

    if not candidates:
        needle = next((t for t in tokens_by_len if t.lower() in low), tokens[0])
        return _snippet_around(raw, needle, radius=480)

    def sort_key(s: str) -> tuple[int, int]:
        tier = {"severe": 3, "moderate": 2, "mild": 1}[_severity_from_snippet(s.lower())]
        return (tier, -len(s))

    return max(candidates, key=sort_key)


def _prefetch_openfda_labels(
    sess: requests.Session,
    meds: list[dict[str, Any]],
    out: dict[str, Any],
) -> tuple[
    dict[str, dict[str, Any] | None],
    dict[str, str],
    dict[str, dict[str, str] | None],
]:
    """Fetch one label per medication using tiered generic-then-brand openFDA queries."""
    med_to_label: dict[str, dict[str, Any] | None] = {}
    med_to_text: dict[str, str] = {}
    med_to_query: dict[str, dict[str, str] | None] = {}

    for m in meds:
        key = _med_key(m["name"])
        if key in med_to_label:
            continue
        label, query = fetch_openfda_label_for_medication(sess, m)
        med_to_label[key] = label
        med_to_query[key] = query
        med_to_text[key] = _concat_interaction_sections(label) if label else ""
        if not label:
            out["per_drug_notes"].append(
                {
                    "drug": m["name"],
                    "term": _primary_search_term(m["name"]),
                    "note": (
                        "No matching FDA label found after searching generic_name and brand_name "
                        "on openFDA (scientific name is preferred when provided)."
                    ),
                },
            )

    return med_to_label, med_to_text, med_to_query


def _build_per_drug_label_safety(
    meds: list[dict[str, Any]],
    med_to_label: dict[str, dict[str, Any] | None],
    med_to_query: dict[str, dict[str, str] | None],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for m in meds:
        key = _med_key(m["name"])
        label_dict = med_to_label.get(key)
        label_dict = label_dict if isinstance(label_dict, dict) else None
        query = med_to_query.get(key)
        display_term = query["term"] if query else _primary_search_term(m["name"])
        rows.append(
            {
                "drug": m["name"],
                "search_term": display_term or "",
                "label_query": query,
                "label_found": bool(label_dict),
                "sections": extract_spl_sections_for_display(label_dict),
                "openfda": label_dict.get("openfda") if label_dict else None,
            },
        )
    return rows


def compute_pairwise_interactions(
    extracted_medications: list[dict[str, Any]],
    *,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """
    Load FDA SPL text per regimen drug, then:

    - For each unordered pair (A, B), check whether ``drug_interactions`` (+ related)
      text from A's label mentions B (and vice versa).
    - Attach ``per_drug_label_safety`` with boxed warnings, contraindications, adverse
      reactions, and other SPL sections for each drug (when a label is found).

    Returns a JSON-serializable dict suitable for ``MedicationProfile.interaction_results``.
    """
    own_session = session is None
    sess = session or requests.Session()

    def _optional_name_field(raw: Any) -> str | None:
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        return None

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
        row: dict[str, Any] = {"name": n.strip(), "rxnorm_id": item.get("rxnorm_id")}
        sci = _optional_name_field(item.get("scientific_name"))
        if sci:
            row["scientific_name"] = sci
        com = _optional_name_field(item.get("common_name"))
        if com:
            row["common_name"] = com
        meds.append(row)

    out: dict[str, Any] = {
        "source": "openfda_drug_label",
        "label_url": OPENFDA_LABEL_URL,
        "severity_scale": (
            "Pairwise interaction hints use keyword heuristics on FDA label wording, "
            "reported as severe, moderate, or mild (informational only)."
        ),
        "pairwise": [],
        "per_drug_notes": [],
        "per_drug_label_safety": [],
        "pairs_checked": 0,
    }

    if not meds:
        if own_session:
            sess.close()
        return out

    med_to_label, med_to_text, med_to_query = _prefetch_openfda_labels(sess, meds, out)
    out["per_drug_label_safety"] = _build_per_drug_label_safety(meds, med_to_label, med_to_query)

    if len(meds) < 2:
        if own_session:
            sess.close()
        return out

    n_meds = len(meds)
    for i in range(n_meds):
        for j in range(i + 1, n_meds):
            a, b = meds[i], meds[j]
            out["pairs_checked"] += 1

            text_a = med_to_text.get(_med_key(a["name"]), "")
            text_b = med_to_text.get(_med_key(b["name"]), "")
            low_a, low_b = text_a.lower(), text_b.lower()

            hit_from_a = bool(text_a) and _text_mentions_drug(low_a, b)
            hit_from_b = bool(text_b) and _text_mentions_drug(low_b, a)

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
                snippet = _smart_interaction_excerpt(text_a, b)
                sev = _severity_from_snippet(snippet.lower())
                out["pairwise"].append(
                    {
                        "drug_a": a["name"],
                        "drug_b": b["name"],
                        "has_interaction": True,
                        "severity": sev,
                        "description": snippet,
                        "direction": (
                            f"FDA label ({a['name']}) drug interactions section references {b['name']}."
                        ),
                    },
                )
            elif hit_from_b:
                snippet = _smart_interaction_excerpt(text_b, a)
                sev = _severity_from_snippet(snippet.lower())
                out["pairwise"].append(
                    {
                        "drug_a": a["name"],
                        "drug_b": b["name"],
                        "has_interaction": True,
                        "severity": sev,
                        "description": snippet,
                        "direction": (
                            f"FDA label ({b['name']}) drug interactions section references {a['name']}."
                        ),
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
    "extract_spl_sections_for_display",
    "fetch_openfda_label_for_medication",
    "fetch_openfda_label_for_term",
    "clear_openfda_cache_for_tests",
]
