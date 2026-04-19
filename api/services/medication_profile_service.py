"""
Resolve active medication names from the user's latest MedicationProfile.
"""

from __future__ import annotations

import re
from typing import Any

from ..models import MedicationProfile

# Entries with these statuses are excluded from recall checks.
_INACTIVE_STATUSES = frozenset(
    {
        "inactive",
        "stopped",
        "discontinued",
        "ended",
        "former",
        "historical",
        "past",
        "completed",
    }
)


def _is_active_status(raw: Any) -> bool:
    if raw is None:
        return True
    if not isinstance(raw, str):
        return True
    return raw.strip().lower() not in _INACTIVE_STATUSES


def _names_from_extracted(entries: list[Any]) -> list[str]:
    out: list[str] = []
    for entry in entries:
        if isinstance(entry, dict):
            if not _is_active_status(entry.get("status")):
                continue
            name = entry.get("name") or entry.get("medication")
            if isinstance(name, str) and name.strip():
                out.append(name.strip())
        elif isinstance(entry, str) and entry.strip():
            out.append(entry.strip())
    return out


def distinct_active_names_from_entries(entries: list[Any]) -> list[str]:
    """
    Distinct active medication display names from an in-memory extraction list.

    Same active-status rules as ``get_active_medication_names`` but without reading
    the database (used by the full medication safety check before recall queries).
    """
    if not isinstance(entries, list):
        return []
    medications = _names_from_extracted(entries)
    if not medications:
        return []
    seen: set[str] = set()
    unique: list[str] = []
    for m in medications:
        key = m.casefold()
        if key not in seen:
            seen.add(key)
            unique.append(m)
    return unique


def get_active_medication_names(user) -> list[str]:
    """
    Return distinct medication display names from the latest profile that are considered active.
    Falls back to non-empty lines in medications_raw when extracted_medications is empty.
    """
    profile = (
        MedicationProfile.objects.filter(user=user).order_by("-created_at").first()
    )
    if not profile:
        return []

    medications: list[str] = []
    raw_list = profile.extracted_medications
    if isinstance(raw_list, list):
        medications.extend(_names_from_extracted(raw_list))

    if medications:
        seen: set[str] = set()
        unique: list[str] = []
        for m in medications:
            key = m.casefold()
            if key not in seen:
                seen.add(key)
                unique.append(m)
        return unique

    raw = getattr(profile, "medications_raw", "") or ""
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    return lines[:20]


def core_drug_query_term(display_name: str) -> str:
    """
    Strip dose/packaging noise so openFDA search matches generic/brand fields.
    """
    s = display_name.strip()
    if not s:
        return ""
    s = re.sub(r"\s*\([^)]*\)\s*", " ", s)
    s = re.split(r"\d", s, 1)[0].strip()
    s = re.sub(r"\s+", " ", s)
    return s[:200]
