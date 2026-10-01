"""Graph-to-export intermediate representation."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from athanor_api.catalog import NODE_CATALOG_BY_TYPE
from athanor_api.exporter.deployment import (
    DeploymentPlan,
    build_deployment_plan,
    deployment_plan_as_dict,
)
from athanor_api.schemas.graph import ArchitectureGraph, ArchitectureNode
from athanor_api.secret_scan import redact_embedded_secrets


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "exported-project"


TransformKind = Literal["uppercase", "lowercase", "strip", "identity"]


def classify_instruction(instruction: str) -> TransformKind:
    """Deterministic Phase-2 transform selection (NL compiler arrives in Phase 3)."""

    text = instruction.casefold()
    if "uppercase" in text or "upper case" in text or "upper-case" in text:
        return "uppercase"
    if "lowercase" in text or "lower case" in text or "lower-case" in text:
        return "lowercase"
    if "strip" in text or "trim" in text:
        return "strip"
    return "identity"


@dataclass(frozen=True)
class TextInputStep:
    node_id: str
    name: str
    value: str
    source_kind: str = "text"


@dataclass(frozen=True)
class TransformStep:
    node_id: str
    name: str
    instruction: str
    kind: TransformKind
    compiled_code: str | None = None


@dataclass(frozen=True)
class OutputStep:
    node_id: str
    name: str


@dataclass(frozen=True)
class PromptTemplateStep:
    node_id: str
    name: str
    template: str


@dataclass(frozen=True)
class HttpClientStep:
    node_id: str
    name: str
    url: str
    method: str
    timeout_seconds: float


@dataclass(frozen=True)
class EnvBindingStep:
    node_id: str
    name: str
    env_name: str
    example_value: str


@dataclass(frozen=True)
class SecretReferenceStep:
    node_id: str
    name: str
    secret_name: str
    provider: str


@dataclass(frozen=True)
class InfrastructureTokenStep:
    slot_id: str
    kind: str
    label: str
    secret_name: str
    provider: str


@dataclass(frozen=True)
class FineTuningStep:
    node_id: str
    name: str
    node_type: str
    configuration: dict[str, Any]


@dataclass(frozen=True)
class LineageStep:
    """Category lineage snapshot (vision / multi-agent / enterprise)."""

    node_id: str
    name: str
    node_type: str
    configuration: dict[str, Any]


@dataclass(frozen=True)
class CatalogNodeStep:
    node_id: str
    name: str
    node_type: str
    category: str
    export_kind: str
    documentation: str


@dataclass(frozen=True)
class ExportIR:
    project_slug: str
    project_name: str
    project_description: str
    schema_version: str
    project_id: str
    generated_at: str
    node_ids: list[str]
    edge_ids: list[str]
    text_inputs: list[TextInputStep]
    transforms: list[TransformStep]
    outputs: list[OutputStep]
    prompt_templates: list[PromptTemplateStep]
    http_clients: list[HttpClientStep]
    env_bindings: list[EnvBindingStep]
    secret_references: list[SecretReferenceStep]
    infrastructure_tokens: list[InfrastructureTokenStep]
    fine_tuning: list[FineTuningStep]
    vision: list[LineageStep]
    multi_agent: list[LineageStep]
    enterprise: list[LineageStep]
    big_blocks: list[LineageStep]
    catalog_nodes: list[CatalogNodeStep]
    pipeline_order: list[str]
    include_docker_compat: bool
    include_kubernetes: bool
    include_openshift: bool
    include_terraform: bool
    deployment: dict[str, Any]
    source_graph: dict[str, Any]
    source_node_trace: list[str] = field(default_factory=list)

    @property
    def default_text(self) -> str:
        if self.text_inputs:
            return self.text_inputs[0].value
        return ""

    @property
    def primary_instruction(self) -> str:
        if self.transforms:
            return self.transforms[0].instruction
        return ""

    @property
    def primary_transform_kind(self) -> TransformKind:
        if self.transforms:
            return self.transforms[0].kind
        return "identity"

    @property
    def primary_compiled_code(self) -> str | None:
        if self.transforms:
            return self.transforms[0].compiled_code
        return None

    @property
    def uses_compiled_transform(self) -> bool:
        return bool(self.primary_compiled_code)

    @property
    def has_http_clients(self) -> bool:
        return bool(self.http_clients)

    @property
    def has_fine_tuning(self) -> bool:
        return bool(self.fine_tuning)

    @property
    def has_vision(self) -> bool:
        return bool(self.vision)

    @property
    def has_multi_agent(self) -> bool:
        return bool(self.multi_agent)

    @property
    def has_enterprise(self) -> bool:
        return bool(self.enterprise)

    @property
    def has_big_blocks(self) -> bool:
        return bool(self.big_blocks)

    @property
    def has_deployment_manifests(self) -> bool:
        return self.include_kubernetes or self.include_openshift or self.include_terraform


def _topo_sort(graph: ArchitectureGraph) -> list[str]:
    nodes = {node.id: node for node in graph.nodes}
    inbound: dict[str, int] = {node_id: 0 for node_id in nodes}
    adjacency: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for edge in graph.edges:
        if edge.source_node_id in nodes and edge.target_node_id in nodes:
            adjacency[edge.source_node_id].append(edge.target_node_id)
            inbound[edge.target_node_id] += 1

    ready = sorted([node_id for node_id, count in inbound.items() if count == 0])
    ordered: list[str] = []
    while ready:
        current = ready.pop(0)
        ordered.append(current)
        for nxt in sorted(adjacency[current]):
            inbound[nxt] -= 1
            if inbound[nxt] == 0:
                ready.append(nxt)
                ready.sort()
    if len(ordered) != len(nodes):
        return sorted(nodes)
    return ordered


def _config_str(node: ArchitectureNode, key: str, default: str = "") -> str:
    value = node.configuration.get(key, default)
    return value if isinstance(value, str) else str(value)


def _config_number(node: ArchitectureNode, key: str, default: float) -> float:
    value = node.configuration.get(key, default)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _safe_lineage_config(node: ArchitectureNode) -> dict[str, Any]:
    """Copy configuration while stripping anything that looks like a secret value."""

    forbidden = {
        "value",
        "secret",
        "secretValue",
        "password",
        "token",
        "apiKey",
        "clientSecret",
        "privateKey",
    }
    safe: dict[str, Any] = {}
    for key, value in node.configuration.items():
        if key in forbidden or key.lower().endswith("secret"):
            continue
        if key == "customTemplate" and isinstance(value, str):
            safe[key] = redact_embedded_secrets(value)
        else:
            safe[key] = value
    return safe


def _safe_fine_tuning_config(node: ArchitectureNode) -> dict[str, Any]:
    return _safe_lineage_config(node)


def build_export_ir(
    graph: ArchitectureGraph,
    *,
    include_docker_compat: bool = False,
    include_kubernetes: bool = False,
    include_openshift: bool = False,
    include_terraform: bool = False,
    project_slug: str | None = None,
) -> ExportIR:
    order = _topo_sort(graph)
    nodes_by_id = {node.id: node for node in graph.nodes}

    text_inputs: list[TextInputStep] = []
    transforms: list[TransformStep] = []
    outputs: list[OutputStep] = []
    prompt_templates: list[PromptTemplateStep] = []
    http_clients: list[HttpClientStep] = []
    env_bindings: list[EnvBindingStep] = []
    secret_references: list[SecretReferenceStep] = []
    fine_tuning: list[FineTuningStep] = []
    vision: list[LineageStep] = []
    multi_agent: list[LineageStep] = []
    enterprise: list[LineageStep] = []
    big_blocks: list[LineageStep] = []
    catalog_nodes: list[CatalogNodeStep] = []

    for node_id in order:
        node = nodes_by_id[node_id]
        catalog = NODE_CATALOG_BY_TYPE.get(node.type)
        catalog_nodes.append(
            CatalogNodeStep(
                node_id=node.id,
                name=node.name,
                node_type=node.type,
                category=catalog.category if catalog else "unknown",
                export_kind=catalog.export_kind if catalog else "documentation_only",
                documentation=catalog.documentation if catalog else node.description or "",
            )
        )

        if node.type == "foundation.text_input":
            text_inputs.append(
                TextInputStep(
                    node_id=node.id,
                    name=node.name,
                    value=_config_str(node, "value", ""),
                    source_kind="text",
                )
            )
        elif node.type == "foundation.json_input":
            text_inputs.append(
                TextInputStep(
                    node_id=node.id,
                    name=node.name,
                    value=_config_str(node, "json", ""),
                    source_kind="json",
                )
            )
        elif node.type == "foundation.python_transform":
            instruction = _config_str(node, "instruction", "")
            compiled = node.configuration.get("compiledCode")
            compiled_code = compiled if isinstance(compiled, str) and compiled.strip() else None
            transforms.append(
                TransformStep(
                    node_id=node.id,
                    name=node.name,
                    instruction=instruction,
                    kind=classify_instruction(instruction),
                    compiled_code=compiled_code,
                )
            )
        elif node.type == "foundation.output_viewer":
            outputs.append(OutputStep(node_id=node.id, name=node.name))
        elif node.type == "foundation.prompt_template":
            prompt_templates.append(
                PromptTemplateStep(
                    node_id=node.id,
                    name=node.name,
                    template=_config_str(node, "template", ""),
                )
            )
        elif node.type == "foundation.http_request":
            http_clients.append(
                HttpClientStep(
                    node_id=node.id,
                    name=node.name,
                    url=_config_str(node, "url", ""),
                    method=_config_str(node, "method", "POST").upper(),
                    timeout_seconds=_config_number(node, "timeoutSeconds", 30),
                )
            )
        elif node.type == "foundation.environment_variable":
            env_bindings.append(
                EnvBindingStep(
                    node_id=node.id,
                    name=node.name,
                    env_name=_config_str(node, "name", "APP_VAR"),
                    example_value=_config_str(node, "exampleValue", ""),
                )
            )
        elif node.type == "foundation.secret_reference":
            secret_references.append(
                SecretReferenceStep(
                    node_id=node.id,
                    name=node.name,
                    secret_name=_config_str(node, "secretName", ""),
                    provider=_config_str(node, "provider", "env"),
                )
            )
        elif node.type.startswith("fine_tuning."):
            fine_tuning.append(
                FineTuningStep(
                    node_id=node.id,
                    name=node.name,
                    node_type=node.type,
                    configuration=_safe_fine_tuning_config(node),
                )
            )
        elif node.type.startswith("vision."):
            vision.append(
                LineageStep(
                    node_id=node.id,
                    name=node.name,
                    node_type=node.type,
                    configuration=_safe_lineage_config(node),
                )
            )
        elif node.type.startswith("multi_agent."):
            multi_agent.append(
                LineageStep(
                    node_id=node.id,
                    name=node.name,
                    node_type=node.type,
                    configuration=_safe_lineage_config(node),
                )
            )
        elif node.type.startswith("enterprise."):
            enterprise.append(
                LineageStep(
                    node_id=node.id,
                    name=node.name,
                    node_type=node.type,
                    configuration=_safe_lineage_config(node),
                )
            )
        elif node.type.startswith("big_blocks."):
            big_blocks.append(
                LineageStep(
                    node_id=node.id,
                    name=node.name,
                    node_type=node.type,
                    configuration=_safe_lineage_config(node),
                )
            )

    slug = project_slug or (
        graph.export_configuration.project_slug
        if graph.export_configuration and graph.export_configuration.project_slug
        else slugify(graph.project.name)
    )

    slug = slugify(slug)[:50].rstrip("-")
    docker_compat = include_docker_compat
    if graph.export_configuration and graph.export_configuration.include_docker_compat:
        docker_compat = True

    plan: DeploymentPlan = build_deployment_plan(
        graph,
        project_slug=slug,
        include_kubernetes=include_kubernetes,
        include_openshift=include_openshift,
        include_terraform=include_terraform,
    )

    source_graph = json.loads(
        json.dumps(graph.model_dump(by_alias=True, exclude_none=True), sort_keys=True)
    )

    return ExportIR(
        project_slug=slug,
        project_name=graph.project.name,
        project_description=graph.project.description or "",
        schema_version=graph.schema_version,
        project_id=graph.project.id,
        generated_at=graph.project.updated_at,
        node_ids=sorted(nodes_by_id),
        edge_ids=sorted(edge.id for edge in graph.edges),
        text_inputs=text_inputs,
        transforms=transforms,
        outputs=outputs,
        prompt_templates=prompt_templates,
        http_clients=http_clients,
        env_bindings=env_bindings,
        secret_references=secret_references,
        infrastructure_tokens=[
            InfrastructureTokenStep(
                slot_id=slot.id,
                kind=slot.kind,
                label=slot.label,
                secret_name=slot.secret_name,
                provider=slot.provider,
            )
            for slot in graph.infrastructure_tokens
            if slot.secret_name.strip()
        ],
        fine_tuning=fine_tuning,
        vision=vision,
        multi_agent=multi_agent,
        enterprise=enterprise,
        big_blocks=big_blocks,
        catalog_nodes=catalog_nodes,
        pipeline_order=order,
        include_docker_compat=docker_compat,
        include_kubernetes=plan.include_kubernetes,
        include_openshift=plan.include_openshift,
        include_terraform=plan.include_terraform,
        deployment=deployment_plan_as_dict(plan),
        source_graph=source_graph,
        source_node_trace=order,
    )
