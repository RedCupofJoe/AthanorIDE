from __future__ import annotations

import copy
import json
from pathlib import Path

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


def test_portal_contract_mismatch(contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    document["nodes"].extend(
        [
            {
                "id": "portal-out",
                "type": "foundation.portal_output",
                "version": "1.0.0",
                "name": "Portal Out",
                "position": {"x": 0, "y": 300},
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
                "id": "portal-in",
                "type": "foundation.portal_input",
                "version": "1.0.0",
                "name": "Portal In",
                "position": {"x": 200, "y": 300},
                "configuration": {
                    "busId": "bus-a",
                    "displayName": "A",
                    "contractType": "PROMPT",
                    "scope": "project",
                },
                "inputs": [],
                "outputs": [
                    {
                        "id": "out-text",
                        "name": "text",
                        "direction": "output",
                        "contractType": "PROMPT",
                        "required": True,
                        "multiple": False,
                    }
                ],
            },
        ]
    )
    # Satisfy portal_output required input by reusing text input edge target optional —
    # mark input as not required for this unit check focus.
    document["nodes"][-2]["inputs"][0]["required"] = False

    graph = ArchitectureGraph.model_validate(document)
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "PORTAL_CONTRACT_MISMATCH" in codes


def test_cross_environment_edge_incomplete(contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    document["deploymentEnvironments"] = [
        {
            "id": "env-local",
            "kind": "LOCAL_WORKSTATION",
            "name": "Local",
            "bounds": {"x": 0, "y": 0, "width": 400, "height": 400},
        },
        {
            "id": "env-k8s",
            "kind": "KUBERNETES",
            "name": "Cluster",
            "bounds": {"x": 500, "y": 0, "width": 400, "height": 400},
        },
    ]
    for node in document["nodes"]:
        if node["id"] == "node-text-input-01":
            node["deploymentTarget"] = "env-local"
        if node["id"] == "node-python-transform-01":
            node["deploymentTarget"] = "env-k8s"

    graph = ArchitectureGraph.model_validate(document)
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "CROSS_ENVIRONMENT_EDGE_INCOMPLETE" in codes


def test_macro_missing_nodes(contracts_root: Path) -> None:
    document = _base_document(contracts_root)
    document["macroBlocks"] = [
        {
            "id": "macro-1",
            "name": "Broken",
            "nodeIds": ["missing-node", document["nodes"][0]["id"]],
            "inputs": [],
            "outputs": [],
            "collapsed": True,
        }
    ]
    graph = ArchitectureGraph.model_validate(copy.deepcopy(document))
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "MACRO_MISSING_NODES" in codes
