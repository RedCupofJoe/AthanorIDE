from __future__ import annotations

from fastapi.testclient import TestClient

from athanor_api.compiler.ast_security import validate_transform_ast
from athanor_api.compiler.generate import generate_python_source
from athanor_api.compiler.models import TransformationSpec, TransformOperation
from athanor_api.compiler.pipeline import compile_transformation, validate_compiled_source
from athanor_api.compiler.providers.mock import MockModelProvider


def test_ast_rejects_shell_and_imports() -> None:
    dangerous = "\n".join(
        [
            "import os",
            "def transform(value: str) -> str:",
            "    os.system('echo pwned')",
            "    return value",
            "",
        ]
    )
    violations = validate_transform_ast(dangerous)
    codes = {item.code for item in violations}
    assert "FORBIDDEN_NODE" in codes or "FORBIDDEN_CALL" in codes


def test_ast_rejects_eval() -> None:
    dangerous = "\n".join(
        [
            "def transform(value: str) -> str:",
            "    return eval(value)",
            "",
        ]
    )
    violations = validate_transform_ast(dangerous)
    assert any(item.code in {"FORBIDDEN_NAME", "FORBIDDEN_CALL"} for item in violations)


def test_ast_accepts_generated_uppercase() -> None:
    spec = TransformationSpec(operations=[TransformOperation(op="uppercase")])
    source = generate_python_source(spec, provenance=["node-python-transform-01"])
    assert validate_transform_ast(source) == []


def test_mock_provider_uppercase() -> None:
    provider = MockModelProvider()
    spec = provider.generate_spec(
        instruction="uppercase the input",
        input_schema={"type": "string"},
        output_schema={"type": "string"},
    )
    assert any(op.op == "uppercase" for op in spec.operations)


def test_compile_with_sandbox_when_available() -> None:
    import shutil

    artifacts = compile_transformation(
        instruction="uppercase the input",
        sample_input="hello",
        require_sandbox=True,
    )
    if shutil.which("podman") is None:
        assert artifacts.audit.final_status == "failed"
        return
    # In restricted CI sandboxes Podman may be present but unusable.
    if artifacts.sandbox.status == "skipped":
        return
    assert artifacts.audit.final_status == "success"
    assert artifacts.sandbox.status == "passed"
    assert '"result":"HELLO"' in artifacts.sandbox.stdout.replace(" ", "")


def test_validate_compiled_source_api(client: TestClient) -> None:
    artifacts = compile_transformation(instruction="strip and uppercase the input")
    response = client.post(
        "/api/v1/compiler/validate",
        json={"sourceCode": artifacts.source_code, "sampleInput": "  hi  "},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"success", "failed"}
    assert body["sourceCode"] == artifacts.source_code


def test_compiler_generate_api(client: TestClient) -> None:
    response = client.post(
        "/api/v1/compiler/generate",
        json={
            "instruction": "uppercase the input",
            "sampleInput": "abc",
            "provenance": ["node-python-transform-01"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert "def transform" in body["sourceCode"]
    assert body["audit"]["provider"] == "mock"
    assert body["audit"]["maxAttempts"] == 3


def test_export_uses_compiled_code(client: TestClient, contracts_root: object) -> None:
    import json
    from pathlib import Path

    from athanor_api.exporter import export_architecture_graph
    from athanor_api.schemas.graph import ArchitectureGraph

    assert isinstance(contracts_root, Path)
    fixture = contracts_root / "fixtures" / "text-transform.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    artifacts = compile_transformation(instruction="uppercase the input")
    for node in document["nodes"]:
        if node["type"] == "foundation.python_transform":
            node["configuration"]["compiledCode"] = artifacts.source_code
    graph = ArchitectureGraph.model_validate(document)
    result = export_architecture_graph(graph, project_slug="compiled-export")
    pipeline = result.files["pipelines/text_transform.py"]
    assert "USES_COMPILED_TRANSFORM = True" in pipeline
    assert "def transform" in pipeline


def test_validate_compiled_source_direct() -> None:
    artifacts = compile_transformation(instruction="lowercase the input")
    validated = validate_compiled_source(artifacts.source_code)
    assert validated.audit.final_status == "success"
