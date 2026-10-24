from __future__ import annotations

import json
from pathlib import Path

from athanor_api.exporter import export_architecture_graph
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph


def test_invalid_json_input_rejected() -> None:
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
                "name": "JSON",
                "createdAt": "2026-07-24T14:00:00.000Z",
                "updatedAt": "2026-07-24T14:00:00.000Z",
            },
            "nodes": [
                {
                    "id": "json-1",
                    "type": "foundation.json_input",
                    "version": "1.0.0",
                    "name": "JSON",
                    "position": {"x": 0, "y": 0},
                    "configuration": {"json": "{not-json"},
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-json",
                            "name": "json",
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
    assert "INVALID_JSON_INPUT" in codes


def test_secret_reference_rejects_embedded_value() -> None:
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
                    "name": "API Token",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "secretName": "api-token",
                        "provider": "env",
                        "value": "super-secret",
                    },
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
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "SECRET_VALUE_EMBEDDED" in codes


def test_export_includes_env_secret_and_catalog(
    contracts_root: Path,
) -> None:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["instruction"] = "uppercase the input"
        if node["type"] == "foundation.text_input":
            node["configuration"]["value"] = "hello"

    document["nodes"].extend(
        [
            {
                "id": "env-1",
                "type": "foundation.environment_variable",
                "version": "1.0.0",
                "name": "Region",
                "position": {"x": 0, "y": 400},
                "configuration": {"name": "APP_REGION", "exampleValue": "us-east-1"},
                "inputs": [],
                "outputs": [
                    {
                        "id": "out-value",
                        "name": "value",
                        "direction": "output",
                        "contractType": "STRING",
                        "required": True,
                        "multiple": False,
                    }
                ],
            },
            {
                "id": "sec-1",
                "type": "foundation.secret_reference",
                "version": "1.0.0",
                "name": "Token",
                "position": {"x": 200, "y": 400},
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
            },
            {
                "id": "http-1",
                "type": "foundation.http_request",
                "version": "1.0.0",
                "name": "Webhook",
                "position": {"x": 400, "y": 400},
                "configuration": {
                    "url": "https://example.com/hook",
                    "method": "POST",
                    "timeoutSeconds": 15,
                },
                "inputs": [
                    {
                        "id": "in-body",
                        "name": "body",
                        "direction": "input",
                        "contractType": "STRING",
                        "required": False,
                        "multiple": False,
                    }
                ],
                "outputs": [
                    {
                        "id": "out-response",
                        "name": "response",
                        "direction": "output",
                        "contractType": "STRING",
                        "required": True,
                        "multiple": False,
                    }
                ],
            },
        ]
    )

    graph = ArchitectureGraph.model_validate(document)
    result = export_architecture_graph(graph, project_slug="phase5-export")
    assert "docs/node-catalog.md" in result.files
    assert "APP_REGION=" in result.files[".env.example"]
    assert "SECRET_REF api-token" in result.files[".env.example"]
    assert "super-secret" not in result.files[".env.example"]
    assert ".env" not in result.files
    assert "app/http_clients.py" in result.files
    assert "https://example.com/hook" in result.files["app/http_clients.py"]
    assert "httpx>=0.28.0" in result.files["pyproject.toml"]


def test_lora_requires_positive_hyperparameters() -> None:
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
                "name": "LoRA",
                "createdAt": "2026-07-24T14:00:00.000Z",
                "updatedAt": "2026-07-24T14:00:00.000Z",
            },
            "nodes": [
                {
                    "id": "ds-1",
                    "type": "fine_tuning.dataset_loader",
                    "version": "1.0.0",
                    "name": "Data",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "datasetPath": "./data/train.jsonl",
                        "format": "jsonl",
                    },
                    "inputs": [],
                    "outputs": [
                        {
                            "id": "out-dataset",
                            "name": "dataset",
                            "direction": "output",
                            "contractType": "DATASET",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                },
                {
                    "id": "lora-1",
                    "type": "fine_tuning.lora_trainer",
                    "version": "1.0.0",
                    "name": "Trainer",
                    "position": {"x": 200, "y": 0},
                    "configuration": {
                        "baseModel": "model",
                        "epochs": 0,
                        "batchSize": 4,
                        "learningRate": 0.0002,
                        "rank": 8,
                        "alpha": 16,
                        "precision": "bf16",
                        "gradientAccumulation": 1,
                        "checkpointInterval": 500,
                        "outputPath": "./out",
                    },
                    "inputs": [
                        {
                            "id": "in-dataset",
                            "name": "dataset",
                            "direction": "input",
                            "contractType": "DATASET",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                    "outputs": [
                        {
                            "id": "out-weights",
                            "name": "weights",
                            "direction": "output",
                            "contractType": "MODEL_WEIGHTS",
                            "required": True,
                            "multiple": False,
                        }
                    ],
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "sourceNodeId": "ds-1",
                    "sourcePortId": "out-dataset",
                    "targetNodeId": "lora-1",
                    "targetPortId": "in-dataset",
                }
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "INVALID_LORA_HYPERPARAMETER" in codes
