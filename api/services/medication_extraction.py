from __future__ import annotations

from typing import Any

from .medication_llm_service import MedicationLlmError, extract_medication_names_via_llm
from .rxnorm_lookup import resolve_rxnorm_id_for_drug_name


def extract_medications_with_rxnorm(free_text: str) -> list[dict[str, Any]]:
    """
    Extract medication mentions from free text via DeepSeek (OpenAI-compatible API),
    then attach RxNorm RxCUIs (from the model when present, otherwise RxNav lookup).
    """
    raw = (free_text or "").strip()
    if not raw:
        return []

    items = extract_medication_names_via_llm(raw)

    seen: set[str] = set()
    results: list[dict[str, Any]] = []

    for item in items:
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue

        from_llm = item.get("rxnorm_id")
        if from_llm is not None and not isinstance(from_llm, str):
            from_llm = str(from_llm).strip() or None
        rx_id = from_llm or resolve_rxnorm_id_for_drug_name(name)

        dedupe_key = rx_id or name.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        entry: dict[str, Any] = {
            "name": name.strip(),
            "rxnorm_id": rx_id,
        }
        if rx_id and from_llm:
            entry["rxnorm_source"] = "deepseek"
        elif rx_id:
            entry["rxnorm_source"] = "rxnav"
        else:
            entry["rxnorm_source"] = None

        results.append(entry)

    return results


__all__ = ["MedicationLlmError", "extract_medications_with_rxnorm"]
