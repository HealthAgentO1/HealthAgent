"""
Map Symptom Check LLM output to safe NUCC taxonomy codes for NPPES (NPI-2) search.

The LLM may propose clinically irrelevant or non-facility codes (e.g., individual
specialties, eye clinics) that still return matches in the patient's ZIP. We filter to
an allowlist of broad facility types and order attempts by `suggested_care_setting` so
abdominal pain + ED routing does not surface unrelated specialties.
"""

from __future__ import annotations

from typing import Final

# NUCC Healthcare Provider Taxonomy — organizational sites appropriate for general triage.
# Explicit allowlist avoids "first hit wins" on narrow specialties from model drift.
ALLOWED_FACILITY_TAXONOMY_CODES: Final[frozenset[str]] = frozenset(
    {
        "282N00000X",  # General Acute Care Hospital
        "282NC2000X",  # Childrens Hospital
        "261QU0200X",  # Clinic/Center; Urgent Care
        "261QP2300X",  # Primary Care Medical Clinic
        "261QA0003X",  # Federally Qualified Health Center (FQHC)
        "261QC1500X",  # Community Clinic
        "261QR1300X",  # Rural Health Clinic
    }
)

# Order in which to try taxonomy codes for NPPES given the LLM's care setting.
# This runs *before* leftover LLM suggestions so emergency care always tries hospitals first.
CARE_SETTING_CODE_PRIORITY: Final[dict[str, tuple[str, ...]]] = {
    "emergency_department": (
        "282N00000X",
        "282NC2000X",
        "261QU0200X",
    ),
    "urgent_care": (
        "261QU0200X",
        "282N00000X",
        "261QP2300X",
    ),
    "primary_care": (
        "261QP2300X",
        "261QA0003X",
        "261QC1500X",
        "261QR1300X",
        "282N00000X",
    ),
    "telehealth": (
        "261QP2300X",
        "261QA0003X",
        "261QC1500X",
    ),
    "self_care_monitor": (
        "261QP2300X",
        "261QA0003X",
    ),
}

_DEFAULT_PRIORITY: Final[tuple[str, ...]] = (
    "282N00000X",
    "261QU0200X",
    "261QP2300X",
    "261QA0003X",
)


def _dedupe_preserve(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def resolve_nppes_taxonomy_codes(
    suggested_care_setting: str | None,
    llm_taxonomy_codes: list[str],
) -> list[str]:
    """
    Return an ordered list of NUCC codes to try against NPPES.

    - Drops LLM codes not in ALLOWED_FACILITY_TAXONOMY_CODES (e.g., eye-only clinics).
    - Prepends the full priority chain for `suggested_care_setting` so triage level
      (e.g. emergency → hospitals) always wins over the order the LLM listed codes.
    - Appends any remaining allowed LLM codes, then a general default tail.
    """
    normalized = [
        str(c).strip().upper()
        for c in llm_taxonomy_codes
        if isinstance(c, str) and str(c).strip()
    ]
    filtered = [c for c in normalized if c in ALLOWED_FACILITY_TAXONOMY_CODES]
    filtered = _dedupe_preserve(filtered)

    setting = (suggested_care_setting or "").strip().lower()
    priority = CARE_SETTING_CODE_PRIORITY.get(setting, _DEFAULT_PRIORITY)

    ordered: list[str] = []
    seen: set[str] = set()

    def add(code: str) -> None:
        if code in seen:
            return
        seen.add(code)
        ordered.append(code)

    for p in priority:
        add(p)
    for c in filtered:
        add(c)
    for p in _DEFAULT_PRIORITY:
        add(p)

    return ordered
