from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator

from athanor_api.schemas.graph import SCHEMA_VERSION, ArchitectureGraph


def test_schema_version_constant() -> None:
    assert SCHEMA_VERSION == "2.0.0"


def test_pydantic_accepts_golden_fixtures(contracts_root: Path) -> None:
    fixtures = [
        contracts_root / "fixtures" / "empty-graph.v2.json",
        contracts_root / "fixtures" / "text-transform.v2.json",
        contracts_root / "fixtures" / "workflow-design.v2.json",
    ]
    schema_path = contracts_root / "schema" / "architecture-graph.v2.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    for fixture in fixtures:
        document = json.loads(fixture.read_text(encoding="utf-8"))
        validator.validate(document)
        graph = ArchitectureGraph.model_validate(document)
        assert graph.schema_version == "2.0.0"


def test_pydantic_rejects_bad_version(contracts_root: Path) -> None:
    fixture = contracts_root / "fixtures" / "empty-graph.v2.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    document["schemaVersion"] = "9.9.9"
    try:
        ArchitectureGraph.model_validate(document)
        raised = False
    except Exception:
        raised = True
    assert raised
