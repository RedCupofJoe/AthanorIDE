from __future__ import annotations

import json
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from athanor_api.exporter import export_architecture_graph
from athanor_api.exporter.deployment import build_deployment_plan
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph


def _base_document(contracts_root: Path) -> dict:
    fixture = contracts_root / "fixtures" / "text-transform.v1.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["instruction"] = "uppercase the input"
        if node["type"] == "foundation.text_input":
            node["configuration"]["value"] = "hello"
    return document


def test_build_deployment_plan_for_kubernetes_swimlane(contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    document["deploymentEnvironments"] = [
        {
            "id": "env-k8s",
            "kind": "KUBERNETES",
            "name": "Cluster",
            "bounds": {"x": 0, "y": 0, "width": 400, "height": 400},
        }
    ]
    for node in document["nodes"]:
        node["deploymentTarget"] = "env-k8s"
    document["nodes"].append(
        {
            "id": "sec-1",
            "type": "foundation.secret_reference",
            "version": "1.0.0",
            "name": "Token",
            "position": {"x": 0, "y": 400},
            "configuration": {"secretName": "api-token", "provider": "env"},
            "deploymentTarget": "env-k8s",
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
    )
    graph = ArchitectureGraph.model_validate(document)
    plan = build_deployment_plan(graph, project_slug="demo")
    assert plan.include_kubernetes is True
    assert plan.primary_target is not None
    assert plan.primary_target.namespace.startswith("demo")
    assert any(item.secret_name == "api-token" for item in plan.secrets)


def test_export_kubernetes_manifests_without_secret_values(contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    document["exportConfiguration"] = {
        "includeKubernetes": True,
        "includeOpenShift": False,
        "includeTerraform": True,
        "includeDockerCompat": False,
    }
    document["deploymentEnvironments"] = [
        {
            "id": "env-k8s",
            "kind": "KUBERNETES",
            "name": "Cluster",
            "bounds": {"x": 0, "y": 0, "width": 400, "height": 400},
        }
    ]
    for node in document["nodes"]:
        node["deploymentTarget"] = "env-k8s"
    document["nodes"].append(
        {
            "id": "sec-1",
            "type": "foundation.secret_reference",
            "version": "1.0.0",
            "name": "Token",
            "position": {"x": 0, "y": 400},
            "configuration": {"secretName": "api-token", "provider": "vault"},
            "deploymentTarget": "env-k8s",
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
    )

    graph = ArchitectureGraph.model_validate(document)
    result = export_architecture_graph(
        graph,
        project_slug="phase6-demo",
        include_kubernetes=True,
        include_terraform=True,
    )
    secret_paths = [path for path in result.files if path.endswith("/secret.yaml")]
    assert secret_paths
    secret_doc = yaml.safe_load(result.files[secret_paths[0]])
    assert secret_doc["kind"] == "Secret"
    assert all(value == "" for value in secret_doc["stringData"].values())
    assert "super-secret" not in result.files[secret_paths[0]]
    assert any(path.endswith("/deployment.yaml") for path in result.files)
    assert any(path.endswith("/networkpolicy.yaml") for path in result.files)
    assert "deploy/terraform/main.tf" in result.files
    assert "docs/deployment.md" in result.files


def test_export_openshift_route(contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    document["deploymentEnvironments"] = [
        {
            "id": "env-ocp",
            "kind": "OPENSHIFT",
            "name": "OCP",
            "bounds": {"x": 0, "y": 0, "width": 400, "height": 400},
        }
    ]
    for node in document["nodes"]:
        node["deploymentTarget"] = "env-ocp"
    graph = ArchitectureGraph.model_validate(document)
    result = export_architecture_graph(graph, project_slug="ocp-demo")
    assert result.ir.include_openshift is True
    assert result.ir.include_kubernetes is True
    assert any(
        path.startswith("deploy/openshift/") and path.endswith("-route.yaml")
        for path in result.files
    )


def test_air_gapped_rejects_external_http() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": {
                "id": "p1",
                "name": "Air",
                "createdAt": "2026-07-24T14:00:00.000Z",
                "updatedAt": "2026-07-24T14:00:00.000Z",
            },
            "nodes": [
                {
                    "id": "http-1",
                    "type": "foundation.http_request",
                    "version": "1.0.0",
                    "name": "External",
                    "position": {"x": 0, "y": 0},
                    "configuration": {
                        "url": "https://example.com",
                        "method": "GET",
                        "timeoutSeconds": 10,
                    },
                    "deploymentTarget": "air",
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
                }
            ],
            "edges": [],
            "deploymentEnvironments": [
                {
                    "id": "air",
                    "kind": "AIR_GAPPED_ENVIRONMENT",
                    "name": "Air Gap",
                }
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "AIR_GAPPED_EXTERNAL_HTTP" in codes


def test_unknown_deployment_target() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": {
                "id": "p1",
                "name": "Bad",
                "createdAt": "2026-07-24T14:00:00.000Z",
                "updatedAt": "2026-07-24T14:00:00.000Z",
            },
            "nodes": [
                {
                    "id": "n1",
                    "type": "foundation.text_input",
                    "version": "1.0.0",
                    "name": "Text",
                    "position": {"x": 0, "y": 0},
                    "configuration": {"value": "hi"},
                    "deploymentTarget": "missing",
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
                }
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "DEPLOYMENT_TARGET_UNKNOWN" in codes


def test_export_api_accepts_cluster_flags(client: TestClient, contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    response = client.post(
        "/api/v1/projects/export",
        json={
            "graph": document,
            "projectSlug": "api-k8s",
            "includeKubernetes": True,
            "includeTerraform": True,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert any(path.startswith("deploy/kubernetes/") for path in body["files"])
    assert "deploy/terraform/main.tf" in body["files"]
