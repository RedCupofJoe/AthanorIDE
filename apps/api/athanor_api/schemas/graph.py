"""Pydantic mirrors of the canonical architecture graph schema."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1.0.0"


class ContractType(StrEnum):
    STRING = "STRING"
    PROMPT = "PROMPT"
    MODEL_HANDLE = "MODEL_HANDLE"
    MODEL_WEIGHTS = "MODEL_WEIGHTS"
    VECTOR_EMBEDDING = "VECTOR_EMBEDDING"
    DATABASE_HANDLE = "DATABASE_HANDLE"
    TOOL_DEFINITION = "TOOL_DEFINITION"
    MCP_SERVER = "MCP_SERVER"
    SANDBOX_POLICY = "SANDBOX_POLICY"
    GUARDRAIL = "GUARDRAIL"
    MCP_RESOURCE = "MCP_RESOURCE"
    MCP_PROMPT = "MCP_PROMPT"
    STREAMING_PAYLOAD = "STREAMING_PAYLOAD"
    JSON_SCHEMA = "JSON_SCHEMA"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    AUDIO = "AUDIO"
    TENSOR = "TENSOR"
    FILE_REFERENCE = "FILE_REFERENCE"
    DATASET = "DATASET"
    EVENT = "EVENT"
    ANY = "ANY"


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


class NodePort(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    direction: Literal["input", "output"]
    contract_type: ContractType = Field(alias="contractType")
    required: bool
    multiple: bool
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")


class ArchitectureNode(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    type: str = Field(min_length=1)
    version: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    position: Position
    configuration: dict[str, Any]
    inputs: list[NodePort]
    outputs: list[NodePort]
    deployment_target: str | None = Field(default=None, alias="deploymentTarget")
    parent_macro_id: str | None = Field(default=None, alias="parentMacroId")
    metadata: dict[str, Any] | None = None


class ArchitectureEdge(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    source_node_id: str = Field(alias="sourceNodeId", min_length=1)
    source_port_id: str = Field(alias="sourcePortId", min_length=1)
    target_node_id: str = Field(alias="targetNodeId", min_length=1)
    target_port_id: str = Field(alias="targetPortId", min_length=1)
    metadata: dict[str, Any] | None = None


class ProjectMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    severity: Literal["info", "warning", "error"]
    code: str
    message: str
    node_id: str | None = Field(default=None, alias="nodeId")
    edge_id: str | None = Field(default=None, alias="edgeId")
    suggested_action: str | None = Field(default=None, alias="suggestedAction")


class Viewport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float
    zoom: float = Field(gt=0)


class DeploymentEnvironmentKind(StrEnum):
    LOCAL_WORKSTATION = "LOCAL_WORKSTATION"
    ON_PREMISES = "ON_PREMISES"
    OPENSHIFT = "OPENSHIFT"
    KUBERNETES = "KUBERNETES"
    AWS_GPU = "AWS_GPU"
    GCP_CLOUD_RUN = "GCP_CLOUD_RUN"
    AZURE_CONTAINER_APPS = "AZURE_CONTAINER_APPS"
    EDGE_DEVICE = "EDGE_DEVICE"
    RASPBERRY_PI = "RASPBERRY_PI"
    AIR_GAPPED_ENVIRONMENT = "AIR_GAPPED_ENVIRONMENT"


class DataContract(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    contract_type: ContractType = Field(alias="contractType")
    name: str
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")
    metadata: dict[str, Any] | None = None


class DeploymentEnvironment(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    kind: DeploymentEnvironmentKind
    name: str
    bounds: dict[str, float] | None = None
    metadata: dict[str, Any] | None = None


class MacroBlock(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    name: str
    description: str | None = None
    node_ids: list[str] = Field(alias="nodeIds")
    inputs: list[NodePort]
    outputs: list[NodePort]
    collapsed: bool = True
    metadata: dict[str, Any] | None = None


class PortalBus(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    bus_id: str = Field(alias="busId")
    display_name: str = Field(alias="displayName")
    contract_type: ContractType = Field(alias="contractType")
    scope: Literal["project", "macro", "deployment"]
    scope_id: str | None = Field(default=None, alias="scopeId")
    metadata: dict[str, Any] | None = None


InfrastructureTokenKind = Literal[
    "huggingface",
    "kaggle",
    "docker",
    "github",
    "uci_ml",
    "pytorch_hub",
    "custom",
]


class InfrastructureTokenSlot(BaseModel):
    """Project-level infrastructure pull-token reference (secret name only)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    kind: InfrastructureTokenKind
    label: str
    secret_name: str = Field(alias="secretName")
    provider: Literal["env", "file", "vault", "cloud_secret_manager"] = "env"
    recommended_env_name: str | None = Field(default=None, alias="recommendedEnvName")
    metadata: dict[str, Any] | None = None


class ExportConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    project_slug: str | None = Field(default=None, alias="projectSlug")
    include_docker_compat: bool = Field(default=False, alias="includeDockerCompat")
    include_kubernetes: bool = Field(default=False, alias="includeKubernetes")
    include_openshift: bool = Field(default=False, alias="includeOpenShift")
    include_terraform: bool = Field(default=False, alias="includeTerraform")
    include_argo_cd: bool = Field(default=False, alias="includeArgoCd")
    metadata: dict[str, Any] | None = None


class ArchitectureGraph(BaseModel):
    """Canonical architecture graph document (schemaVersion 1.0.0)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal["1.0.0"] = Field(alias="schemaVersion")
    project: ProjectMetadata
    nodes: list[ArchitectureNode]
    edges: list[ArchitectureEdge]
    contracts: list[DataContract] = Field(default_factory=list)
    deployment_environments: list[DeploymentEnvironment] = Field(
        default_factory=list, alias="deploymentEnvironments"
    )
    macro_blocks: list[MacroBlock] = Field(default_factory=list, alias="macroBlocks")
    portal_buses: list[PortalBus] = Field(default_factory=list, alias="portalBuses")
    infrastructure_tokens: list[InfrastructureTokenSlot] = Field(
        default_factory=list, alias="infrastructureTokens"
    )
    validation_results: list[ValidationIssue] = Field(
        default_factory=list, alias="validationResults"
    )
    export_configuration: ExportConfiguration | None = Field(
        default=None, alias="exportConfiguration"
    )
    viewport: Viewport
