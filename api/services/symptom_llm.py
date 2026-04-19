from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


def _prompts_dir() -> Path:
    """Directory containing `symptom_chat_system.txt` (chat transcript API, not survey prompts)."""
    return Path(__file__).resolve().parent.parent / "prompts"


@lru_cache(maxsize=1)
def get_symptom_chat_system_prompt() -> str:
    """System instructions for `POST /api/symptom/chat/` — loaded from disk, not inlined in views."""
    path = _prompts_dir() / "symptom_chat_system.txt"
    return path.read_text(encoding="utf-8").strip()


def _encoding():
    try:
        import tiktoken

        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        return None


def estimate_tokens(text: str) -> int:
    enc = _encoding()
    if enc is not None:
        return len(enc.encode(text))
    return max(1, len(text) // 4)


def message_list_token_count(system_prompt: str, chat_messages: list[dict[str, str]]) -> int:
    total = estimate_tokens(system_prompt)
    for m in chat_messages:
        total += estimate_tokens(m.get("content", ""))
        total += 4
    return total


def trim_chat_messages(
    system_prompt: str,
    chat_messages: list[dict[str, str]],
    max_input_tokens: int,
) -> list[dict[str, str]]:
    """Drop oldest turns until estimated token budget fits (keeps most recent context)."""
    if not chat_messages:
        return []

    trimmed = list(chat_messages)
    while (
        len(trimmed) > 1
        and message_list_token_count(system_prompt, trimmed) > max_input_tokens
    ):
        trimmed.pop(0)
        if trimmed and trimmed[0]["role"] == "assistant":
            trimmed.pop(0)

    while trimmed and trimmed[0]["role"] == "assistant":
        trimmed.pop(0)

    return trimmed


def conversation_log_to_chat_messages(log: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for entry in log:
        role = entry.get("role")
        if role not in ("user", "assistant"):
            continue
        content = entry.get("content")
        if not content:
            continue
        out.append({"role": role, "content": str(content)})
    return out


def parse_symptom_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    for key in ("assistant_message", "triage_level", "reasoning", "interview_complete"):
        if key not in data:
            raise ValueError(f"Missing key: {key}")
    if data["triage_level"] not in ("emergency", "urgent", "routine"):
        raise ValueError("Invalid triage_level")
    if not isinstance(data["assistant_message"], str):
        raise ValueError("assistant_message must be a string")
    if not isinstance(data["reasoning"], str):
        raise ValueError("reasoning must be a string")
    if not isinstance(data["interview_complete"], bool):
        raise ValueError("interview_complete must be boolean")
    return data


def _complete_openai(system_prompt: str, chat_messages: list[dict[str, str]]) -> str:
    from openai import OpenAI

    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY (or DEEPSEEK_API_KEY) is not configured")

    client = OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)
    messages = [{"role": "system", "content": system_prompt}, *chat_messages]

    try:
        completion = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
    except Exception as first:
        logger.warning("OpenAI-compatible JSON mode failed (%s); retrying without.", first)
        completion = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
        )

    choice = completion.choices[0]
    content = choice.message.content
    if not content:
        raise RuntimeError("Empty completion from LLM")
    return content


def _complete_anthropic(system_prompt: str, chat_messages: list[dict[str, str]]) -> str:
    import anthropic

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=2048,
        system=system_prompt,
        messages=[{"role": m["role"], "content": m["content"]} for m in chat_messages],
    )
    block = msg.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected Anthropic response block")
    return block.text


def complete_llm_chat(system_prompt: str, chat_messages: list[dict[str, str]]) -> str:
    """Low-level completion: system + alternating user/assistant messages; returns raw model text."""
    provider = settings.LLM_PROVIDER
    if provider == "anthropic":
        return _complete_anthropic(system_prompt, chat_messages)
    return _complete_openai(system_prompt, chat_messages)


def run_symptom_turn(system_prompt: str, chat_messages: list[dict[str, str]]) -> dict[str, Any]:
    """Call configured LLM provider and return parsed JSON for the conversational chat contract."""
    raw = complete_llm_chat(system_prompt, chat_messages)
    return parse_symptom_response(raw)


# Bundled next to other API prompts (`api/prompts/survey/`); keep in sync with SPA copies in
# ``frontend/src/symptomCheck/prompts/`` when prompts change.
_SURVEY_PHASE_TO_PROMPT_FILE: dict[str, str] = {
    "followup_questions": "followup_context.txt",
    "followup_questions_round_2": "followup_round2_context.txt",
    "condition_assessment": "results_context.txt",
    "price_estimate_context": "price_estimate_context.txt",
}


def _survey_prompts_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "prompts" / "survey"


@lru_cache(maxsize=16)
def get_survey_system_prompt_for_phase(phase: str) -> str:
    """
    Server-side Symptom Check system instructions keyed by survey phase. Used when
    ``settings.SYMPTOM_SURVEY_USE_SERVER_PROMPTS`` is True.
    """
    name = _SURVEY_PHASE_TO_PROMPT_FILE.get(phase)
    if not name:
        raise ValueError(f"Unknown survey phase: {phase!r}")
    path = _survey_prompts_dir() / name
    if not path.is_file():
        raise RuntimeError(f"Survey prompt file missing: {name}")
    return path.read_text(encoding="utf-8").strip()


def llm_transport_error_types() -> tuple[type[BaseException], ...]:
    """Exception types that usually indicate network/timeout to the LLM provider."""
    out: list[type[BaseException]] = []
    try:
        from openai import APIConnectionError, APITimeoutError

        out.extend([APIConnectionError, APITimeoutError])
    except ImportError:
        pass
    try:
        import anthropic

        ac = getattr(anthropic, "APIConnectionError", None)
        if ac is not None:
            out.append(ac)
    except ImportError:
        pass
    return tuple(out)


def llm_rate_limit_error_types() -> tuple[type[BaseException], ...]:
    out: list[type[BaseException]] = []
    try:
        from openai import RateLimitError

        out.append(RateLimitError)
    except ImportError:
        pass
    try:
        import anthropic

        rl = getattr(anthropic, "RateLimitError", None)
        if rl is not None:
            out.append(rl)
    except ImportError:
        pass
    return tuple(out)


def classify_survey_llm_exception(exc: BaseException) -> str:
    """
    Categorize failures from ``complete_symptom_survey_turn`` / LLM HTTP clients for HTTP mapping.
    Returns one of: rate_limit, transport, api_error, unknown.
    """
    rt = llm_rate_limit_error_types()
    if rt and isinstance(exc, rt):
        return "rate_limit"
    tt = llm_transport_error_types()
    if tt and isinstance(exc, tt):
        return "transport"
    try:
        from openai import APIError as OpenAIAPIError

        if isinstance(exc, OpenAIAPIError):
            return "api_error"
    except ImportError:
        pass
    try:
        import anthropic

        APIE = getattr(anthropic, "APIError", None)
        if APIE is not None and isinstance(exc, APIE):
            return "api_error"
    except ImportError:
        pass
    return "unknown"


def complete_symptom_survey_turn(system_prompt: str, user_payload: dict[str, Any]) -> str:
    """
    Symptom Check survey: one user message containing JSON `user_payload`, arbitrary system prompt
    (from the SPA: follow-up vs results prompt files). Returns raw model output for client-side parsing.
    """
    user_content = json.dumps(user_payload, ensure_ascii=False)
    messages: list[dict[str, str]] = [{"role": "user", "content": user_content}]
    trimmed = trim_chat_messages(
        system_prompt,
        messages,
        settings.LLM_MAX_INPUT_TOKENS,
    )
    return complete_llm_chat(system_prompt, trimmed)
