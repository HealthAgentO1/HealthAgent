"""
Batched LLM pass: plain-English summaries for pairwise FDA label interaction excerpts.
Optional; failures are non-fatal for regimen safety.

Summaries are cached in-process by content hash (drug pair + direction + excerpt) with TTL
so regimen changes that repeat the same SPL window do not re-call the LLM.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings

from .medication_llm_service import (
    MedicationLlmError,
    _strip_json_fence,
    complete_openai_compatible_json,
)

logger = logging.getLogger(__name__)

_cache_lock = threading.Lock()
# content-hash -> (monotonic_expiry, description_plain); LRU by touch order
_plain_lru: OrderedDict[str, tuple[float, str]] = OrderedDict()


@lru_cache(maxsize=1)
def _system_prompt() -> str:
    path = (
        Path(__file__).resolve().parent.parent
        / "prompts"
        / "interaction_excerpt_plain_system.txt"
    )
    return path.read_text(encoding="utf-8").strip()


def _ttl_seconds() -> float:
    return float(
        getattr(
            settings,
            "INTERACTION_PLAIN_CACHE_TTL_SECONDS",
            604_800,  # 7 days
        ),
    )


def _max_entries() -> int:
    return max(64, int(getattr(settings, "INTERACTION_PLAIN_CACHE_MAX_ENTRIES", 1024)))


def _conflict_cache_key(drug_a: str, drug_b: str, direction: str, excerpt: str) -> str:
    payload = json.dumps(
        {
            "direction": (direction or "").strip(),
            "drug_a": (drug_a or "").strip(),
            "drug_b": (drug_b or "").strip(),
            "excerpt": (excerpt or "").strip(),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> str | None:
    now = time.monotonic()
    with _cache_lock:
        if key not in _plain_lru:
            return None
        exp, val = _plain_lru[key]
        if exp < now:
            del _plain_lru[key]
            return None
        _plain_lru.move_to_end(key)
        return val


def _cache_set(key: str, plain: str) -> None:
    exp = time.monotonic() + _ttl_seconds()
    max_e = _max_entries()
    with _cache_lock:
        if key in _plain_lru:
            del _plain_lru[key]
        _plain_lru[key] = (exp, plain)
        _plain_lru.move_to_end(key)
        while len(_plain_lru) > max_e:
            _plain_lru.popitem(last=False)


def clear_interaction_plain_cache_for_tests() -> None:
    """Reset process cache (unit tests only)."""
    with _cache_lock:
        _plain_lru.clear()


def _apply_llm_items(
    items: list[Any],
    pairwise: list[dict[str, Any]],
    n: int,
    idx_to_cache_key: dict[int, str],
) -> None:
    for it in items:
        if not isinstance(it, dict):
            continue
        idx = it.get("i")
        if isinstance(idx, bool) or not isinstance(idx, int):
            continue
        if idx < 0 or idx >= n:
            continue
        plain = it.get("plain")
        if not isinstance(plain, str) or not plain.strip():
            continue
        target = pairwise[idx]
        if not isinstance(target, dict):
            continue
        stripped = plain.strip()
        target["description_plain"] = stripped
        ck = idx_to_cache_key.get(idx)
        if ck:
            _cache_set(ck, stripped)


def enrich_pairwise_with_plain_language(pairwise: list[dict[str, Any]]) -> None:
    """
    In-place: set ``description_plain`` on rows where cache or the LLM returns a summary.

    No-op when API key is missing, when there are no interaction hits, on LLM
    errors, or on invalid JSON.
    """
    if not getattr(settings, "OPENAI_API_KEY", ""):
        return

    n = len(pairwise)
    misses: list[dict[str, Any]] = []
    idx_to_cache_key: dict[int, str] = {}

    for i, row in enumerate(pairwise):
        if not isinstance(row, dict):
            continue
        if not row.get("has_interaction"):
            continue
        excerpt = (row.get("description") or "").strip()
        if not excerpt:
            continue
        drug_a = row.get("drug_a") or ""
        drug_b = row.get("drug_b") or ""
        direction = (row.get("direction") or "").strip()
        ck = _conflict_cache_key(drug_a, drug_b, direction, excerpt)
        cached = _cache_get(ck)
        if cached is not None:
            row["description_plain"] = cached
            continue
        idx_to_cache_key[i] = ck
        misses.append(
            {
                "i": i,
                "drug_a": drug_a,
                "drug_b": drug_b,
                "direction": direction,
                "excerpt": excerpt,
            },
        )

    if not misses:
        return

    user_payload = json.dumps({"conflicts": misses}, ensure_ascii=False)

    try:
        raw = complete_openai_compatible_json(_system_prompt(), user_payload)
    except MedicationLlmError:
        logger.warning("Interaction excerpt plain-language: LLM unavailable or misconfigured.")
        return
    except Exception:
        logger.exception("Interaction excerpt plain-language: LLM request failed")
        return

    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        logger.warning("Interaction excerpt plain-language: invalid JSON from LLM.")
        return

    if not isinstance(data, dict):
        return
    items = data.get("items")
    if not isinstance(items, list):
        return

    _apply_llm_items(items, pairwise, n, idx_to_cache_key)
