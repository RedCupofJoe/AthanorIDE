"""Safe IDE graph execution for payload inspection.

Security rules:
- Compiled NL transforms run only in the Podman sandbox (never host exec of generated code).
- Uncompiled transforms use the Phase-2 classifier (uppercase/lowercase/strip/identity).
- HTTP calls are skipped by default (no host network).
- Secret Reference values are never returned — only redacted placeholders.
"""

from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from typing import Literal

from athanor_api.execution.models import EdgePayload, ExecutionResult, ExecutionStep
from athanor_api.exporter.ir import classify_instruction
from athanor_api.sandbox import run_in_sandbox
from athanor_api.schemas.graph import ArchitectureGraph, ArchitectureNode
from athanor_api.validation import validate_architecture_graph

StepStatus = Literal["ok", "skipped", "error"]


def _config_str(node: ArchitectureNode, key: str, default: str = "") -> str:
    value = node.configuration.get(key, default)
    return value if isinstance(value, str) else str(value)


def _topo_sort(graph: ArchitectureGraph) -> list[str]:
    nodes = {node.id: node for node in graph.nodes}
    inbound: dict[str, int] = {node_id: 0 for node_id in nodes}
    adjacency: dict[str, list[str]] = {node_id: [] for node_id in nodes}

    def link(source: str, target: str) -> None:
        if source not in nodes or target not in nodes:
            return
        adjacency[source].append(target)
        inbound[target] += 1

    for edge in graph.edges:
        link(edge.source_node_id, edge.target_node_id)

    # Portal buses are logical edges: every Portal Output precedes matching Portal Inputs.
    by_bus: dict[str, list[str]] = defaultdict(list)
    portal_inputs: dict[str, list[str]] = defaultdict(list)
    for node in graph.nodes:
        if node.type == "foundation.portal_output":
            bus_id = _config_str(node, "busId", "")
            if bus_id:
                by_bus[bus_id].append(node.id)
        elif node.type == "foundation.portal_input":
            bus_id = _config_str(node, "busId", "")
            if bus_id:
                portal_inputs[bus_id].append(node.id)
    for bus_id, outputs in by_bus.items():
        for output_id in outputs:
            for input_id in portal_inputs.get(bus_id, []):
                link(output_id, input_id)

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


def _apply_classifier(text: str, instruction: str) -> str:
    kind = classify_instruction(instruction)
    if kind == "uppercase":
        return text.upper()
    if kind == "lowercase":
        return text.lower()
    if kind == "strip":
        return text.strip()
    return text


def _render_prompt(template: str, variables: str) -> str:
    return template.replace("{{input}}", variables)


def _first_value(mapping: dict[str, str]) -> str:
    if not mapping:
        return ""
    return next(iter(mapping.values()))


def _execute_node(
    node: ArchitectureNode,
    inputs: dict[str, str],
    *,
    buses: dict[str, str],
    text_override: str | None = None,
) -> tuple[StepStatus, dict[str, str], str | None]:
    node_type = node.type

    if node_type == "foundation.text_input":
        value = text_override if text_override is not None else _config_str(node, "value", "")
        out_id = node.outputs[0].id if node.outputs else "out-text"
        return "ok", {out_id: value}, None

    if node_type == "foundation.json_input":
        value = _config_str(node, "json", "")
        out_id = node.outputs[0].id if node.outputs else "out-json"
        return "ok", {out_id: value}, None

    if node_type == "foundation.prompt_template":
        template = _config_str(node, "template", "")
        rendered = _render_prompt(template, _first_value(inputs))
        out_id = node.outputs[0].id if node.outputs else "out-prompt"
        return "ok", {out_id: rendered}, None

    if node_type == "foundation.python_transform":
        instruction = _config_str(node, "instruction", "")
        inbound = _first_value(inputs)
        compiled = node.configuration.get("compiledCode")
        out_id = node.outputs[0].id if node.outputs else "out-text"
        if isinstance(compiled, str) and compiled.strip():
            sandbox = run_in_sandbox(source_code=compiled, sample_input=inbound)
            if sandbox.status == "passed":
                try:
                    payload = json.loads((sandbox.stdout or "").strip().splitlines()[-1])
                    result = str(payload.get("result", ""))
                    return "ok", {out_id: result}, "Executed compiled transform in Podman sandbox"
                except (json.JSONDecodeError, IndexError, TypeError):
                    return "error", {}, "Sandbox returned unreadable output"
            if sandbox.status == "skipped":
                fallback = _apply_classifier(inbound, instruction)
                return (
                    "ok",
                    {out_id: fallback},
                    f"Sandbox skipped ({sandbox.reason}); used classifier fallback",
                )
            return "error", {}, sandbox.stderr or sandbox.reason or "Sandbox execution failed"
        result = _apply_classifier(inbound, instruction)
        kind = classify_instruction(instruction)
        return "ok", {out_id: result}, f"Classifier transform ({kind})"

    if node_type == "foundation.output_viewer":
        value = _first_value(inputs)
        message = (
            f"Sink received {len(value)} character(s)" if value else "Sink received empty payload"
        )
        return "ok", {}, message

    if node_type == "foundation.portal_output":
        bus_id = _config_str(node, "busId", "")
        value = _first_value(inputs)
        if not bus_id:
            return "error", {}, "Portal Output is missing busId"
        buses[bus_id] = value
        return "ok", {}, f"Published to bus '{bus_id}'"

    if node_type == "foundation.portal_input":
        bus_id = _config_str(node, "busId", "")
        out_id = node.outputs[0].id if node.outputs else "out-text"
        if not bus_id:
            return "error", {}, "Portal Input is missing busId"
        if bus_id not in buses:
            return "error", {}, f"No payload on bus '{bus_id}' yet"
        return "ok", {out_id: buses[bus_id]}, f"Received from bus '{bus_id}'"

    if node_type == "foundation.environment_variable":
        name = _config_str(node, "name", "")
        example = _config_str(node, "exampleValue", "")
        value = os.environ.get(name, example)
        out_id = node.outputs[0].id if node.outputs else "out-value"
        source = "process environment" if name in os.environ else "exampleValue"
        return "ok", {out_id: value}, f"Resolved from {source}"

    if node_type == "foundation.secret_reference":
        secret_name = _config_str(node, "secretName", "secret")
        out_id = node.outputs[0].id if node.outputs else "out-secret"
        return (
            "ok",
            {out_id: f"[redacted:{secret_name}]"},
            "Secret values are never returned by the IDE executor",
        )

    if node_type == "foundation.http_request":
        return (
            "skipped",
            {},
            "HTTP Request is skipped during IDE execution (no host network by default)",
        )

    if node_type.startswith("fine_tuning."):
        return "skipped", {}, "Fine-tuning nodes are lineage-only in the IDE executor"

    if node_type.startswith(("vision.", "multi_agent.", "enterprise.", "big_blocks.")):
        return "skipped", {}, "Category lineage nodes are non-executing in the IDE"

    return "skipped", {}, f"No executor handler for node type '{node_type}'"


def execute_architecture_graph(
    graph: ArchitectureGraph,
    *,
    override_text: str | None = None,
) -> ExecutionResult:
    started = time.perf_counter()
    issues = validate_architecture_graph(graph)
    errors = [issue for issue in issues if issue.severity == "error"]
    if errors:
        return ExecutionResult(
            status="failed",
            durationMs=round((time.perf_counter() - started) * 1000, 3),
            steps=[],
            edgePayloads=[],
            finalOutputs=[],
            validationIssueCount=len(issues),
        )

    nodes_by_id = {node.id: node for node in graph.nodes}
    inbound_edges: dict[str, list[tuple[str, str, str, str]]] = defaultdict(list)
    for edge in graph.edges:
        inbound_edges[edge.target_node_id].append(
            (edge.id, edge.source_node_id, edge.source_port_id, edge.target_port_id)
        )

    order = _topo_sort(graph)
    output_values: dict[str, dict[str, str]] = {}
    buses: dict[str, str] = {}
    steps: list[ExecutionStep] = []
    edge_payloads: list[EdgePayload] = []
    text_override_applied = False

    for node_id in order:
        node = nodes_by_id[node_id]
        step_started = time.perf_counter()
        inputs: dict[str, str] = {}

        for edge_id, source_id, source_port, target_port in inbound_edges.get(node_id, []):
            source_outputs = output_values.get(source_id, {})
            value = source_outputs.get(source_port, "")
            inputs[target_port] = value
            source_node = nodes_by_id[source_id]
            source_port_obj = next(
                (port for port in source_node.outputs if port.id == source_port),
                None,
            )
            edge_payloads.append(
                EdgePayload(
                    edgeId=edge_id,
                    sourceNodeId=source_id,
                    targetNodeId=node_id,
                    value=value,
                    contractType=(
                        source_port_obj.contract_type.value
                        if source_port_obj is not None
                        else "STRING"
                    ),
                )
            )

        text_override: str | None = None
        if (
            override_text is not None
            and not text_override_applied
            and node.type == "foundation.text_input"
            and node_id not in inbound_edges
        ):
            text_override = override_text
            text_override_applied = True

        status, outputs, message = _execute_node(
            node,
            inputs,
            buses=buses,
            text_override=text_override,
        )

        output_values[node_id] = outputs
        steps.append(
            ExecutionStep(
                nodeId=node.id,
                nodeName=node.name,
                nodeType=node.type,
                status=status,
                inputs=inputs,
                outputs=outputs,
                message=message,
                durationMs=round((time.perf_counter() - step_started) * 1000, 3),
            )
        )

    final_outputs = [
        {
            "nodeId": step.node_id,
            "nodeName": step.node_name,
            "value": _first_value(step.inputs),
        }
        for step in steps
        if step.node_type == "foundation.output_viewer" and step.status == "ok"
    ]

    error_count = sum(1 for step in steps if step.status == "error")
    skip_count = sum(1 for step in steps if step.status == "skipped")
    result_status: Literal["success", "partial", "failed"]
    if error_count:
        result_status = "failed" if error_count == len(steps) else "partial"
    elif skip_count:
        result_status = "partial"
    else:
        result_status = "success"

    return ExecutionResult(
        status=result_status,
        durationMs=round((time.perf_counter() - started) * 1000, 3),
        steps=steps,
        edgePayloads=edge_payloads,
        finalOutputs=final_outputs,
        validationIssueCount=len(issues),
    )
