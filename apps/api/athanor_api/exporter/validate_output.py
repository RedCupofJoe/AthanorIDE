"""Validation helpers for generated export artifacts."""

from __future__ import annotations

import ast
import json
from dataclasses import dataclass

import yaml


@dataclass(frozen=True)
class GeneratedFileIssue:
    path: str
    message: str


def validate_generated_files(files: dict[str, str]) -> list[GeneratedFileIssue]:
    issues: list[GeneratedFileIssue] = []

    for path, content in files.items():
        if path.endswith(".json"):
            try:
                json.loads(content)
            except json.JSONDecodeError as exc:
                issues.append(GeneratedFileIssue(path, f"Invalid JSON: {exc.msg}"))
        elif path.endswith((".yaml", ".yml")):
            try:
                list(yaml.safe_load_all(content))
            except yaml.YAMLError as exc:
                issues.append(GeneratedFileIssue(path, f"Invalid YAML: {exc}"))
        elif path.endswith(".py"):
            try:
                ast.parse(content, filename=path)
            except SyntaxError as exc:
                issues.append(
                    GeneratedFileIssue(path, f"Invalid Python: {exc.msg} (line {exc.lineno})")
                )

    required = [
        "README.md",
        ".env.example",
        "Containerfile",
        "compose.yaml",
        "pyproject.toml",
        "app/main.py",
        "pipelines/text_transform.py",
        "tests/test_contracts.py",
        "docs/generated-graph.json",
    ]
    for path in required:
        if path not in files:
            issues.append(GeneratedFileIssue(path, "Required generated file is missing"))

    # Never emit a real .env
    if ".env" in files:
        issues.append(GeneratedFileIssue(".env", "Exporter must not emit .env with secrets"))

    for path, content in files.items():
        if "secret" in path.lower() and path.endswith((".yaml", ".yml")):
            try:
                documents = list(yaml.safe_load_all(content))
            except yaml.YAMLError:
                continue
            for document in documents:
                if not isinstance(document, dict):
                    continue
                string_data = document.get("stringData")
                data = document.get("data")
                for mapping in (string_data, data):
                    if not isinstance(mapping, dict):
                        continue
                    for key, value in mapping.items():
                        if isinstance(value, str) and value.strip():
                            issues.append(
                                GeneratedFileIssue(
                                    path,
                                    f"Secret artifact embeds a non-empty value for '{key}'",
                                )
                            )

    return issues
