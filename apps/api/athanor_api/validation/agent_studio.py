"""Validation of executable agent graphs, independent of endpoint availability."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlparse

from jsonschema import Draft202012Validator  # type: ignore[import-untyped]
from jsonschema.exceptions import SchemaError  # type: ignore[import-untyped]

from athanor_api.catalog import AGENT_DEFINITIONS_BY_TYPE
from athanor_api.exporter.sandbox_policy import parse_endpoints, valid_run_as_user
from athanor_api.schemas.graph import ArchitectureGraph, ValidationIssue
from athanor_api.secret_scan import text_contains_embedded_secret


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


def validate_agent_studio(graph: ArchitectureGraph) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    nodes = {n.id: n for n in graph.nodes}

    def issue(node_id: str, code: str, message: str, action: str, severity: str = "error") -> None:
        issues.append(
            ValidationIssue(
                id=f"{code}:{node_id}:{len(issues)}",
                severity=severity,  # type: ignore[arg-type]
                code=code,
                message=message,
                nodeId=node_id,
                suggestedAction=action,
            )
        )

    for node in graph.nodes:
        definition = AGENT_DEFINITIONS_BY_TYPE.get(node.type)
        if not definition:
            continue
        cfg = node.configuration
        for direction in ("inputs", "outputs"):
            omissions = getattr(node.pruned_ports, direction) if node.pruned_ports else []
            removable = {p["name"] for p in definition[direction] if not p["required"]}
            if len(set(omissions)) != len(omissions) or set(omissions) - removable:
                issue(
                    node.id,
                    "INVALID_PRUNING",
                    "Only catalog-defined optional ports may be omitted.",
                    "Restore required ports.",
                )
            expected = [p for p in definition[direction] if p["name"] not in omissions]
            actual = getattr(node, direction)
            actual_by_name = {p.name: p for p in actual}
            if len(actual) != len(expected) or any(
                p["name"] not in actual_by_name
                or actual_by_name[p["name"]].direction != p["direction"]
                or actual_by_name[p["name"]].contract_type.value != p["contractType"]
                or actual_by_name[p["name"]].required != p["required"]
                or actual_by_name[p["name"]].multiple != p["multiple"]
                for p in expected
            ):
                issue(
                    node.id,
                    "AGENT_PORT_CONTRACT",
                    "Block ports differ from the executable contract.",
                    "Recreate this block from the library.",
                )
        fields = {f["key"]: f for f in definition["configurationFields"]}
        if set(cfg) - set(fields):
            issue(
                node.id,
                "AGENT_UNKNOWN_CONFIG",
                "Block contains unsupported configuration keys.",
                "Keep only declared fields; use secret environment references for credentials.",
            )
        for key, field in fields.items():
            if key not in cfg:
                continue  # Generic required-config check reports missing fields.
            value = cfg[key]
            valid = True
            if field["type"] == "boolean":
                valid = isinstance(value, bool)
            elif field["type"] == "number":
                valid = (
                    isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and math.isfinite(value)
                    and value > 0
                )
                if key != "cpus":
                    valid = valid and float(value).is_integer()
                ceiling = {
                    "maxSteps": 100,
                    "maxToolCalls": 500,
                    "timeoutSeconds": 3600,
                    "port": 65535,
                    "memoryMb": 65536,
                    "cpus": 64,
                    "pidsLimit": 4096,
                    "maxTokens": 1000000,
                    "maxOutputCharacters": 100000,
                }.get(key, 1000000)
                valid = valid and value <= ceiling
            else:
                valid = isinstance(value, str)
                if field["type"] == "select":
                    valid = valid and value in field["options"]
            if not valid:
                issue(
                    node.id,
                    "AGENT_INVALID_CONFIG",
                    f"Invalid {field['label']}.",
                    "Choose an allowed value; numeric limits must be positive and within bounds.",
                )
            if (
                isinstance(value, str)
                and key != "secretName"
                and text_contains_embedded_secret(value)
            ):
                issue(
                    node.id,
                    "AGENT_EMBEDDED_SECRET",
                    "Configuration appears to contain a credential.",
                    "Remove the value and set an environment variable name instead.",
                )
        endpoint = cfg.get("endpoint")
        if isinstance(endpoint, str) and not (
            node.type == "model.predictive" and cfg.get("adapter") == "onnxruntime"
        ):
            try:
                url = urlparse(endpoint)
                valid_url = (
                    url.scheme in {"http", "https"}
                    and bool(url.hostname)
                    and url.port != 0
                    and not url.username
                    and not url.password
                    and not url.fragment
                )
                if any(
                    re.search(r"token|key|secret|password|signature", key, re.I)
                    for key in parse_qs(url.query)
                ):
                    valid_url = False
            except ValueError:
                valid_url = False
            if not valid_url:
                issue(
                    node.id,
                    "AGENT_INVALID_ENDPOINT",
                    "Endpoint must be an absolute HTTP(S) URL without credentials or fragments.",
                    "Paste the full API URL and put credentials in the environment.",
                )
        if node.type == "model.predictive" and cfg.get("adapter") == "onnxruntime":
            model_path = str(cfg.get("modelPath", ""))
            if not model_path.startswith("/models/") or ".." in model_path.split("/"):
                issue(
                    node.id,
                    "MODEL_PATH_OUTSIDE_IMAGE_MODELS",
                    "ONNX model path must stay under /models in the exported image.",
                    "Set a path such as /models/model.onnx and add the model to the image build.",
                )
        if cfg.get("secretName") and not re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_]*", str(cfg["secretName"])
        ):
            issue(
                node.id,
                "AGENT_INVALID_SECRET_NAME",
                "Invalid secret environment variable name.",
                "Use a name such as MODEL_API_KEY.",
            )
        for key in ("toolName", "promptName", "inputKey", "outputKey"):
            if key in cfg and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]{0,63}", str(cfg[key])):
                issue(
                    node.id,
                    "AGENT_INVALID_NAME",
                    f"Invalid {key}.",
                    "Use letters, numbers, underscores, or hyphens; start with a "
                    "letter or underscore.",
                )
        if "inputSchema" in cfg:
            try:
                validate_schema(cfg["inputSchema"])
            except (ValueError, TypeError, SchemaError, RecursionError):
                issue(
                    node.id,
                    "AGENT_INVALID_SCHEMA",
                    "Tool arguments are not a valid JSON Schema 2020-12 object.",
                    "Use the argument builder or correct the schema. Remote references"
                    " are disabled.",
                )
        if node.type == "mcp.stdio":
            try:
                args = json.loads(str(cfg.get("args", "")))
                if (
                    not isinstance(args, list)
                    or len(args) > 100
                    or not all(isinstance(a, str) and len(a) < 4096 for a in args)
                ):
                    raise ValueError()
            except (ValueError, TypeError):
                issue(
                    node.id,
                    "MCP_INVALID_ARGS",
                    "Command arguments must be a JSON array of strings.",
                    "Use [] for no arguments.",
                )
            if not re.fullmatch(r"[A-Za-z0-9_./-]+", str(cfg.get("command", ""))):
                issue(
                    node.id,
                    "MCP_INVALID_COMMAND",
                    "Enter a single executable without shell syntax.",
                    "Put arguments in the arguments array.",
                )
            names = [
                n.strip() for n in str(cfg.get("environmentNames", "")).split(",") if n.strip()
            ]
            if any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", n) for n in names):
                issue(
                    node.id,
                    "MCP_INVALID_ENV",
                    "Invalid environment name.",
                    "Use comma-separated variable names only.",
                )
            registry = cfg.get("packageRegistry")
            pattern = (
                r"(?:@[a-z0-9_.-]+/)?[a-z0-9_.-]+@[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?"
                if registry == "npm"
                else r"[A-Za-z0-9_.-]+==[0-9]+(?:\.[0-9]+)*(?:[a-zA-Z][a-zA-Z0-9.]*)?"
            )
            if registry in {"npm", "pypi"} and not re.fullmatch(
                pattern, str(cfg.get("packageSpec", ""))
            ):
                issue(
                    node.id,
                    "MCP_PIN_REQUIRED",
                    "Use a package name and exact version.",
                    "Use name@1.2.3 for npm or name==1.2.3 for PyPI.",
                )
            issue(
                node.id,
                "MCP_PACKAGE_REVIEW",
                "Review imported package, executable, and arguments before "
                "building. Only allowed tool names are exposed.",
                "Custom commands need installation in the exported Containerfile.",
                "info",
            )
        if node.type == "mcp.resource" and not urlparse(str(cfg.get("uri", ""))).scheme:
            issue(
                node.id,
                "MCP_INVALID_RESOURCE_URI",
                "Resource URI must be absolute.",
                "Use a URI such as docs://agent/instructions.",
            )
        if node.type == "sandbox.firecracker":
            issue(
                node.id,
                "SANDBOX_ADAPTER_REQUIRED",
                "Firecracker exports a deployment blueprint. The launcher will "
                "refuse to run until a platform adapter is implemented.",
                "Provision a microVM adapter, or choose an installed OCI runtime.",
                "warning",
            )
        if node.type == "sandbox.openshell":
            issue(
                node.id,
                "SANDBOX_OPENSHELL_GATEWAY",
                "OpenShell runs this worker through the selected gateway.",
                "Install the OpenShell CLI, select a gateway, and attach providers "
                "for credential names. Cluster export is not available for this sandbox.",
                "info",
            )
        if node.type == "agent.guardrails":
            phrases = [
                line.strip()
                for line in str(cfg.get("denyPhrases", "")).splitlines()
                if line.strip()
            ]
            if len(phrases) > 50 or any(len(phrase) > 200 for phrase in phrases):
                issue(
                    node.id,
                    "GUARDRAIL_PHRASES",
                    "Use at most 50 denied phrases, each at most 200 characters.",
                    "Shorten the phrase list.",
                )
            tool_names = [
                name.strip() for name in str(cfg.get("denyTools", "")).split(",") if name.strip()
            ]
            if any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", name) for name in tool_names):
                issue(
                    node.id,
                    "GUARDRAIL_TOOLS",
                    "Denied tools must be comma-separated tool names.",
                    "Use names such as lookup or search_docs.",
                )
        if node.type == "sandbox.policy":
            if not valid_run_as_user(str(cfg.get("runAsUser", ""))):
                issue(
                    node.id,
                    "SANDBOX_POLICY_USER",
                    "Run as user must be a UID from 1 through 4294967294, or sandbox.",
                    "Use 65532, or sandbox for the OpenShell named user.",
                )
            try:
                endpoints = parse_endpoints(str(cfg.get("allowedEndpoints", "")))
            except ValueError:
                endpoints = None
                issue(
                    node.id,
                    "SANDBOX_POLICY_ENDPOINT",
                    "Allowed endpoints must be comma-separated host:port pairs.",
                    "Use names such as api.example.com:443. Do not include a scheme or path.",
                )
            if cfg.get("network") == "none" and endpoints:
                issue(
                    node.id,
                    "SANDBOX_POLICY_ENDPOINTS_IGNORED",
                    "Allowed endpoints are ignored while network access is none.",
                    "Select bridge before relying on the endpoint list.",
                    "warning",
                )
            if cfg.get("network") == "bridge" and endpoints == []:
                issue(
                    node.id,
                    "SANDBOX_POLICY_BRIDGE",
                    "Bridge with no endpoints enables OCI networking. "
                    "OpenShell still denies egress.",
                    "Add host:port pairs for destinations the worker must reach.",
                    "warning",
                )
            if (
                not cfg.get("readOnlyRoot", True)
                or not cfg.get("dropCapabilities", True)
                or not cfg.get("noNewPrivileges", True)
            ):
                issue(
                    node.id,
                    "SANDBOX_POLICY_WEAKENED",
                    "This policy turns off a default isolation control.",
                    "Leave the root filesystem read-only, drop capabilities, "
                    "and block privilege escalation.",
                    "warning",
                )
        if (
            node.type.startswith("sandbox.")
            and node.type != "sandbox.policy"
            and cfg.get("network") == "bridge"
        ):
            issue(
                node.id,
                "SANDBOX_EGRESS",
                "Bridge mode permits outbound network; endpoint checks are not a network firewall.",
                "Apply egress restrictions in your deployment infrastructure.",
                "warning",
            )
        inbound = [e for e in graph.edges if e.target_node_id == node.id]
        port_names = {p.id: p.name for p in node.inputs}
        sources: dict[str, list[Any]] = {}
        for edge in inbound:
            source = nodes.get(edge.source_node_id)
            if source:
                sources.setdefault(port_names.get(edge.target_port_id, ""), []).append(source)
        allowed: dict[str, Callable[[str], bool]] = {
            "sandbox": lambda t: t.startswith("sandbox.") and t != "sandbox.policy",
            "model": lambda t: t == "agent.model",
            "tools": lambda t: t in {"agent.tool", "agent.custom_tool", "model.predictive"},
            "mcp": lambda t: t in {"mcp.client", "mcp.server", "mcp.stdio"},
            "resources": lambda t: t == "mcp.resource",
            "prompts": lambda t: t == "mcp.prompt",
            "guardrails": lambda t: t == "agent.guardrails",
        }
        for name, predicate in allowed.items():
            if any(not predicate(source.type) for source in sources.get(name, [])):
                issue(
                    node.id,
                    "AGENT_UNSUPPORTED_BINDING",
                    f"The {name} input has an unsupported source block.",
                    "Use a compatible block from the agent library.",
                )
        if node.type.startswith("sandbox.") and node.type != "sandbox.policy":
            policies = sources.get("policy", [])
            if any(source.type != "sandbox.policy" for source in policies):
                issue(
                    node.id,
                    "AGENT_UNSUPPORTED_BINDING",
                    "The policy input has an unsupported source block.",
                    "Connect a Sandbox Policy block.",
                )
            if len(policies) > 1:
                issue(
                    node.id,
                    "SANDBOX_POLICY_DUPLICATE",
                    "Connect one Sandbox Policy to this runtime.",
                    "Remove the extra policy connection.",
                )
        for sandbox in sources.get("sandbox", []):
            policy_ports = {port.id for port in sandbox.inputs if port.name == "policy"}
            attached = [
                nodes[edge.source_node_id]
                for edge in graph.edges
                if edge.target_node_id == sandbox.id
                and edge.target_port_id in policy_ports
                and edge.source_node_id in nodes
                and nodes[edge.source_node_id].type == "sandbox.policy"
            ]
            network = (
                attached[0].configuration.get("network")
                if attached
                else sandbox.configuration.get("network")
            )
            if network == "none" and (
                node.type == "agent.sandboxed"
                or node.type.startswith("harness.")
                or sources.get("tools")
            ):
                issue(
                    node.id,
                    "SANDBOX_NETWORK_DISABLED",
                    "Network is disabled; endpoint calls will be blocked in the exported runtime.",
                    "Select bridge only when ready to allow network access.",
                    "warning",
                )
        unique_fields = {
            "tools": "toolName",
            "resources": "uri",
            "prompts": "promptName",
            "guardrails": "name",
        }
        for port_name, key in unique_fields.items():
            names = [n.configuration.get(key) for n in sources.get(port_name, [])]
            if len(names) != len(set(names)):
                issue(
                    node.id,
                    "AGENT_DUPLICATE_NAME",
                    f"Duplicate names connected to {port_name}.",
                    "Give each connected capability a unique name.",
                )
        if node.type == "mcp.server" and cfg.get("transport") == "streamable-http":
            issue(
                node.id,
                "MCP_LOCAL_HTTP",
                "HTTP export is bound to localhost; remote publishing needs an "
                "MCP-aware OAuth gateway.",
                "Configure authorization and origin checks before exposing the service remotely.",
                "info",
            )
    return issues
