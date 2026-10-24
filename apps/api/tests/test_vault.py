"""Local secrets vault: crypto, API, coverage, materialize (no value leakage)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from athanor_api.main import app
from athanor_api.vault.crypto import decrypt_payload, encrypt_payload
from athanor_api.vault.service import LocalVaultService, reset_vault_service_for_tests
from athanor_api.vault.store import VaultStore


def test_crypto_round_trip() -> None:
    envelope = encrypt_payload(
        "passphrase-ok",
        {
            "schemaVersion": "2.0.0",
            "workflow": {
                "tasks": [],
                "transitions": [],
                "input": "",
                "maxParallelTasks": 4,
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            "entries": [{"id": "ve_1", "name": "HF_TOKEN", "value": "secret-value"}],
        },
    )
    assert "secret-value" not in json.dumps(envelope)
    payload = decrypt_payload("passphrase-ok", envelope)
    assert payload["entries"][0]["value"] == "secret-value"


def test_vault_api_lifecycle(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    store = VaultStore(tmp_path / "vault.v1.json.enc", idle_ttl_seconds=1800)
    reset_vault_service_for_tests(LocalVaultService(store))
    client = TestClient(app)

    status = client.get("/api/v1/vault/status").json()
    assert status["exists"] is False
    assert status["unlocked"] is False

    bad = client.post("/api/v1/vault/init", json={"passphrase": "short"})
    assert bad.status_code == 400

    created = client.post("/api/v1/vault/init", json={"passphrase": "passphrase-ok"})
    assert created.status_code == 200
    assert created.json()["unlocked"] is True
    assert "value" not in json.dumps(created.json()).lower() or "passphrase" not in created.json()

    put = client.put(
        "/api/v1/vault/entries/HF_TOKEN",
        json={"value": "hf-super-secret-token-value"},
    )
    assert put.status_code == 200
    body = put.json()
    assert body["name"] == "HF_TOKEN"
    assert body["hasValue"] is True
    assert "hf-super-secret" not in json.dumps(body)

    entries = client.get("/api/v1/vault/entries").json()
    assert entries["items"][0]["name"] == "HF_TOKEN"
    assert "hf-super-secret" not in json.dumps(entries)

    client.post("/api/v1/vault/lock")
    locked = client.get("/api/v1/vault/entries")
    assert locked.status_code == 401

    unlocked = client.post("/api/v1/vault/unlock", json={"passphrase": "passphrase-ok"})
    assert unlocked.status_code == 200

    wrong = client.post("/api/v1/vault/unlock", json={"passphrase": "wrong-passphrase"})
    # already unlocked; unlock again with wrong should fail after lock
    client.post("/api/v1/vault/lock")
    wrong = client.post("/api/v1/vault/unlock", json={"passphrase": "wrong-passphrase"})
    assert wrong.status_code == 401

    reset_vault_service_for_tests(None)


def test_vault_coverage_and_materialize(tmp_path: Path) -> None:
    store = VaultStore(tmp_path / "vault.v1.json.enc", idle_ttl_seconds=1800)
    reset_vault_service_for_tests(LocalVaultService(store))
    client = TestClient(app)
    client.post("/api/v1/vault/init", json={"passphrase": "passphrase-ok"})
    client.put("/api/v1/vault/entries/HF_TOKEN", json={"value": "hf-value"})

    graph = {
        "schemaVersion": "2.0.0",
        "workflow": {
            "tasks": [],
            "transitions": [],
            "input": "",
            "maxParallelTasks": 4,
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        "project": {
            "id": "p1",
            "name": "Vault",
            "createdAt": "2026-07-24T14:00:00.000Z",
            "updatedAt": "2026-07-24T14:00:00.000Z",
        },
        "nodes": [
            {
                "id": "sec-1",
                "type": "foundation.secret_reference",
                "version": "1.0.0",
                "name": "HF",
                "position": {"x": 0, "y": 0},
                "configuration": {"secretName": "HF_TOKEN", "provider": "vault"},
                "inputs": [],
                "outputs": [
                    {
                        "id": "out-secret",
                        "name": "secret",
                        "direction": "output",
                        "contractType": "STRING",
                        "required": True,
                        "multiple": False,
                    }
                ],
            }
        ],
        "edges": [],
        "infrastructureTokens": [
            {
                "id": "infra-token-docker",
                "kind": "docker",
                "label": "Docker Hub",
                "secretName": "DOCKERHUB_TOKEN",
                "provider": "env",
            }
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    coverage = client.post("/api/v1/vault/coverage", json={"graph": graph}).json()
    assert "HF_TOKEN" in coverage["present"]
    assert "DOCKERHUB_TOKEN" in coverage["missing"]
    assert "hf-value" not in json.dumps(coverage)

    env_path = tmp_path / "project" / ".env"
    result = client.post(
        "/api/v1/vault/materialize-env",
        json={"path": str(env_path), "graph": graph},
    )
    assert result.status_code == 200
    payload = result.json()
    assert payload["writtenCount"] == 1
    assert "HF_TOKEN" in payload["writtenNames"]
    assert "DOCKERHUB_TOKEN" in payload["missing"]
    assert "hf-value" not in json.dumps(payload)

    written = env_path.read_text(encoding="utf-8")
    assert "HF_TOKEN=" in written
    assert "hf-value" in written

    reset_vault_service_for_tests(None)


def test_export_still_rejects_dotenv_in_zip(tmp_path: Path) -> None:
    from athanor_api.exporter.validate_output import validate_generated_files

    issues = validate_generated_files({".env": "HF_TOKEN=secret", "README.md": "ok"})
    assert any(issue.path == ".env" for issue in issues)
