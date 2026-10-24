from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph
from athanor_api.validation.contracts import are_contracts_compatible


def test_validate_text_transform_fixture(contracts_root: Path, client: TestClient) -> None:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    # Ensure required config is present for a clean validation.
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["instruction"] = "uppercase the input"
        if node["type"] == "foundation.text_input":
            node["configuration"]["value"] = "hello"

    response = client.post("/api/v1/projects/validate", json={"graph": document})
    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["issues"] == []


def test_validate_rejects_incompatible_contracts(contracts_root: Path) -> None:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    # Force incompatible contracts on the first edge endpoints.
    for node in document["nodes"]:
        if node["id"] == "node-text-input-01":
            node["outputs"][0]["contractType"] = "IMAGE"
    graph = ArchitectureGraph.model_validate(document)
    issues = validate_architecture_graph(graph)
    codes = {issue.code for issue in issues}
    assert "CONTRACT_INCOMPATIBLE" in codes


def test_any_contract_is_only_a_wildcard_for_inputs() -> None:
    from athanor_api.schemas.graph import ContractType

    assert are_contracts_compatible(ContractType.IMAGE, ContractType.ANY)
    assert not are_contracts_compatible(ContractType.ANY, ContractType.IMAGE)


def test_validate_requires_transform_instruction(contracts_root: Path) -> None:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["instruction"] = "   "
    graph = ArchitectureGraph.model_validate(document)
    issues = validate_architecture_graph(graph)
    assert any(issue.code == "MISSING_CONFIGURATION" for issue in issues)


def test_node_definitions_lists_foundation(client: TestClient) -> None:
    response = client.get("/api/v1/node-definitions")
    assert response.status_code == 200
    types = [item["type"] for item in response.json()["items"]]
    assert "foundation.json_input" in types
    assert "foundation.secret_reference" in types
    assert "fine_tuning.dataset_loader" in types
    assert "model.predictive" in types
    assert len(types) == 64
    assert len(set(types)) == len(types)
