from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from athanor_api.execution import execute_architecture_graph
from athanor_api.schemas.graph import ArchitectureGraph


def _base_document(contracts_root: Path) -> dict:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["instruction"] = "uppercase the input"
        if node["type"] == "foundation.text_input":
            node["configuration"]["value"] = "hello"
    return document


def test_execute_text_transform_pipeline(contracts_root: Path) -> None:
    graph = ArchitectureGraph.model_validate(_base_document(contracts_root))
    result = execute_architecture_graph(graph)
    assert result.status == "success"
    assert len(result.steps) == 3
    assert result.final_outputs
    assert result.final_outputs[0]["value"] == "HELLO"
    assert len(result.edge_payloads) == 2


def test_execute_override_text(contracts_root: Path) -> None:
    graph = ArchitectureGraph.model_validate(_base_document(contracts_root))
    result = execute_architecture_graph(graph, override_text="world")
    assert result.final_outputs[0]["value"] == "WORLD"


def test_execute_redacts_secrets() -> None:
    graph = ArchitectureGraph.model_validate(
        {
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
                "name": "Secrets",
                "createdAt": "2026-07-24T14:00:00.000Z",
                "updatedAt": "2026-07-24T14:00:00.000Z",
            },
            "nodes": [
                {
                    "id": "sec-1",
                    "type": "foundation.secret_reference",
                    "version": "1.0.0",
                    "name": "Token",
                    "position": {"x": 0, "y": 0},
                    "configuration": {"secretName": "api-token", "provider": "env"},
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
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    result = execute_architecture_graph(graph)
    assert result.status == "success"
    assert result.steps[0].outputs["out-secret"] == "[redacted:api-token]"


def test_execute_portal_bus() -> None:
    graph = ArchitectureGraph.model_validate(
        {
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
                "name": "Portal",
                "createdAt": "2026-07-24T14:00:00.000Z",
                "updatedAt": "2026-07-24T14:00:00.000Z",
            },
            "nodes": [
                {
                    "id": "text-1",
                    "type": "foundation.text_input",
                    "version": "1.0.0",
                    "name": "Text",
                    "position": {"x": 0, "y": 0},
                    "configuration": {"value": "ping"},
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-text",
                            "name": "text",
                            "direction": "output",
                            "contractType": "STRING",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                },
                {
                    "id": "p-out",
                    "type": "foundation.portal_output",
                    "version": "1.0.0",
                    "name": "Out",
                    "position": {"x": 100, "y": 0},
                    "configuration": {
                        "busId": "bus-a",
                        "displayName": "A",
                        "contractType": "STRING",
                        "scope": "project",
                    },
                    "inputs": [
                        {
                            "id": "in-text",
                            "name": "text",
                            "direction": "input",
                            "contractType": "STRING",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                    "outputs": [],
                },
                {
                    "id": "p-in",
                    "type": "foundation.portal_input",
                    "version": "1.0.0",
                    "name": "In",
                    "position": {"x": 200, "y": 0},
                    "configuration": {
                        "busId": "bus-a",
                        "displayName": "A",
                        "contractType": "STRING",
                        "scope": "project",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-text",
                            "name": "text",
                            "direction": "output",
                            "contractType": "STRING",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                },
                {
                    "id": "view-1",
                    "type": "foundation.output_viewer",
                    "version": "1.0.0",
                    "name": "View",
                    "position": {"x": 300, "y": 0},
                    "configuration": {},
                    "inputs": [
                        {
                            "id": "in-text",
                            "name": "text",
                            "direction": "input",
                            "contractType": "STRING",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                    "outputs": [],
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "sourceNodeId": "text-1",
                    "sourcePortId": "out-text",
                    "targetNodeId": "p-out",
                    "targetPortId": "in-text",
                },
                {
                    "id": "e2",
                    "sourceNodeId": "p-in",
                    "sourcePortId": "out-text",
                    "targetNodeId": "view-1",
                    "targetPortId": "in-text",
                },
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    result = execute_architecture_graph(graph)
    assert result.status == "success"
    assert result.final_outputs[0]["value"] == "ping"


def test_execute_api(client: TestClient, contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    response = client.post(
        "/api/v1/projects/execute",
        json={"graph": document, "overrideText": "abc"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["finalOutputs"][0]["value"] == "ABC"
