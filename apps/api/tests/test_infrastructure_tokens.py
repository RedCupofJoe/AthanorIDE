"""Infrastructure pull-token slots (project-level secret names)."""

from __future__ import annotations

from athanor_api.exporter import export_architecture_graph
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph


def _project_meta() -> dict:
    return {
        "id": "infra-1",
        "name": "Infra Tokens",
        "createdAt": "2026-07-24T14:00:00.000Z",
        "updatedAt": "2026-07-24T14:00:00.000Z",
    }


def test_infra_token_rejects_embedded_value() -> None:
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
            "nodes": [],
            "edges": [],
            "infrastructureTokens": [
                {
                    "id": "infra-token-huggingface",
                    "kind": "huggingface",
                    "label": "Hugging Face",
                    "secretName": "apiKey: sk-abcdefghijklmnopqrstuvwxyz012345",
                    "provider": "env",
                }
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "INFRA_TOKEN_VALUE_EMBEDDED" in codes


def test_export_includes_infra_token_comments() -> None:
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
            "nodes": [],
            "edges": [],
            "infrastructureTokens": [
                {
                    "id": "infra-token-huggingface",
                    "kind": "huggingface",
                    "label": "Hugging Face",
                    "secretName": "HF_TOKEN",
                    "provider": "env",
                },
                {
                    "id": "infra-token-docker",
                    "kind": "docker",
                    "label": "Docker Hub",
                    "secretName": "",
                    "provider": "env",
                },
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    result = export_architecture_graph(graph, project_slug="infra-tokens")
    env_example = result.files[".env.example"]
    assert "INFRA_TOKEN" in env_example
    assert "HF_TOKEN" in env_example
    assert "kind=huggingface" in env_example
