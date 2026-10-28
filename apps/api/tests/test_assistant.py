"""Assistant catalog tools, draft validation, and vault token handling."""

from __future__ import annotations

import io
import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from mcp import Client

from athanor_api.assistant.draft import DraftError, generate_draft, post_chat, validate_draft
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
        {"ref": "sandbox", "taskId": "t1", "type": "sandbox.podman", "configuration": {}},
    ],
    "edges": [
        {"source": "model", "sourcePort": "model", "target": "agent", "targetPort": "model"},
        {"source": "sandbox", "sourcePort": "sandbox", "target": "agent", "targetPort": "sandbox"},
    ],
}

PLAN = {
    "taskId": "t1",
    "approach": "Research facts using supplied evidence.",
    "inputContract": "A research topic and supplied source passages.",
    "outputContract": "A fact summary with references and unresolved questions.",
    "steps": [
        "Check whether source passages are supplied.",
        "Extract facts with source references.",
        "Return a cited summary or report missing evidence.",
    ],
    "acceptanceChecks": [
        "Every fact has a source reference.",
        "Missing sources produce a blocked result, not invented facts.",
    ],
    "tools": [],
    "setupRequirements": [],
}


def test_validate_draft_accepts_catalog_blocks() -> None:
    draft = validate_draft(WORKFLOW, PROPOSAL)
    assert draft["nodes"][0]["type"] == "agent.model"
    assert "endpoint" in draft["nodes"][0]["configuration"]


@pytest.mark.parametrize(
    "field",
    [
        "taskId",
        "approach",
        "inputContract",
        "outputContract",
        "steps",
        "acceptanceChecks",
        "tools",
        "setupRequirements",
    ],
)
def test_model_receives_required_plan_fields(field) -> None:  # type: ignore[no-untyped-def]
    def post(endpoint, token, body):  # type: ignore[no-untyped-def]
        submit = next(
            tool["function"]
            for tool in body["tools"]
            if tool["function"]["name"] == "submit_task_plan"
        )
        validator = Draft202012Validator(submit["parameters"])
        validator.check_schema(submit["parameters"])
        validator.validate(PLAN)
        malformed = deepcopy(PLAN)
        del malformed[field]
        assert not validator.is_valid(malformed)
        return {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "submit-1",
                                "type": "function",
                                "function": {
                                    "name": "submit_task_plan",
                                    "arguments": json.dumps(PLAN),
                                },
                            }
                        ]
                    }
                }
            ],
        }

    result = generate_draft(
        endpoint="http://127.0.0.1:8081/v1/chat/completions",
        model="local-model",
        workflow=WORKFLOW,
        token="local-no-auth",
        post=post,
    )
    assert {n["type"] for n in result["nodes"]} == {
        "agent.model",
        "agent.sandboxed",
        "sandbox.podman",
        "agent.guardrails",
    }


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


@pytest.mark.parametrize("route", ["draft", "ask"])
@pytest.mark.parametrize("auth", [{}, {"useToken": True}])
def test_locked_vault_does_not_call_the_model(tmp_path: Path, monkeypatch, route, auth) -> None:  # type: ignore[no-untyped-def]
    reset_vault_service_for_tests(
        LocalVaultService(VaultStore(tmp_path / "vault.enc", idle_ttl_seconds=1800))
    )
    calls: list[dict[str, object]] = []

    def post(endpoint: str, token: str, body: dict[str, object]) -> dict[str, object]:
        calls.append(body)
        return {}

    monkeypatch.setattr("athanor_api.assistant.draft.post_chat", post)
    monkeypatch.setattr("athanor_api.assistant.ask.post_chat", post)
    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/assistant/{route}",
            json={
                "endpoint": "https://models.example/v1/chat/completions",
                "workflow": WORKFLOW,
                "question": "What is deployed?",
                **auth,
            },
        )
    assert response.status_code == 423
    assert calls == []
    assert TOKEN not in response.text
    reset_vault_service_for_tests(None)


@pytest.mark.parametrize("route", ["draft", "ask"])
def test_token_disabled_skips_vault_and_calls_model(monkeypatch, route) -> None:  # type: ignore[no-untyped-def]
    def unexpected_vault_access():  # type: ignore[no-untyped-def]
        raise AssertionError("Token-disabled requests must not read the vault")

    monkeypatch.setattr(
        "athanor_api.assistant.routes.require_assistant_token", unexpected_vault_access
    )
    seen = []

    def post(endpoint, token, body):  # type: ignore[no-untyped-def]
        assert token == ""
        seen.append(body)
        message = {"content": "A research agent is deployed."}
        if route == "draft":
            message = {
                "tool_calls": [
                    {
                        "id": "call-1",
                        "type": "function",
                        "function": {"name": "submit_task_plan", "arguments": json.dumps(PLAN)},
                    }
                ]
            }
        return {"choices": [{"message": message}]}

    monkeypatch.setattr("athanor_api.assistant.draft.post_chat", post)
    monkeypatch.setattr("athanor_api.assistant.ask.post_chat", post)
    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/assistant/{route}",
            json={
                "endpoint": "http://127.0.0.1:8081/v1/chat/completions",
                "workflow": WORKFLOW,
                "question": "What is deployed?",
                "useToken": False,
            },
        )
    assert response.status_code == 200
    assert seen


@pytest.mark.parametrize("token", ["", TOKEN])
def test_model_authorization_header_is_optional(monkeypatch, token) -> None:  # type: ignore[no-untyped-def]
    def open_request(request, timeout):  # type: ignore[no-untyped-def]
        if token:
            assert request.get_header("Authorization") == f"Bearer {token}"
            assert token.encode() not in request.data
        else:
            assert not request.has_header("Authorization")
        return io.BytesIO(b'{"choices": []}')

    monkeypatch.setattr("athanor_api.assistant.draft.urllib.request.urlopen", open_request)
    assert post_chat("http://127.0.0.1:8081/v1/chat/completions", token, {"model": "local"}) == {
        "choices": []
    }


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
                                    "name": "submit_task_plan",
                                    "arguments": json.dumps(PLAN),
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
