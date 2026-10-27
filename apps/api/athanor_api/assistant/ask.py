"""Answer a deployment question from retrieved project passages."""

from __future__ import annotations

import json
from typing import Any

from athanor_api.assistant.draft import AssistantError, ChatPost, post_chat
from athanor_api.secret_scan import redact_embedded_secrets


def answer_question(
    *,
    endpoint: str,
    model: str,
    token: str,
    question: str,
    passages: list[dict[str, Any]],
    post: ChatPost | None = None,
) -> str:
    sender = post or post_chat
    safe_passages = []
    for passage in passages:
        if not isinstance(passage, dict):
            continue
        safe_passages.append(
            {
                "label": redact_embedded_secrets(str(passage.get("label") or "")),
                "text": redact_embedded_secrets(str(passage.get("text") or "")),
            }
        )
    body = {
        "model": model,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Answer questions about this AthanorIDE deployment using only the supplied "
                    "passages. If they do not contain the answer, say so. "
                    "Do not invent credentials."
                ),
            },
            {
                "role": "user",
                "content": json_question(redact_embedded_secrets(question), safe_passages),
            },
        ],
    }
    response = sender(endpoint, token, body)
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise AssistantError(502, "The model endpoint returned no choices.")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise AssistantError(502, "The model endpoint returned no message.")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise AssistantError(502, "The model endpoint returned an empty answer.")
    return redact_embedded_secrets(content)


def json_question(question: str, passages: list[dict[str, str]]) -> str:
    return json.dumps({"question": question, "passages": passages})
