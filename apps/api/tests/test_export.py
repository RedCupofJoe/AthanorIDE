from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from athanor_api.exporter import ExportError, export_architecture_graph, write_export_to_directory
from athanor_api.exporter.ir import classify_instruction
from athanor_api.schemas.graph import ArchitectureGraph


@pytest.fixture
def text_transform_graph(contracts_root: Path) -> ArchitectureGraph:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    return ArchitectureGraph.model_validate(document)


def test_classify_instruction_uppercase() -> None:
    assert classify_instruction("uppercase the input") == "uppercase"


def test_export_is_deterministic(text_transform_graph: ArchitectureGraph) -> None:
    first = export_architecture_graph(text_transform_graph)
    second = export_architecture_graph(text_transform_graph)
    assert first.files == second.files
    assert [item.sha256 for item in first.manifest] == [item.sha256 for item in second.manifest]


def test_export_contains_required_artifacts(text_transform_graph: ArchitectureGraph) -> None:
    result = export_architecture_graph(text_transform_graph)
    assert "Containerfile" in result.files
    assert "compose.yaml" in result.files
    assert ".env.example" in result.files
    assert ".env" not in result.files
    assert "pipelines/text_transform.py" in result.files
    assert "node-text-input-01" in result.files["pipelines/text_transform.py"]
    assert "uppercase" in result.files["pipelines/text_transform.py"]
    assert result.ir.primary_transform_kind == "uppercase"


def test_export_rejects_invalid_graph(contracts_root: Path) -> None:
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["instruction"] = ""
    graph = ArchitectureGraph.model_validate(document)
    with pytest.raises(ExportError):
        export_architecture_graph(graph)


def test_export_api(client: TestClient, text_transform_graph: ArchitectureGraph) -> None:
    payload = {
        "graph": text_transform_graph.model_dump(by_alias=True),
        "projectSlug": "text-transformation-example",
    }
    response = client.post("/api/v1/projects/export", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["projectSlug"] == "text-transformation-example"
    assert body["fileCount"] == len(body["files"])
    assert body["manifest"][0]["path"] == sorted(body["files"])[0]
    assert body["archiveBase64"]


def test_exported_project_pytest(
    text_transform_graph: ArchitectureGraph,
    tmp_path: Path,
) -> None:
    import os
    import subprocess
    import sys

    result = export_architecture_graph(
        text_transform_graph,
        project_slug="text-transformation-example",
    )
    destination = tmp_path / "exported-project"
    write_export_to_directory(result, str(destination))

    env = {
        **os.environ,
        "PYTHONPATH": str(destination),
    }
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "-q"],
        cwd=destination,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr


def test_exported_project_podman_optional(
    text_transform_graph: ArchitectureGraph,
    tmp_path: Path,
) -> None:
    import os
    import shutil
    import subprocess
    import time
    import urllib.error
    import urllib.request

    if shutil.which("podman") is None:
        pytest.skip("podman not available")

    result = export_architecture_graph(
        text_transform_graph,
        project_slug="athanor-export-smoke",
    )
    destination = tmp_path / "exported-project"
    write_export_to_directory(result, str(destination))

    image = "localhost/athanor-export-smoke:test"
    container = "athanor-export-smoke-test"
    subprocess.run(
        ["podman", "rm", "-f", container],
        check=False,
        capture_output=True,
        text=True,
    )
    build = subprocess.run(
        ["podman", "build", "-t", image, "-f", "Containerfile", "."],
        cwd=destination,
        check=False,
        capture_output=True,
        text=True,
    )
    if build.returncode != 0:
        pytest.skip(f"podman build unavailable in this environment: {build.stderr[-500:]}")

    run = subprocess.run(
        [
            "podman",
            "run",
            "-d",
            "--name",
            container,
            "-p",
            "18080:8080",
            image,
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stderr

    try:
        health_body = ""
        for _ in range(40):
            try:
                with urllib.request.urlopen("http://127.0.0.1:18080/health", timeout=2) as resp:
                    health_body = resp.read().decode("utf-8")
                    break
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
                time.sleep(0.5)
        assert health_body, "health endpoint never became ready"
        assert '"status":"ok"' in health_body.replace(" ", "")

        req = urllib.request.Request(
            "http://127.0.0.1:18080/v1/run",
            data=b'{"text":"hello"}',
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload["output_text"] == "HELLO"
    finally:
        subprocess.run(
            ["podman", "rm", "-f", container],
            check=False,
            capture_output=True,
        )
        _ = os.environ.get("ATHANOR_KEEP_EXPORT_IMAGE")
