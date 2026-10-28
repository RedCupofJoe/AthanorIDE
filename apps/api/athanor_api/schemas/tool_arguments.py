"""JSON Schema validation shared by assistant planning and graph validation."""

from __future__ import annotations

import json
from typing import Any

from jsonschema import Draft202012Validator  # type: ignore[import-untyped]


def validate_schema(raw: Any) -> dict[str, Any]:
    schema = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise ValueError("Arguments must be a JSON Schema object with type 'object'.")
    if (
        schema.get("$schema", "https://json-schema.org/draft/2020-12/schema")
        != "https://json-schema.org/draft/2020-12/schema"
    ):
        raise ValueError("Use JSON Schema 2020-12.")

    def check(value: Any, depth: int = 0) -> None:
        if depth > 32:
            raise ValueError("Schema nesting exceeds 32 levels.")
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"$ref", "$dynamicRef"} and (
                    not isinstance(child, str) or not child.startswith("#/$defs/")
                ):
                    raise ValueError("Only local $defs references are supported.")
                check(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                check(child, depth + 1)

    check(schema)
    Draft202012Validator.check_schema(schema)
    return schema
