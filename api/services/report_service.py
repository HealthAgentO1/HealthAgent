from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from django.conf import settings

from .symptom_llm import complete_llm_chat, conversation_log_to_chat_messages
from .symptom_llm import trim_chat_messages
from ..models import MedicationProfile, SymptomSession

logger = logging.getLogger(__name__)

EXPECTED_REPORT_KEYS = {
    "chief_complaint",
    "hpi",
    "triage_level",
    "patient_description",
    "risk_factors",
    "medications",
}


def _prompts_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "prompts"


def get_pre_visit_report_system_prompt() -> str:
    path = _prompts_dir() / "pre_visit_report_system.txt"
    return path.read_text(encoding="utf-8").strip()


def _strip_json_fence(raw_text: str) -> str:
    text = raw_text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text, flags=re.IGNORECASE)
    return text.strip()


def parse_pre_visit_report_response(raw_text: str) -> dict[str, Any]:
    text = _strip_json_fence(raw_text)
    data = json.loads(text)

    if not isinstance(data, dict):
        raise ValueError("Pre-visit report response must be a JSON object")

    missing = EXPECTED_REPORT_KEYS - set(data.keys())
    if missing:
        raise ValueError(f"Missing keys in report response: {sorted(missing)}")

    triage = data.get("triage_level")
    if triage not in ("emergency", "urgent", "routine"):
        raise ValueError("Invalid triage_level")

    if not isinstance(data["chief_complaint"], str):
        raise ValueError("chief_complaint must be a string")
    if not isinstance(data["hpi"], str):
        raise ValueError("hpi must be a string")
    if not isinstance(data["patient_description"], str):
        raise ValueError("patient_description must be a string")
    if not isinstance(data["risk_factors"], list):
        raise ValueError("risk_factors must be a list")
    if not isinstance(data["medications"], list):
        raise ValueError("medications must be a list")

    data["risk_factors"] = [str(item).strip() for item in data["risk_factors"] if str(item).strip()]
    data["medications"] = [str(item).strip() for item in data["medications"] if str(item).strip()]
    return data


def _serialize_survey_context(session: SymptomSession) -> str:
    lines: list[str] = []
    for entry in session.ai_conversation_log or []:
        if not isinstance(entry, dict) or entry.get("role") != "survey_turn":
            continue

        phase = entry.get("phase")
        if isinstance(phase, str) and phase.strip():
            lines.append(f"Phase: {phase.strip()}")

        payload = entry.get("user_payload")
        if isinstance(payload, dict):
            symptoms = payload.get("symptoms")
            if isinstance(symptoms, str) and symptoms.strip():
                lines.append(f"Reported symptoms: {symptoms.strip()}")
            insurance = payload.get("insurance_label")
            if isinstance(insurance, str) and insurance.strip():
                lines.append(f"Insurance label: {insurance.strip()}")

        raw_text = entry.get("raw_text")
        if isinstance(raw_text, str) and raw_text.strip():
            lines.append("Model output:")
            lines.append(raw_text.strip())

    return "\n".join(lines).strip()


def _serialize_conversation(session: SymptomSession) -> str:
    messages = conversation_log_to_chat_messages(session.ai_conversation_log or [])
    if messages:
        formatted_lines: list[str] = []
        for message in messages:
            role = "Patient" if message["role"] == "user" else "Assistant"
            content = str(message["content"]).strip()
            if not content:
                continue
            formatted_lines.append(f"{role}: {content}")

        transcript = "\n".join(formatted_lines)
        if len(transcript) > 12000:
            lines = formatted_lines[-100:]
            transcript = "\n".join(lines)
        return transcript

    return _serialize_survey_context(session)


def _known_medications(session: SymptomSession) -> list[str]:
    if not getattr(session, "user", None):
        return []

    profile = (
        MedicationProfile.objects.filter(user=session.user)
        .order_by("-created_at")
        .first()
    )
    if not profile:
        return []

    medications: list[str] = []
    if isinstance(profile.extracted_medications, list):
        for entry in profile.extracted_medications:
            if isinstance(entry, dict):
                name = entry.get("name") or entry.get("medication")
                if isinstance(name, str) and name.strip():
                    medications.append(name.strip())
            elif isinstance(entry, str) and entry.strip():
                medications.append(entry.strip())

    if medications:
        return medications

    raw = getattr(profile, "medications_raw", "") or ""
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    return lines[:20]


def merge_profile_and_llm_medications(
    profile_meds: list[str],
    llm_meds: list[str],
) -> list[str]:
    """Profile list first (saved regimen), then LLM-only additions; case-insensitive dedupe."""
    seen: set[str] = set()
    out: list[str] = []
    for source in (profile_meds, llm_meds):
        for raw in source:
            name = str(raw).strip()
            if not name:
                continue
            key = name.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(name)
    return out


def build_pre_visit_report_prompt(session: SymptomSession) -> str:
    transcript = _serialize_conversation(session)
    medications = _known_medications(session)
    medication_section = (
        "\nKnown medications:\n- " + "\n- ".join(medications)
        if medications
        else "\nKnown medications: none provided."
    )

    prompt = (
        "Patient symptom interview transcript or survey context follows. "
        "Use the transcript and available medication information to build a clinician-ready JSON pre-visit report. "
        "Return only valid JSON with the fields: chief_complaint, hpi, triage_level, patient_description, risk_factors, medications."
        "\n\n" 
        "Context:\n"
        f"{transcript}\n\n"
        "Triage Level: "
        f"{session.triage_level or 'unknown'}\n"
        f"{medication_section}\n"
        "\nOutput example:\n"
        "{\n"
        "  \"chief_complaint\": \"...\",\n"
        "  \"hpi\": \"...\",\n"
        "  \"triage_level\": \"urgent\",\n"
        "  \"patient_description\": \"...\",\n"
        "  \"risk_factors\": [\"...\"],\n"
        "  \"medications\": [\"...\"]\n"
        "}\n"
    )
    return prompt


def build_pre_visit_report(session: SymptomSession) -> dict[str, Any]:
    transcript = _serialize_conversation(session)
    if not transcript:
        logger.info("Skipped report generation: no conversation log for session %s", session.pk)
        return {}

    system_prompt = get_pre_visit_report_system_prompt()
    user_message = {"role": "user", "content": build_pre_visit_report_prompt(session)}
    trimmed = trim_chat_messages(system_prompt, [user_message], settings.LLM_MAX_INPUT_TOKENS)
    raw = complete_llm_chat(system_prompt, trimmed)
    report = parse_pre_visit_report_response(raw)

    profile_meds = _known_medications(session)
    llm_meds = report.get("medications")
    llm_list = llm_meds if isinstance(llm_meds, list) else []
    report["medications"] = merge_profile_and_llm_medications(profile_meds, llm_list)

    report["triage_level"] = session.triage_level or report["triage_level"]
    return report
