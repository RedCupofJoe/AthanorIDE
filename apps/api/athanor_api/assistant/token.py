"""Read the assistant token from the unlocked local vault."""

from __future__ import annotations

from athanor_api.assistant import ASSISTANT_TOKEN_NAME
from athanor_api.assistant.draft import AssistantError
from athanor_api.vault.service import get_vault_service


def require_assistant_token() -> str:
    vault = get_vault_service()
    try:
        values = vault.store.get_values([ASSISTANT_TOKEN_NAME])
    except PermissionError as exc:
        raise AssistantError(423, "Unlock the local vault before using the assistant.") from exc
    token = values.get(ASSISTANT_TOKEN_NAME, "")
    if not token:
        raise AssistantError(409, "Save an assistant token in the local vault.")
    return token
