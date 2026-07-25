"""Compiler domain models and audit records."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class JsonSchema(BaseModel):
    """Minimal typed schema envelope for compiler I/O."""

    type: str = "string"
    description: str | None = None
    properties: dict[str, Any] | None = None


class TransformOperation(BaseModel):
    op: Literal[
        "uppercase",
        "lowercase",
        "strip",
        "reverse",
        "prefix",
        "suffix",
        "replace",
        "identity",
    ]
    value: str | None = None
    old: str | None = None
    new: str | None = None


class TransformationSpec(BaseModel):
    """Intermediate transformation specification (pre-codegen)."""

    version: Literal["1.0.0"] = "1.0.0"
    function_name: str = "transform"
    input_name: str = "value"
    input_type: Literal["str"] = "str"
    output_type: Literal["str"] = "str"
    operations: list[TransformOperation] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class CorrectionAttempt(BaseModel):
    attempt: int
    stage: Literal["provider", "ast", "ruff", "mypy", "sandbox", "tests"]
    success: bool
    message: str
    changed: bool = False
    details: dict[str, Any] = Field(default_factory=dict)


class AuditRecord(BaseModel):
    provider: str
    max_attempts: int
    attempts: list[CorrectionAttempt] = Field(default_factory=list)
    final_status: Literal["success", "failed"]
    warnings: list[str] = Field(default_factory=list)


class SandboxResult(BaseModel):
    status: Literal["passed", "failed", "skipped"]
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: float | None = None
    reason: str | None = None


class CompileArtifacts(BaseModel):
    spec: TransformationSpec
    source_code: str
    test_code: str
    audit: AuditRecord
    sandbox: SandboxResult
    ruff_output: str = ""
    mypy_output: str = ""
