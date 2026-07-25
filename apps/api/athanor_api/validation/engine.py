"""Static architecture graph validation (no pipeline execution)."""

from __future__ import annotations

import json
import re
import uuid
from collections import defaultdict, deque
from typing import Any
from urllib.parse import urlparse

from athanor_api.catalog import REQUIRED_CONFIG_BY_TYPE
from athanor_api.schemas.graph import (
    ArchitectureGraph,
    ArchitectureNode,
    ContractType,
    NodePort,
    ValidationIssue,
)
from athanor_api.secret_scan import text_contains_embedded_secret
from athanor_api.validation.contracts import contract_compatibility_reason

PORTAL_TYPES = {"foundation.portal_input", "foundation.portal_output"}
VALID_PORTAL_SCOPES = {"project", "macro", "deployment"}
VALID_CONTRACT_TYPES = {item.value for item in ContractType}
VALID_HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
FORBIDDEN_SECRET_KEYS = {"value", "secret", "secretValue", "password", "token", "apiKey"}
FORBIDDEN_IDENTITY_KEYS = {
    "value",
    "secret",
    "secretValue",
    "password",
    "token",
    "apiKey",
    "clientSecret",
    "privateKey",
}


def _issue(
    *,
    severity: str,
    code: str,
    message: str,
    node_id: str | None = None,
    edge_id: str | None = None,
    suggested_action: str | None = None,
) -> ValidationIssue:
    return ValidationIssue(
        id=str(uuid.uuid4()),
        severity=severity,  # type: ignore[arg-type]
        code=code,
        message=message,
        nodeId=node_id,
        edgeId=edge_id,
        suggestedAction=suggested_action,
    )


def _find_port(node: ArchitectureNode, port_id: str, direction: str) -> NodePort | None:
    ports = node.inputs if direction == "input" else node.outputs
    for port in ports:
        if port.id == port_id:
            return port
    return None


def _has_cycle(graph: ArchitectureGraph) -> list[str]:
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        adjacency[edge.source_node_id].append(edge.target_node_id)

    visiting: set[str] = set()
    visited: set[str] = set()
    cycle_nodes: list[str] = []

    def dfs(node_id: str) -> bool:
        if node_id in visiting:
            cycle_nodes.append(node_id)
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        for nxt in adjacency.get(node_id, []):
            if dfs(nxt):
                return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    for node in graph.nodes:
        if node.id not in visited and dfs(node.id):
            return cycle_nodes
    return []


def _unreachable_nodes(graph: ArchitectureGraph) -> set[str]:
    if not graph.nodes:
        return set()

    roots = {
        node.id
        for node in graph.nodes
        if not any(edge.target_node_id == node.id for edge in graph.edges)
    }
    if not roots:
        # Fully cyclic or all nodes have inbound edges — treat none as unreachable via BFS roots.
        roots = {graph.nodes[0].id}

    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        adjacency[edge.source_node_id].append(edge.target_node_id)

    seen: set[str] = set()
    queue: deque[str] = deque(roots)
    while queue:
        current = queue.popleft()
        if current in seen:
            continue
        seen.add(current)
        for nxt in adjacency.get(current, []):
            queue.append(nxt)

    return {node.id for node in graph.nodes} - seen


def _config_value_missing(configuration: dict[str, Any], key: str) -> bool:
    if key not in configuration:
        return True
    value = configuration[key]
    if isinstance(value, str) and not value.strip():
        return True
    return False


def _validate_node_specific(node: ArchitectureNode) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    config = node.configuration

    if node.type == "foundation.json_input":
        raw = config.get("json", "")
        if isinstance(raw, str) and raw.strip():
            try:
                json.loads(raw)
            except json.JSONDecodeError as exc:
                issues.append(
                    _issue(
                        severity="error",
                        code="INVALID_JSON_INPUT",
                        message=f"JSON Input '{node.name}' is not valid JSON: {exc.msg}.",
                        node_id=node.id,
                        suggested_action="Fix the JSON document in the inspector.",
                    )
                )

    if node.type == "foundation.http_request":
        url_raw = config.get("url", "")
        url = url_raw.strip() if isinstance(url_raw, str) else ""
        if url:
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                issues.append(
                    _issue(
                        severity="error",
                        code="INVALID_HTTP_URL",
                        message=f"HTTP Request '{node.name}' has an invalid URL.",
                        node_id=node.id,
                        suggested_action="Use an absolute http(s) URL.",
                    )
                )
        method_raw = config.get("method", "")
        method = method_raw.strip().upper() if isinstance(method_raw, str) else ""
        if method and method not in VALID_HTTP_METHODS:
            issues.append(
                _issue(
                    severity="error",
                    code="INVALID_HTTP_METHOD",
                    message=f"HTTP Request '{node.name}' uses unsupported method '{method}'.",
                    node_id=node.id,
                    suggested_action="Choose GET, POST, PUT, PATCH, or DELETE.",
                )
            )
        timeout = config.get("timeoutSeconds")
        if isinstance(timeout, (int, float)) and timeout <= 0:
            issues.append(
                _issue(
                    severity="error",
                    code="INVALID_HTTP_TIMEOUT",
                    message=f"HTTP Request '{node.name}' timeout must be positive.",
                    node_id=node.id,
                    suggested_action="Set timeoutSeconds to a positive number.",
                )
            )

    if node.type == "foundation.environment_variable":
        name_raw = config.get("name", "")
        name = name_raw.strip() if isinstance(name_raw, str) else ""
        if name and not ENV_NAME_RE.match(name):
            issues.append(
                _issue(
                    severity="error",
                    code="INVALID_ENV_NAME",
                    message=(f"Environment Variable '{node.name}' has an invalid name '{name}'."),
                    node_id=node.id,
                    suggested_action="Use a shell-safe identifier such as APP_REGION.",
                )
            )

    if node.type == "foundation.secret_reference":
        for key in FORBIDDEN_SECRET_KEYS:
            if key in config and not _config_value_missing(config, key):
                issues.append(
                    _issue(
                        severity="error",
                        code="SECRET_VALUE_EMBEDDED",
                        message=(
                            f"Secret Reference '{node.name}' must not embed secret values "
                            f"(found '{key}')."
                        ),
                        node_id=node.id,
                        suggested_action="Remove the value and keep only secretName + provider.",
                    )
                )

    if node.type == "fine_tuning.lora_trainer":
        for key in ("epochs", "batchSize", "rank", "alpha", "gradientAccumulation"):
            value = config.get(key)
            if isinstance(value, (int, float)) and value <= 0:
                issues.append(
                    _issue(
                        severity="error",
                        code="INVALID_LORA_HYPERPARAMETER",
                        message=f"LoRA Trainer '{node.name}' has non-positive '{key}'.",
                        node_id=node.id,
                        suggested_action=f"Set '{key}' to a positive number.",
                    )
                )

    if node.type == "vision.image_preprocessor":
        for key in ("width", "height"):
            value = config.get(key)
            if isinstance(value, (int, float)) and value < 0:
                issues.append(
                    _issue(
                        severity="error",
                        code="INVALID_VISION_DIMENSION",
                        message=f"Image Preprocessor '{node.name}' has negative '{key}'.",
                        node_id=node.id,
                        suggested_action=f"Set '{key}' to 0 (keep) or a positive pixel size.",
                    )
                )

    if node.type == "vision.vision_model":
        max_tokens = config.get("maxTokens")
        if isinstance(max_tokens, (int, float)) and max_tokens <= 0:
            issues.append(
                _issue(
                    severity="error",
                    code="INVALID_VISION_MAX_TOKENS",
                    message=f"Vision Model '{node.name}' has non-positive maxTokens.",
                    node_id=node.id,
                    suggested_action="Set maxTokens to a positive number.",
                )
            )

    if node.type == "multi_agent.tool_definition":
        schema_raw = config.get("inputSchema", "")
        if isinstance(schema_raw, str) and schema_raw.strip():
            try:
                parsed = json.loads(schema_raw)
                if not isinstance(parsed, dict):
                    raise ValueError("schema must be an object")
            except (json.JSONDecodeError, ValueError):
                issues.append(
                    _issue(
                        severity="error",
                        code="INVALID_TOOL_INPUT_SCHEMA",
                        message=f"Tool Definition '{node.name}' has invalid JSON inputSchema.",
                        node_id=node.id,
                        suggested_action="Provide a JSON object schema for tool arguments.",
                    )
                )

    if node.type == "multi_agent.mcp_server":
        endpoint_raw = config.get("endpoint", "")
        endpoint = endpoint_raw.strip() if isinstance(endpoint_raw, str) else ""
        transport_raw = config.get("transport", "http")
        transport = transport_raw if isinstance(transport_raw, str) else "http"
        if endpoint and transport != "stdio":
            parsed = urlparse(endpoint)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                issues.append(
                    _issue(
                        severity="error",
                        code="INVALID_MCP_ENDPOINT",
                        message=f"MCP Server '{node.name}' has an invalid endpoint.",
                        node_id=node.id,
                        suggested_action="Use an http(s) URL, or switch transport to stdio.",
                    )
                )

    if node.type == "enterprise.audit_log":
        retention = config.get("retentionDays")
        if isinstance(retention, (int, float)) and retention <= 0:
            issues.append(
                _issue(
                    severity="error",
                    code="INVALID_AUDIT_RETENTION",
                    message=f"Audit Log '{node.name}' has non-positive retentionDays.",
                    node_id=node.id,
                    suggested_action="Set retentionDays to a positive number.",
                )
            )

    if node.type == "enterprise.identity_reference":
        for key in FORBIDDEN_IDENTITY_KEYS:
            if key in config and not _config_value_missing(config, key):
                issues.append(
                    _issue(
                        severity="error",
                        code="IDENTITY_CREDENTIAL_EMBEDDED",
                        message=(
                            f"Identity Reference '{node.name}' must not embed credentials "
                            f"(found '{key}')."
                        ),
                        node_id=node.id,
                        suggested_action=(
                            "Remove credentials; keep only provider, clientId, and issuer."
                        ),
                    )
                )

    if node.type.startswith("big_blocks."):
        for key in FORBIDDEN_IDENTITY_KEYS | FORBIDDEN_SECRET_KEYS:
            if key in config and not _config_value_missing(config, key):
                issues.append(
                    _issue(
                        severity="error",
                        code="BIG_BLOCK_SECRET_EMBEDDED",
                        message=(
                            f"Big Block '{node.name}' must not embed secret values "
                            f"(found '{key}'). Use tokenSecretName instead."
                        ),
                        node_id=node.id,
                        suggested_action=("Remove embedded secrets; reference a secret name only."),
                    )
                )
        token_name = config.get("tokenSecretName", "")
        if isinstance(token_name, str) and len(token_name) > 128:
            issues.append(
                _issue(
                    severity="error",
                    code="BIG_BLOCK_TOKEN_NAME_TOO_LONG",
                    message=(
                        f"Big Block '{node.name}' tokenSecretName looks like an embedded "
                        "token value."
                    ),
                    node_id=node.id,
                    suggested_action="Use a short secret name, not the token itself.",
                )
            )
        custom_template = config.get("customTemplate", "")
        if isinstance(custom_template, str) and text_contains_embedded_secret(custom_template):
            issues.append(
                _issue(
                    severity="error",
                    code="BIG_BLOCK_TEMPLATE_SECRET_EMBEDDED",
                    message=(
                        f"Big Block '{node.name}' customTemplate appears to embed a "
                        "credential or token value."
                    ),
                    node_id=node.id,
                    suggested_action=(
                        "Remove secrets from the custom template; reference tokenSecretName "
                        "or a Secret Reference node instead."
                    ),
                )
            )

    return issues


def validate_architecture_graph(graph: ArchitectureGraph) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    nodes_by_id = {node.id: node for node in graph.nodes}

    # Duplicate identifiers
    seen_nodes: set[str] = set()
    for node_id in node_ids:
        if node_id in seen_nodes:
            issues.append(
                _issue(
                    severity="error",
                    code="DUPLICATE_NODE_ID",
                    message=f"Duplicate node id '{node_id}'.",
                    node_id=node_id,
                    suggested_action="Assign a unique id to each node.",
                )
            )
        seen_nodes.add(node_id)

    seen_edges: set[str] = set()
    for edge_id in edge_ids:
        if edge_id in seen_edges:
            issues.append(
                _issue(
                    severity="error",
                    code="DUPLICATE_EDGE_ID",
                    message=f"Duplicate edge id '{edge_id}'.",
                    edge_id=edge_id,
                    suggested_action="Assign a unique id to each edge.",
                )
            )
        seen_edges.add(edge_id)

    # Required configuration + required inputs
    inbound_counts: dict[tuple[str, str], int] = defaultdict(int)
    for edge in graph.edges:
        inbound_counts[(edge.target_node_id, edge.target_port_id)] += 1

    for node in graph.nodes:
        required_keys = REQUIRED_CONFIG_BY_TYPE.get(node.type)
        if required_keys is None:
            issues.append(
                _issue(
                    severity="warning",
                    code="UNKNOWN_NODE_TYPE",
                    message=f"Node type '{node.type}' is not in the Phase 5 node catalog.",
                    node_id=node.id,
                    suggested_action="Use a supported catalog node type.",
                )
            )
        else:
            for key in required_keys:
                if _config_value_missing(node.configuration, key):
                    issues.append(
                        _issue(
                            severity="error",
                            code="MISSING_CONFIGURATION",
                            message=(
                                f"Node '{node.name}' is missing required configuration '{key}'."
                            ),
                            node_id=node.id,
                            suggested_action=f"Set '{key}' in the node inspector.",
                        )
                    )
            issues.extend(_validate_node_specific(node))

        for port in node.inputs:
            if port.required and inbound_counts[(node.id, port.id)] == 0:
                issues.append(
                    _issue(
                        severity="error",
                        code="REQUIRED_INPUT_UNCONNECTED",
                        message=(
                            f"Required input '{port.name}' on node '{node.name}' is not connected."
                        ),
                        node_id=node.id,
                        suggested_action="Connect a compatible output to this input port.",
                    )
                )

    # Edge-level checks
    for edge in graph.edges:
        source = nodes_by_id.get(edge.source_node_id)
        target = nodes_by_id.get(edge.target_node_id)
        if source is None or target is None:
            issues.append(
                _issue(
                    severity="error",
                    code="EDGE_DANGLING_NODE",
                    message=f"Edge '{edge.id}' references a missing node.",
                    edge_id=edge.id,
                    suggested_action="Remove the edge or restore the missing node.",
                )
            )
            continue

        source_port = _find_port(source, edge.source_port_id, "output")
        target_port = _find_port(target, edge.target_port_id, "input")
        if source_port is None or target_port is None:
            issues.append(
                _issue(
                    severity="error",
                    code="EDGE_INVALID_PORT",
                    message=f"Edge '{edge.id}' references a missing port.",
                    edge_id=edge.id,
                    suggested_action="Reconnect using valid input/output ports.",
                )
            )
            continue

        if not target_port.multiple and inbound_counts[(target.id, target_port.id)] > 1:
            issues.append(
                _issue(
                    severity="error",
                    code="INPUT_MULTIPLICITY",
                    message=(
                        f"Input '{target_port.name}' on '{target.name}' allows only one connection."
                    ),
                    edge_id=edge.id,
                    node_id=target.id,
                    suggested_action="Remove extra connections to this input.",
                )
            )

        reason = contract_compatibility_reason(source_port.contract_type, target_port.contract_type)
        if reason:
            issues.append(
                _issue(
                    severity="error",
                    code="CONTRACT_INCOMPATIBLE",
                    message=reason,
                    edge_id=edge.id,
                    suggested_action=(
                        "Connect ports with compatible contract types or insert an adapter."
                    ),
                )
            )

    cycle = _has_cycle(graph)
    if cycle:
        issues.append(
            _issue(
                severity="error",
                code="GRAPH_CYCLE",
                message=(
                    "The architecture graph contains a cycle, "
                    "which is invalid for Phase 1 pipelines."
                ),
                node_id=cycle[0],
                suggested_action="Remove edges that create a loop.",
            )
        )

    for node_id in sorted(_unreachable_nodes(graph)):
        node = nodes_by_id[node_id]
        # Isolated output viewers / transforms with no path from a root are warnings.
        if node.inputs:
            issues.append(
                _issue(
                    severity="warning",
                    code="UNREACHABLE_NODE",
                    message=f"Node '{node.name}' is unreachable from any root input.",
                    node_id=node_id,
                    suggested_action="Connect this node to the main data-flow path.",
                )
            )

    issues.extend(_validate_portals(graph))
    issues.extend(_validate_macros(graph))
    issues.extend(_validate_cross_environment_edges(graph))
    issues.extend(_validate_deployment_boundaries(graph))

    return issues


def _config_str(configuration: dict[str, Any], key: str) -> str:
    value = configuration.get(key)
    return value.strip() if isinstance(value, str) else ""


def _validate_portals(graph: ArchitectureGraph) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    portals = [node for node in graph.nodes if node.type in PORTAL_TYPES]
    by_bus: dict[str, list[ArchitectureNode]] = defaultdict(list)

    for node in portals:
        bus_id = _config_str(node.configuration, "busId")
        display_name = _config_str(node.configuration, "displayName")
        contract_raw = _config_str(node.configuration, "contractType")
        scope = _config_str(node.configuration, "scope")

        if not bus_id:
            issues.append(
                _issue(
                    severity="error",
                    code="PORTAL_MISSING_BUS_ID",
                    message=f"Portal '{node.name}' is missing a bus identifier.",
                    node_id=node.id,
                    suggested_action="Set a shared busId on the portal.",
                )
            )
        if not display_name:
            issues.append(
                _issue(
                    severity="error",
                    code="PORTAL_MISSING_DISPLAY_NAME",
                    message=f"Portal '{node.name}' is missing a display name.",
                    node_id=node.id,
                    suggested_action="Set displayName on the portal.",
                )
            )
        if contract_raw and contract_raw not in VALID_CONTRACT_TYPES:
            issues.append(
                _issue(
                    severity="error",
                    code="PORTAL_INVALID_CONTRACT",
                    message=(
                        f"Portal '{node.name}' uses unsupported contract type '{contract_raw}'."
                    ),
                    node_id=node.id,
                    suggested_action="Choose a contract type from the portal catalog.",
                )
            )
        if scope and scope not in VALID_PORTAL_SCOPES:
            issues.append(
                _issue(
                    severity="error",
                    code="PORTAL_INVALID_SCOPE",
                    message=f"Portal '{node.name}' has invalid scope '{scope}'.",
                    node_id=node.id,
                    suggested_action="Use project, macro, or deployment scope.",
                )
            )
        if bus_id:
            by_bus[bus_id].append(node)

    for bus_id, members in by_bus.items():
        contracts = {
            _config_str(node.configuration, "contractType") or "STRING" for node in members
        }
        if len(contracts) > 1:
            for node in members:
                issues.append(
                    _issue(
                        severity="error",
                        code="PORTAL_CONTRACT_MISMATCH",
                        message=(
                            f"Portal bus '{bus_id}' has mismatched contract types "
                            f"({', '.join(sorted(contracts))})."
                        ),
                        node_id=node.id,
                        suggested_action="Align contractType on all portals sharing this bus.",
                    )
                )

        has_input = any(node.type == "foundation.portal_input" for node in members)
        has_output = any(node.type == "foundation.portal_output" for node in members)
        if has_input != has_output:
            for node in members:
                issues.append(
                    _issue(
                        severity="warning",
                        code="PORTAL_UNPAIRED",
                        message=(
                            f"Portal bus '{bus_id}' is unpaired "
                            f"({'missing Portal Output' if has_input else 'missing Portal Input'})."
                        ),
                        node_id=node.id,
                        suggested_action="Add a matching portal endpoint with the same busId.",
                    )
                )

    return issues


def _validate_macros(graph: ArchitectureGraph) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    node_ids = {node.id for node in graph.nodes}
    for macro in graph.macro_blocks:
        missing = [node_id for node_id in macro.node_ids if node_id not in node_ids]
        if missing:
            issues.append(
                _issue(
                    severity="error",
                    code="MACRO_MISSING_NODES",
                    message=(
                        f"Macro '{macro.name}' references missing node(s): {', '.join(missing)}."
                    ),
                    suggested_action="Expand or recreate the macro after restoring nodes.",
                )
            )
        if len(macro.node_ids) < 2:
            issues.append(
                _issue(
                    severity="warning",
                    code="MACRO_TOO_SMALL",
                    message=f"Macro '{macro.name}' contains fewer than two nodes.",
                    suggested_action="Collapse at least two nodes into a macro block.",
                )
            )
    return issues


def _validate_cross_environment_edges(graph: ArchitectureGraph) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    nodes_by_id = {node.id: node for node in graph.nodes}
    deploy_export = bool(
        graph.export_configuration
        and (
            graph.export_configuration.include_kubernetes
            or graph.export_configuration.include_openshift
            or graph.export_configuration.include_terraform
        )
    )
    for edge in graph.edges:
        source = nodes_by_id.get(edge.source_node_id)
        target = nodes_by_id.get(edge.target_node_id)
        if source is None or target is None:
            continue
        left = source.deployment_target or ""
        right = target.deployment_target or ""
        if not left or not right or left == right:
            continue

        metadata = edge.metadata or {}
        transport = metadata.get("transport")
        authentication = metadata.get("authentication")
        network = metadata.get("networkPolicy", metadata.get("network"))
        complete = all(
            isinstance(value, str) and value.strip()
            for value in (transport, authentication, network)
        )
        if complete:
            issues.append(
                _issue(
                    severity="info",
                    code="CROSS_ENVIRONMENT_EDGE",
                    message=(
                        f"Edge '{edge.id}' crosses deployment environments '{left}' → '{right}'."
                    ),
                    edge_id=edge.id,
                    suggested_action="Confirm transport, authentication, and network policy.",
                )
            )
        else:
            issues.append(
                _issue(
                    severity="error" if deploy_export else "warning",
                    code="CROSS_ENVIRONMENT_EDGE_INCOMPLETE",
                    message=(
                        f"Cross-environment edge '{edge.id}' is missing transport, "
                        "authentication, or network policy metadata."
                    ),
                    edge_id=edge.id,
                    suggested_action=(
                        "Set edge.metadata.transport, authentication, and networkPolicy "
                        "before cluster export."
                    ),
                )
            )
    return issues


def _validate_deployment_boundaries(graph: ArchitectureGraph) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    env_ids = {env.id: env for env in graph.deployment_environments}

    for node in graph.nodes:
        target = node.deployment_target
        if target and target not in env_ids:
            issues.append(
                _issue(
                    severity="error",
                    code="DEPLOYMENT_TARGET_UNKNOWN",
                    message=(f"Node '{node.name}' references unknown deploymentTarget '{target}'."),
                    node_id=node.id,
                    suggested_action="Assign a valid swimlane id or clear deploymentTarget.",
                )
            )

    for env in graph.deployment_environments:
        if env.kind.value != "AIR_GAPPED_ENVIRONMENT":
            continue
        for node in graph.nodes:
            if node.deployment_target != env.id:
                continue
            if node.type != "foundation.http_request":
                continue
            url = node.configuration.get("url")
            url_text = url.strip() if isinstance(url, str) else ""
            if url_text.startswith("http://") or url_text.startswith("https://"):
                issues.append(
                    _issue(
                        severity="error",
                        code="AIR_GAPPED_EXTERNAL_HTTP",
                        message=(
                            f"HTTP Request '{node.name}' targets an external URL inside "
                            f"air-gapped environment '{env.name}'."
                        ),
                        node_id=node.id,
                        suggested_action=(
                            "Move the node out of the air-gapped swimlane or use an "
                            "internal endpoint."
                        ),
                    )
                )

    cluster_kinds = {"KUBERNETES", "OPENSHIFT", "AWS_GPU"}
    has_cluster_env = any(env.kind.value in cluster_kinds for env in graph.deployment_environments)
    if has_cluster_env:
        for node in graph.nodes:
            if node.type != "foundation.secret_reference":
                continue
            if node.deployment_target and node.deployment_target in env_ids:
                env = env_ids[node.deployment_target]
                if env.kind.value in cluster_kinds:
                    issues.append(
                        _issue(
                            severity="info",
                            code="SECRET_REF_CLUSTER_LINEAGE",
                            message=(
                                f"Secret Reference '{node.name}' will export as a cluster "
                                "Secret key placeholder (value not embedded)."
                            ),
                            node_id=node.id,
                            suggested_action="Inject the secret value with your cluster provider.",
                        )
                    )

    return issues
