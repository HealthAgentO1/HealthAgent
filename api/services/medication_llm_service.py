from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


class MedicationLlmError(Exception):
    """DeepSeek / OpenAI-compatible medication extraction failed."""


def _prompts_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "prompts"


@lru_cache(maxsize=1)
def get_medication_extract_system_prompt() -> str:
    path = _prompts_dir() / "medication_extract_system.txt"
    return path.read_text(encoding="utf-8").strip()


def _strip_json_fence(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text, flags=re.IGNORECASE)
    return text.strip()


def _optional_med_str(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, (str, int, float)):
        s = str(val).strip()
        return s if s else None
    return None


def parse_medication_llm_json(raw: str) -> list[dict[str, Any]]:
    text = _strip_json_fence(raw)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Medication JSON must be an object")
    meds = data.get("medications")
    if not isinstance(meds, list):
        raise ValueError("Missing or invalid medications array")

    out: list[dict[str, Any]] = []
    for m in meds:
        if not isinstance(m, dict):
            continue
        common = _optional_med_str(m.get("common_name"))
        scientific = _optional_med_str(m.get("scientific_name"))
        # Backward compatibility if the model returns legacy {"name": "..."} only.
        legacy = _optional_med_str(m.get("name"))
        if common and scientific and common.lower() == scientific.lower():
            common = None
        if not common and not scientific and not legacy:
            continue
        # Prefer INN/scientific for RxNorm lookup, then brand/common, then legacy `name`.
        lookup = scientific or common or legacy
        if not lookup:
            continue
        rid = m.get("rxnorm_id")
        rxnorm_id: str | None
        if rid is None:
            rxnorm_id = None
        elif isinstance(rid, (str, int)):
            s = str(rid).strip()
            rxnorm_id = s if s else None
        else:
            rxnorm_id = None
        out.append(
            {
                "common_name": common,
                "scientific_name": scientific,
                "name": lookup.strip(),
                "rxnorm_id": rxnorm_id,
            }
        )

    return out


def _complete_openai_compatible(system_prompt: str, user_text: str) -> str:
    """Call configured OpenAI-compatible API (DeepSeek when using default env)."""
    from openai import OpenAI

    if not settings.OPENAI_API_KEY:
        raise MedicationLlmError("OPENAI_API_KEY (or DEEPSEEK_API_KEY) is not configured")

    client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_text},
    ]

    try:
        completion = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
    except Exception as first:
        logger.warning("Medication LLM JSON mode failed (%s); retrying without.", first)
        try:
            completion = client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
            )
        except Exception as exc:
            logger.exception("Medication LLM request failed")
            raise MedicationLlmError(str(exc)) from exc

    choice = completion.choices[0]
    content = choice.message.content
    if not content:
        raise MedicationLlmError("Empty completion from LLM")
    return content


def extract_medication_names_via_llm(free_text: str) -> list[dict[str, Any]]:
    """
    Ask the LLM (DeepSeek via OpenAI-compatible API by default) for structured medications.
    Each item: {"common_name": str | None, "scientific_name": str | None, "name": str, "rxnorm_id": str | None}.
    `name` is a lookup/display fallback (scientific, else common, else legacy).
    """
    raw = (free_text or "").strip()
    if not raw:
        return []

    system_prompt = get_medication_extract_system_prompt()
    try:
        llm_raw = _complete_openai_compatible(system_prompt, raw)
        return parse_medication_llm_json(llm_raw)
    except json.JSONDecodeError as exc:
        raise MedicationLlmError(f"LLM returned invalid JSON: {exc}") from exc
    except ValueError as exc:
        raise MedicationLlmError(str(exc)) from exc
