"""API request/response models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from athanor_api.schemas.graph import ArchitectureGraph, ValidationIssue


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str
    version: str
    schema_version: str = Field(alias="schemaVersion")

    model_config = {"populate_by_name": True}


class ErrorResponse(BaseModel):
    error: str
    message: str
    correlation_id: str = Field(alias="correlationId")
    details: dict[str, object] | None = None

    model_config = {"populate_by_name": True}


class NodeDefinitionSummary(BaseModel):
    type: str
    display_name: str = Field(alias="displayName")
    category: str
    version: str
    description: str = ""
    icon: str = "box"

    model_config = {"populate_by_name": True}


class NodeDefinitionsResponse(BaseModel):
    items: list[NodeDefinitionSummary]


class ValidateProjectRequest(BaseModel):
    graph: ArchitectureGraph


class ValidateProjectResponse(BaseModel):
    valid: bool
    issues: list[ValidationIssue]
    duration_ms: float = Field(alias="durationMs")

    model_config = {"populate_by_name": True}


class ExecuteProjectRequest(BaseModel):
    graph: ArchitectureGraph
    override_text: str | None = Field(default=None, alias="overrideText")

    model_config = {"populate_by_name": True}


class ExecutionStepModel(BaseModel):
    node_id: str = Field(alias="nodeId")
    node_name: str = Field(alias="nodeName")
    node_type: str = Field(alias="nodeType")
    status: Literal["ok", "skipped", "error"]
    inputs: dict[str, str] = Field(default_factory=dict)
    outputs: dict[str, str] = Field(default_factory=dict)
    message: str | None = None
    duration_ms: float = Field(alias="durationMs", default=0.0)

    model_config = {"populate_by_name": True}


class EdgePayloadModel(BaseModel):
    edge_id: str = Field(alias="edgeId")
    source_node_id: str = Field(alias="sourceNodeId")
    target_node_id: str = Field(alias="targetNodeId")
    value: str
    contract_type: str = Field(alias="contractType")

    model_config = {"populate_by_name": True}


class ExecuteProjectResponse(BaseModel):
    status: Literal["success", "partial", "failed"]
    duration_ms: float = Field(alias="durationMs")
    steps: list[ExecutionStepModel]
    edge_payloads: list[EdgePayloadModel] = Field(default_factory=list, alias="edgePayloads")
    final_outputs: list[dict[str, object]] = Field(default_factory=list, alias="finalOutputs")
    validation_issue_count: int = Field(default=0, alias="validationIssueCount")

    model_config = {"populate_by_name": True}


class ExportProjectRequest(BaseModel):
    graph: ArchitectureGraph
    include_docker_compat: bool = Field(default=False, alias="includeDockerCompat")
    include_kubernetes: bool = Field(default=False, alias="includeKubernetes")
    include_openshift: bool = Field(default=False, alias="includeOpenShift")
    include_terraform: bool = Field(default=False, alias="includeTerraform")
    project_slug: str | None = Field(default=None, alias="projectSlug")

    model_config = {"populate_by_name": True}


class ManifestEntryModel(BaseModel):
    path: str
    bytes: int
    sha256: str


class GenerationIssueModel(BaseModel):
    path: str
    message: str


class ExportProjectResponse(BaseModel):
    project_slug: str = Field(alias="projectSlug")
    files: dict[str, str]
    manifest: list[ManifestEntryModel]
    duration_ms: float = Field(alias="durationMs")
    file_count: int = Field(alias="fileCount")
    validation_issues: list[ValidationIssue] = Field(default_factory=list, alias="validationIssues")
    archive_base64: str = Field(alias="archiveBase64")

    model_config = {"populate_by_name": True}


class CompilerGenerateRequest(BaseModel):
    instruction: str = Field(min_length=1)
    input_schema: dict[str, object] = Field(
        default_factory=dict,
        alias="inputSchema",
    )
    output_schema: dict[str, object] = Field(
        default_factory=dict,
        alias="outputSchema",
    )
    sample_input: str = Field(default="Hello World", alias="sampleInput")
    provenance: list[str] = Field(default_factory=list)
    require_sandbox: bool = Field(default=False, alias="requireSandbox")

    model_config = {"populate_by_name": True}

    def model_post_init(self, __context: object) -> None:
        if not self.input_schema:
            self.input_schema = {"type": "string"}
        if not self.output_schema:
            self.output_schema = {"type": "string"}


class CompilerValidateRequest(BaseModel):
    source_code: str = Field(alias="sourceCode", min_length=1)
    sample_input: str = Field(default="Hello World", alias="sampleInput")

    model_config = {"populate_by_name": True}


class CorrectionAttemptModel(BaseModel):
    attempt: int
    stage: str
    success: bool
    message: str
    changed: bool = False
    details: dict[str, object] = Field(default_factory=dict)


class AuditRecordModel(BaseModel):
    provider: str
    max_attempts: int = Field(alias="maxAttempts")
    attempts: list[CorrectionAttemptModel]
    final_status: str = Field(alias="finalStatus")
    warnings: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class SandboxResultModel(BaseModel):
    status: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = Field(default=None, alias="exitCode")
    duration_ms: float | None = Field(default=None, alias="durationMs")
    reason: str | None = None

    model_config = {"populate_by_name": True}


class CompilerGenerateResponse(BaseModel):
    status: str
    source_code: str = Field(alias="sourceCode")
    test_code: str = Field(alias="testCode")
    spec: dict[str, object]
    audit: AuditRecordModel
    sandbox: SandboxResultModel
    ruff_output: str = Field(default="", alias="ruffOutput")
    mypy_output: str = Field(default="", alias="mypyOutput")
    duration_ms: float = Field(alias="durationMs")

    model_config = {"populate_by_name": True}


class CompilerValidateResponse(BaseModel):
    status: str
    source_code: str = Field(alias="sourceCode")
    audit: AuditRecordModel
    sandbox: SandboxResultModel
    ruff_output: str = Field(default="", alias="ruffOutput")
    mypy_output: str = Field(default="", alias="mypyOutput")
    duration_ms: float = Field(alias="durationMs")

    model_config = {"populate_by_name": True}
