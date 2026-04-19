"""
Derive SPA resume state from `SymptomSession.ai_conversation_log` (survey + chat).
"""

from __future__ import annotations

from typing import Any, TypedDict

from ..models import SymptomSession


class SessionResumePayload(TypedDict, total=False):
    session_id: str
    resume_step: str  # "intake" | "followup" | "results" | "chat"
    symptoms: str
    insurance_label: str
    followup_raw_text: str
    results_raw_text: str
    price_estimate_raw_text: str
    triage_level: str | None
    created_at: str
    # Official diagnosis after an in-person visit (patient-entered); null if not recorded.
    post_visit_diagnosis: dict[str, Any] | None


def _survey_turns(log: list | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for e in log or []:
        if isinstance(e, dict) and e.get("role") == "survey_turn":
            out.append(e)
    return out


def _first_chat_user_message(log: list | None) -> str:
    for e in log or []:
        if not isinstance(e, dict):
            continue
        if e.get("role") == "user":
            c = e.get("content")
            if isinstance(c, str) and c.strip():
                return c.strip()
    return ""


def _payload_symptoms_insurance(payload: dict[str, Any] | None) -> tuple[str, str]:
    if not isinstance(payload, dict):
        return "", ""
    s = payload.get("symptoms")
    i = payload.get("insurance_label")
    sym = s.strip() if isinstance(s, str) else ""
    ins = i.strip() if isinstance(i, str) else ""
    return sym, ins


def build_session_resume_payload(session: SymptomSession) -> SessionResumePayload:
    log = session.ai_conversation_log or []
    turns = _survey_turns(log)

    created = session.created_at
    created_s = created.isoformat().replace("+00:00", "Z") if created else ""

    pvd = session.post_visit_diagnosis
    post_visit_diagnosis: dict[str, Any] | None = None
    if isinstance(pvd, dict):
        post_visit_diagnosis = pvd

    base: SessionResumePayload = {
        "session_id": str(session.public_id),
        "triage_level": session.triage_level,
        "created_at": created_s,
        "post_visit_diagnosis": post_visit_diagnosis,
    }

    if turns:
        first_followup = next(
            (t for t in turns if t.get("phase") == "followup_questions"),
            None,
        )
        last_condition = None
        for t in reversed(turns):
            if t.get("phase") == "condition_assessment" and isinstance(t.get("raw_text"), str):
                last_condition = t
                break

        if last_condition is not None:
            base["resume_step"] = "results"
            base["results_raw_text"] = last_condition["raw_text"]
            last_price = None
            for t in reversed(turns):
                if t.get("phase") == "price_estimate_context" and isinstance(t.get("raw_text"), str):
                    last_price = t
                    break
            if last_price is not None:
                base["price_estimate_raw_text"] = last_price["raw_text"]
            up_last = (
                last_condition.get("user_payload")
                if isinstance(last_condition.get("user_payload"), dict)
                else {}
            )
            sym_l, ins_l = _payload_symptoms_insurance(up_last)
            up_first = (
                first_followup.get("user_payload")
                if first_followup and isinstance(first_followup.get("user_payload"), dict)
                else {}
            )
            sym_f, ins_f = _payload_symptoms_insurance(up_first)
            base["symptoms"] = sym_l or sym_f
            base["insurance_label"] = ins_l or ins_f
            if first_followup and isinstance(first_followup.get("raw_text"), str):
                base["followup_raw_text"] = first_followup["raw_text"]
            return base

        if first_followup and isinstance(first_followup.get("raw_text"), str):
            base["resume_step"] = "followup"
            base["followup_raw_text"] = first_followup["raw_text"]
            up0 = (
                first_followup.get("user_payload")
                if isinstance(first_followup.get("user_payload"), dict)
                else {}
            )
            sym0, ins0 = _payload_symptoms_insurance(up0)
            base["symptoms"] = sym0
            base["insurance_label"] = ins0
            return base

    if any(isinstance(e, dict) and e.get("role") in ("user", "assistant") for e in log):
        base["resume_step"] = "chat"
        base["symptoms"] = _first_chat_user_message(log)
        base["insurance_label"] = ""
        return base

    base["resume_step"] = "intake"
    base["symptoms"] = ""
    base["insurance_label"] = ""
    return base
