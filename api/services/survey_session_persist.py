"""
Persist structured Symptom Check (`/symptom/survey-llm/`) turns onto `SymptomSession`
so dashboard history (`GET /api/sessions/`) reflects the SPA flow, not only chat.
"""

import json
import logging
import re
from typing import Any

from django.utils import timezone

from ..models import SymptomSession
from .report_service import medication_lines_for_session

logger = logging.getLogger(__name__)

MAX_LOG_RAW = 100_000

SEVERITY_TO_TRIAGE = {
    "mild": "routine",
    "moderate": "urgent",
    "severe": "emergency",
}


def parse_llm_json_payload(raw_text: str) -> Any:
    """Strip optional Markdown JSON fence (same idea as the SPA) and `json.loads`."""
    text = raw_text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)```\s*$", text, re.IGNORECASE | re.DOTALL)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


def _truncate_raw(raw_text: str) -> str:
    if len(raw_text) <= MAX_LOG_RAW:
        return raw_text
    return raw_text[:MAX_LOG_RAW] + "\n…(truncated)"


def append_survey_turn(
    session: SymptomSession,
    *,
    phase: str,
    user_payload: dict,
    raw_text: str,
) -> None:
    entry = {
        "role": "survey_turn",
        "phase": phase,
        "timestamp": timezone.now().isoformat(),
        "user_payload": user_payload,
        "raw_text": _truncate_raw(raw_text),
    }
    session.ai_conversation_log = list(session.ai_conversation_log or []) + [entry]


def apply_condition_assessment_summary(
    session: SymptomSession,
    *,
    raw_text: str,
    user_payload: dict,
) -> None:
    try:
        parsed = parse_llm_json_payload(raw_text)
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("Could not parse condition_assessment JSON for session %s", session.pk)
        return
    if not isinstance(parsed, dict):
        return

    overall = parsed.get("overall_patient_severity")
    conditions = parsed.get("conditions")
    triage = SEVERITY_TO_TRIAGE.get(overall) if isinstance(overall, str) else None
    if triage:
        session.triage_level = triage

    titles: list[str] = []
    if isinstance(conditions, list):
        for c in conditions:
            if isinstance(c, dict):
                t = c.get("title")
                if isinstance(t, str) and t.strip():
                    titles.append(t.strip())

    symptoms = user_payload.get("symptoms")
    sym_str = symptoms.strip()[:800] if isinstance(symptoms, str) else ""
    summary_bits: list[str] = [sym_str] if sym_str else []
    if titles:
        summary_bits.append("Conditions considered: " + ", ".join(titles[:6]))
    patient_summary = "\n\n".join(summary_bits).strip() or "Symptom check completed."

    session.pre_visit_report = {
        "patient_summary": patient_summary,
        "reported_symptoms": [sym_str] if sym_str else [],
        "triage_level": session.triage_level,
        "overall_patient_severity": overall if isinstance(overall, str) else None,
        "medications": medication_lines_for_session(session),
    }
