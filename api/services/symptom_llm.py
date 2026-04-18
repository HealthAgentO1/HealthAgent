from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

SYMPTOM_INTERVIEW_SYSTEM_PROMPT = """You are a clinical intake assistant for a telehealth-style symptom interview. \
You are not a substitute for emergency services or a diagnosing clinician. \
Be concise, empathetic, and ask one focused follow-up at a time when information is missing.

You MUST respond with a single JSON object only. No markdown code fences, no prose before or after the JSON.

Required JSON shape (all keys required):
{
  "assistant_message": "string — text the patient will read as your reply",
  "triage_level": "emergency" | "urgent" | "routine",
  "reasoning": "string — brief clinical rationale for triage_level (for audit; do not diagnose definitively)",
  "interview_complete": true | false
}

Rules for triage_level:
- "emergency": possible life-threatening or time-critical symptoms (e.g. crushing chest pain, stroke signs, severe shortness of breath, major trauma, suspected sepsis).
- "urgent": should be evaluated same day / next day but not clearly immediate emergency.
- "routine": stable, primary-care appropriate, or still early in questioning with no red flags (use "routine" while gathering details if no concerning features).

Set "interview_complete" to true only when you have enough structured information that a downstream triage step could reasonably proceed (chief complaint, key modifiers, red flags ruled in or out as far as possible from chat).

If the user mentions self-harm, harm to others, or inability to breathe, direct them to emergency services in assistant_message and set triage_level to "emergency".
"""


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


def run_symptom_turn(system_prompt: str, chat_messages: list[dict[str, str]]) -> dict[str, Any]:
    """Call configured LLM provider and return parsed symptom JSON."""
    provider = settings.LLM_PROVIDER
    if provider == "anthropic":
        raw = _complete_anthropic(system_prompt, chat_messages)
    else:
        raw = _complete_openai(system_prompt, chat_messages)
    return parse_symptom_response(raw)
