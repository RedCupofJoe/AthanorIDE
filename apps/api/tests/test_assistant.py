"""Assistant catalog tools, draft validation, and vault token handling."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
from mcp import Client

from athanor_api.assistant.draft import DraftError, validate_draft
from athanor_api.assistant.mcp_server import assistant_server
from athanor_api.main import app
from athanor_api.vault.service import LocalVaultService, reset_vault_service_for_tests
from athanor_api.vault.store import VaultStore

TOKEN = "vault-token-should-stay-hidden"
WORKFLOW = {
    "tasks": [
        {
            "id": "t1",
            "name": "Research",
            "role": "Researcher",
            "expectedTasks": "Find facts",
            "constraints": "",
        }
    ],
    "transitions": [],
}
PROPOSAL = {
    "nodes": [
        {
            "ref": "model",
            "taskId": "t1",
            "type": "agent.model",
            "name": "Model",
            "configuration": {},
        },
        {
            "ref": "agent",
            "taskId": "t1",
            "type": "agent.sandboxed",
            "name": "Agent",
            "configuration": {},
        },
    ],
    "edges": [{"source": "model", "sourcePort": "model", "target": "agent", "targetPort": "model"}],
}


def test_validate_draft_accepts_catalog_blocks() -> None:
    draft = validate_draft(WORKFLOW, PROPOSAL)
    assert draft["nodes"][0]["type"] == "agent.model"
    assert "endpoint" in draft["nodes"][0]["configuration"]


def test_validate_draft_rejects_unknown_type_and_secret() -> None:
    try:
        validate_draft(
            WORKFLOW,
            {
                "nodes": [{"ref": "x", "taskId": "t1", "type": "missing.block", "name": "X"}],
                "edges": [],
            },
        )
    except DraftError as exc:
        assert any("Unknown block type" in message for message in exc.messages)
    else:
        raise AssertionError("unknown type was accepted")

    secret = "sk-" + ("a" * 20)
    try:
        validate_draft(
            WORKFLOW,
            {
                "nodes": [
                    {
                        "ref": "agent",
                        "taskId": "t1",
                        "type": "agent.sandboxed",
                        "name": "Agent",
                        "configuration": {"instructions": f"use {secret}"},
                    }
                ],
                "edges": [],
            },
        )
    except DraftError as exc:
        assert any("embedded secret" in message for message in exc.messages)
        assert secret not in "".join(exc.messages)
    else:
        raise AssertionError("secret was accepted")


def test_validate_draft_rejects_incompatible_ports() -> None:
    try:
        validate_draft(
            WORKFLOW,
            {
                "nodes": PROPOSAL["nodes"],
                "edges": [
                    {
                        "source": "model",
                        "sourcePort": "model",
                        "target": "agent",
                        "targetPort": "task",
                    }
                ],
            },
        )
    except DraftError as exc:
        assert any("Incompatible" in message for message in exc.messages)
    else:
        raise AssertionError("incompatible ports were accepted")


async def test_mcp_list_blocks_includes_sandboxed_agent() -> None:
    async with Client(assistant_server) as client:
        result = await client.call_tool("list_blocks", {})
    assert "agent.sandboxed" in str(result)


def test_locked_vault_does_not_call_the_model(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    reset_vault_service_for_tests(
        LocalVaultService(VaultStore(tmp_path / "vault.enc", idle_ttl_seconds=1800))
    )
    calls: list[dict[str, object]] = []

    def post(endpoint: str, token: str, body: dict[str, object]) -> dict[str, object]:
        calls.append(body)
        return {}

    monkeypatch.setattr("athanor_api.assistant.draft.post_chat", post)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/draft",
            json={"endpoint": "https://models.example/v1/chat/completions", "workflow": WORKFLOW},
        )
    assert response.status_code == 423
    assert calls == []
    assert TOKEN not in response.text
    reset_vault_service_for_tests(None)


def test_draft_route_hides_vault_token(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    service = LocalVaultService(VaultStore(tmp_path / "vault.enc", idle_ttl_seconds=1800))
    reset_vault_service_for_tests(service)
    service.init("passphrase-ok")
    service.put_entry("ATHANOR_ASSISTANT_TOKEN", TOKEN)
    seen: list[str] = []

    def post(endpoint: str, token: str, body: dict[str, object]) -> dict[str, object]:
        seen.append(json.dumps(body))
        assert token not in seen[-1]
        return {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call-1",
                                "type": "function",
                                "function": {
                                    "name": "submit_draft",
                                    "arguments": json.dumps(PROPOSAL),
                                },
                            }
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr("athanor_api.assistant.draft.post_chat", post)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/draft",
            json={
                "endpoint": "https://models.example/v1/chat/completions",
                "model": "assistant",
                "workflow": WORKFLOW,
            },
        )
    assert response.status_code == 200
    assert TOKEN not in response.text
    assert seen
    reset_vault_service_for_tests(None)
