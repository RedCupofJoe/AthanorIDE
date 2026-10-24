from __future__ import annotations

from athanor_api.execution import execute_architecture_graph
from athanor_api.exporter import export_architecture_graph
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph


def _project_meta() -> dict:
    return {
        "id": "p1",
        "name": "Catalog Expansion",
        "createdAt": "2026-07-24T14:00:00.000Z",
        "updatedAt": "2026-07-24T14:00:00.000Z",
    }


def test_invalid_tool_schema_rejected() -> None:
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
            "project": _project_meta(),
            "nodes": [
                {
                    "id": "tool-1",
                    "type": "multi_agent.tool_definition",
                    "version": "1.0.0",
                    "name": "Search",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "toolName": "search",
                        "description": "Search",
                        "inputSchema": "{not-json",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-tool",
                            "name": "tool",
                            "direction": "output",
                            "contractType": "TOOL_DEFINITION",
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
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "INVALID_TOOL_INPUT_SCHEMA" in codes


def test_identity_rejects_embedded_credentials() -> None:
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
            "project": _project_meta(),
            "nodes": [
                {
                    "id": "id-1",
                    "type": "enterprise.identity_reference",
                    "version": "1.0.0",
                    "name": "IdP",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "provider": "oidc",
                        "clientId": "athanor-app",
                        "issuer": "https://idp.example.com",
                        "clientSecret": "super-secret",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-identity",
                            "name": "identity",
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
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "IDENTITY_CREDENTIAL_EMBEDDED" in codes


def test_export_includes_category_lineage() -> None:
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
            "project": _project_meta(),
            "nodes": [
                {
                    "id": "img-1",
                    "type": "vision.image_input",
                    "version": "1.0.0",
                    "name": "Photo",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "imagePath": "./assets/sample.png",
                        "mimeType": "image/png",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-image",
                            "name": "image",
                            "direction": "output",
                            "contractType": "IMAGE",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                },
                {
                    "id": "agent-1",
                    "type": "multi_agent.agent",
                    "version": "1.0.0",
                    "name": "Researcher",
                    "position": {"x": 200, "y": 0},
                    "configuration": {
                        "role": "researcher",
                        "systemPrompt": "Be careful.",
                        "modelId": "openai/gpt-4o-mini",
                        "temperature": 0.2,
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-handle",
                            "name": "handle",
                            "direction": "output",
                            "contractType": "MODEL_HANDLE",
                            "required": True,
                            "multiple": False,
                        },
                        {
                            "id": "out-event",
                            "name": "event",
                            "direction": "output",
                            "contractType": "EVENT",
                            "required": True,
                            "multiple": False,
                        },
                    ],
                },
                {
                    "id": "id-1",
                    "type": "enterprise.identity_reference",
                    "version": "1.0.0",
                    "name": "IdP",
                    "position": {"x": 400, "y": 0},
                    "configuration": {
                        "provider": "oidc",
                        "clientId": "athanor-app",
                        "issuer": "https://idp.example.com/realms/app",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-identity",
                            "name": "identity",
                            "direction": "output",
                            "contractType": "STRING",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                },
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    result = export_architecture_graph(graph, project_slug="catalog-expansion")
    architecture = result.files["docs/architecture.md"]
    assert "## Vision lineage" in architecture
    assert "vision.image_input" in architecture
    assert "## Multi-agent lineage" in architecture
    assert "multi_agent.agent" in architecture
    assert "## Enterprise lineage" in architecture
    assert "enterprise.identity_reference" in architecture
    assert "super-secret" not in architecture
    catalog = result.files["docs/node-catalog.md"]
    assert "vision.image_input" in catalog
    assert "multi_agent.agent" in catalog


def test_lineage_nodes_skipped_in_executor() -> None:
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
            "project": _project_meta(),
            "nodes": [
                {
                    "id": "img-1",
                    "type": "vision.image_input",
                    "version": "1.0.0",
                    "name": "Photo",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "imagePath": "./assets/sample.png",
                        "mimeType": "image/png",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-image",
                            "name": "image",
                            "direction": "output",
                            "contractType": "IMAGE",
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
    assert result.status == "partial"
    assert result.steps[0].status == "skipped"
