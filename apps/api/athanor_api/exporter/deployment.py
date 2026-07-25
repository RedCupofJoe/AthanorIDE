"""Deployment plan IR for Kubernetes / OpenShift / Terraform export."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from athanor_api.schemas.graph import ArchitectureGraph, ArchitectureNode, DeploymentEnvironment


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "app"


def _config_str(node: ArchitectureNode, key: str, default: str = "") -> str:
    value = node.configuration.get(key, default)
    return value if isinstance(value, str) else str(value)


@dataclass(frozen=True)
class ResourceRequirements:
    cpu_request: str
    cpu_limit: str
    memory_request: str
    memory_limit: str
    gpu: int = 0


@dataclass(frozen=True)
class DeploySecretRef:
    secret_name: str
    provider: str
    env_key: str
    node_id: str


@dataclass(frozen=True)
class DeployEnvVar:
    name: str
    example_value: str
    node_id: str


@dataclass(frozen=True)
class NetworkPolicyRule:
    name: str
    direction: str  # ingress | egress
    peer_env_id: str | None
    peer_env_name: str | None
    transport: str
    authentication: str
    ports: list[int] = field(default_factory=list)
    edge_id: str | None = None
    cidr: str | None = None


@dataclass(frozen=True)
class DeployTarget:
    env_id: str
    name: str
    kind: str
    namespace: str
    node_ids: list[str]
    resources: ResourceRequirements
    is_cluster: bool
    is_openshift: bool
    is_air_gapped: bool


@dataclass(frozen=True)
class DeploymentPlan:
    include_kubernetes: bool
    include_openshift: bool
    include_terraform: bool
    image_name: str
    container_port: int
    targets: list[DeployTarget]
    secrets: list[DeploySecretRef]
    env_vars: list[DeployEnvVar]
    network_policies: list[NetworkPolicyRule]
    primary_target: DeployTarget | None
    notes: list[str]


DEFAULT_RESOURCES = ResourceRequirements(
    cpu_request="100m",
    cpu_limit="500m",
    memory_request="256Mi",
    memory_limit="512Mi",
    gpu=0,
)

GPU_RESOURCES = ResourceRequirements(
    cpu_request="500m",
    cpu_limit="2000m",
    memory_request="2Gi",
    memory_limit="8Gi",
    gpu=1,
)

CLUSTER_KINDS = {
    "KUBERNETES",
    "OPENSHIFT",
    "AWS_GPU",
    "GCP_CLOUD_RUN",
    "AZURE_CONTAINER_APPS",
}

OPENSHIFT_KINDS = {"OPENSHIFT"}
AIR_GAPPED_KINDS = {"AIR_GAPPED_ENVIRONMENT"}
GPU_KINDS = {"AWS_GPU"}


def _resources_for_env(env: DeploymentEnvironment | None) -> ResourceRequirements:
    if env is None:
        return DEFAULT_RESOURCES
    if env.kind.value in GPU_KINDS:
        return GPU_RESOURCES
    metadata = env.metadata or {}
    resources = metadata.get("resources")
    if isinstance(resources, dict):
        return ResourceRequirements(
            cpu_request=str(resources.get("cpuRequest", DEFAULT_RESOURCES.cpu_request)),
            cpu_limit=str(resources.get("cpuLimit", DEFAULT_RESOURCES.cpu_limit)),
            memory_request=str(resources.get("memoryRequest", DEFAULT_RESOURCES.memory_request)),
            memory_limit=str(resources.get("memoryLimit", DEFAULT_RESOURCES.memory_limit)),
            gpu=int(resources.get("gpu", 0) or 0),
        )
    return DEFAULT_RESOURCES


def _node_resources(node: ArchitectureNode, fallback: ResourceRequirements) -> ResourceRequirements:
    metadata = node.metadata or {}
    resources = metadata.get("resources")
    if not isinstance(resources, dict):
        return fallback
    return ResourceRequirements(
        cpu_request=str(resources.get("cpuRequest", fallback.cpu_request)),
        cpu_limit=str(resources.get("cpuLimit", fallback.cpu_limit)),
        memory_request=str(resources.get("memoryRequest", fallback.memory_request)),
        memory_limit=str(resources.get("memoryLimit", fallback.memory_limit)),
        gpu=int(resources.get("gpu", fallback.gpu) or 0),
    )


def _merge_resources(items: list[ResourceRequirements]) -> ResourceRequirements:
    if not items:
        return DEFAULT_RESOURCES
    # Take the maximum GPU and prefer the last non-default memory/cpu by max heuristic.
    gpu = max(item.gpu for item in items)

    def _cpu_millis(value: str) -> int:
        text = value.strip().lower()
        if text.endswith("m"):
            return int(float(text[:-1]))
        return int(float(text) * 1000)

    def _mem_mi(value: str) -> int:
        text = value.strip().upper()
        if text.endswith("GI"):
            return int(float(text[:-2]) * 1024)
        if text.endswith("MI"):
            return int(float(text[:-2]))
        if text.endswith("G"):
            return int(float(text[:-1]) * 1024)
        if text.endswith("M"):
            return int(float(text[:-1]))
        return int(float(text))

    cpu_req = max(items, key=lambda item: _cpu_millis(item.cpu_request)).cpu_request
    cpu_lim = max(items, key=lambda item: _cpu_millis(item.cpu_limit)).cpu_limit
    mem_req = max(items, key=lambda item: _mem_mi(item.memory_request)).memory_request
    mem_lim = max(items, key=lambda item: _mem_mi(item.memory_limit)).memory_limit
    return ResourceRequirements(
        cpu_request=cpu_req,
        cpu_limit=cpu_lim,
        memory_request=mem_req,
        memory_limit=mem_lim,
        gpu=gpu,
    )


def _http_egress_cidrs(graph: ArchitectureGraph) -> list[NetworkPolicyRule]:
    rules: list[NetworkPolicyRule] = []
    for node in graph.nodes:
        if node.type != "foundation.http_request":
            continue
        url = _config_str(node, "url", "")
        host = urlparse(url).hostname if url else None
        rules.append(
            NetworkPolicyRule(
                name=f"http-egress-{_slug(node.name)}",
                direction="egress",
                peer_env_id=None,
                peer_env_name=host,
                transport="https" if url.startswith("https") else "http",
                authentication="none",
                ports=[443 if url.startswith("https") else 80],
                cidr=None,
            )
        )
    return rules


def build_deployment_plan(
    graph: ArchitectureGraph,
    *,
    project_slug: str,
    include_kubernetes: bool = False,
    include_openshift: bool = False,
    include_terraform: bool = False,
) -> DeploymentPlan:
    export = graph.export_configuration
    if export:
        include_kubernetes = include_kubernetes or export.include_kubernetes
        include_openshift = include_openshift or export.include_openshift
        include_terraform = include_terraform or export.include_terraform

    envs_by_id = {env.id: env for env in graph.deployment_environments}
    nodes_by_target: dict[str, list[ArchitectureNode]] = {}
    unassigned: list[ArchitectureNode] = []
    for node in graph.nodes:
        target = node.deployment_target
        if target and target in envs_by_id:
            nodes_by_target.setdefault(target, []).append(node)
        else:
            unassigned.append(node)

    targets: list[DeployTarget] = []
    for env in sorted(graph.deployment_environments, key=lambda item: item.name):
        members = nodes_by_target.get(env.id, [])
        base = _resources_for_env(env)
        merged = _merge_resources([_node_resources(node, base) for node in members] or [base])
        kind = env.kind.value
        targets.append(
            DeployTarget(
                env_id=env.id,
                name=env.name,
                kind=kind,
                namespace=_slug(f"{project_slug}-{env.name}"),
                node_ids=[node.id for node in members],
                resources=merged,
                is_cluster=kind in CLUSTER_KINDS,
                is_openshift=kind in OPENSHIFT_KINDS,
                is_air_gapped=kind in AIR_GAPPED_KINDS,
            )
        )

    # Default single target when no swimlanes exist but cluster manifests requested.
    if not targets and (include_kubernetes or include_openshift or include_terraform):
        targets.append(
            DeployTarget(
                env_id="default",
                name="default",
                kind="OPENSHIFT" if include_openshift and not include_kubernetes else "KUBERNETES",
                namespace=_slug(project_slug),
                node_ids=[node.id for node in graph.nodes],
                resources=DEFAULT_RESOURCES,
                is_cluster=True,
                is_openshift=include_openshift,
                is_air_gapped=False,
            )
        )

    # Auto-enable manifests when graph contains cluster environments.
    if any(target.is_cluster for target in targets):
        include_kubernetes = True
    if any(target.is_openshift for target in targets):
        include_openshift = True
        include_kubernetes = True

    secrets = [
        DeploySecretRef(
            secret_name=_config_str(node, "secretName", "secret"),
            provider=_config_str(node, "provider", "env"),
            env_key=_slug(_config_str(node, "secretName", "secret")).replace("-", "_").upper(),
            node_id=node.id,
        )
        for node in graph.nodes
        if node.type == "foundation.secret_reference"
    ]

    env_vars = [
        DeployEnvVar(
            name=_config_str(node, "name", "APP_VAR"),
            example_value=_config_str(node, "exampleValue", ""),
            node_id=node.id,
        )
        for node in graph.nodes
        if node.type == "foundation.environment_variable"
    ]

    network_policies: list[NetworkPolicyRule] = []
    nodes_by_id = {node.id: node for node in graph.nodes}
    for edge in graph.edges:
        source_node = nodes_by_id.get(edge.source_node_id)
        target_node = nodes_by_id.get(edge.target_node_id)
        if source_node is None or target_node is None:
            continue
        left = source_node.deployment_target or ""
        right = target_node.deployment_target or ""
        if not left or not right or left == right:
            continue
        metadata = edge.metadata or {}
        left_env = envs_by_id.get(left)
        right_env = envs_by_id.get(right)
        network_policies.append(
            NetworkPolicyRule(
                name=f"cross-env-{_slug(edge.id[:8])}",
                direction="egress",
                peer_env_id=right,
                peer_env_name=right_env.name if right_env else right,
                transport=str(metadata.get("transport") or "tls"),
                authentication=str(metadata.get("authentication") or "mtls"),
                ports=[443],
                edge_id=edge.id,
            )
        )
        network_policies.append(
            NetworkPolicyRule(
                name=f"cross-env-ingress-{_slug(edge.id[:8])}",
                direction="ingress",
                peer_env_id=left,
                peer_env_name=left_env.name if left_env else left,
                transport=str(metadata.get("transport") or "tls"),
                authentication=str(metadata.get("authentication") or "mtls"),
                ports=[8080],
                edge_id=edge.id,
            )
        )

    network_policies.extend(_http_egress_cidrs(graph))

    primary = next((target for target in targets if target.is_cluster), None)
    if primary is None and targets:
        primary = targets[0]

    notes: list[str] = [
        "Generated manifests never embed secret values — inject via your secret provider.",
        "Local Podman/compose remains the default runtime; cluster manifests are optional.",
    ]
    if unassigned and targets:
        notes.append(
            f"{len(unassigned)} node(s) have no deploymentTarget; "
            "they are omitted from env-scoped counts."
        )

    return DeploymentPlan(
        include_kubernetes=include_kubernetes,
        include_openshift=include_openshift,
        include_terraform=include_terraform,
        image_name=project_slug,
        container_port=8080,
        targets=targets,
        secrets=secrets,
        env_vars=env_vars,
        network_policies=network_policies,
        primary_target=primary,
        notes=notes,
    )


def deployment_plan_as_dict(plan: DeploymentPlan) -> dict[str, Any]:
    """Serialize for Jinja context."""

    def resource_dict(item: ResourceRequirements) -> dict[str, Any]:
        return {
            "cpu_request": item.cpu_request,
            "cpu_limit": item.cpu_limit,
            "memory_request": item.memory_request,
            "memory_limit": item.memory_limit,
            "gpu": item.gpu,
        }

    return {
        "include_kubernetes": plan.include_kubernetes,
        "include_openshift": plan.include_openshift,
        "include_terraform": plan.include_terraform,
        "image_name": plan.image_name,
        "container_port": plan.container_port,
        "targets": [
            {
                "env_id": target.env_id,
                "name": target.name,
                "kind": target.kind,
                "namespace": target.namespace,
                "node_ids": target.node_ids,
                "resources": resource_dict(target.resources),
                "is_cluster": target.is_cluster,
                "is_openshift": target.is_openshift,
                "is_air_gapped": target.is_air_gapped,
            }
            for target in plan.targets
        ],
        "secrets": [
            {
                "secret_name": item.secret_name,
                "provider": item.provider,
                "env_key": item.env_key,
                "node_id": item.node_id,
            }
            for item in plan.secrets
        ],
        "env_vars": [
            {
                "name": item.name,
                "example_value": item.example_value,
                "node_id": item.node_id,
            }
            for item in plan.env_vars
        ],
        "network_policies": [
            {
                "name": item.name,
                "direction": item.direction,
                "peer_env_id": item.peer_env_id,
                "peer_env_name": item.peer_env_name,
                "transport": item.transport,
                "authentication": item.authentication,
                "ports": item.ports,
                "edge_id": item.edge_id,
                "cidr": item.cidr,
            }
            for item in plan.network_policies
        ],
        "primary_target": (
            {
                "env_id": plan.primary_target.env_id,
                "name": plan.primary_target.name,
                "kind": plan.primary_target.kind,
                "namespace": plan.primary_target.namespace,
                "node_ids": plan.primary_target.node_ids,
                "resources": resource_dict(plan.primary_target.resources),
                "is_cluster": plan.primary_target.is_cluster,
                "is_openshift": plan.primary_target.is_openshift,
                "is_air_gapped": plan.primary_target.is_air_gapped,
            }
            if plan.primary_target
            else None
        ),
        "notes": plan.notes,
        "cluster_targets": [
            {
                "env_id": target.env_id,
                "name": target.name,
                "kind": target.kind,
                "namespace": target.namespace,
                "node_ids": target.node_ids,
                "resources": resource_dict(target.resources),
                "is_cluster": target.is_cluster,
                "is_openshift": target.is_openshift,
                "is_air_gapped": target.is_air_gapped,
            }
            for target in plan.targets
            if target.is_cluster
        ],
    }
