"""Workflow design, implementation boundaries, and security review findings."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any, Literal

from athanor_api.catalog import AGENT_DEFINITIONS_BY_TYPE
from athanor_api.schemas.graph import ArchitectureGraph, ValidationIssue, WorkflowTask
from athanor_api.secret_scan import text_contains_embedded_secret


def is_executable(kind: str) -> bool:
    return kind == "agent.sandboxed" or kind.startswith("harness.")


def task_instructions(task: WorkflowTask) -> str:
    return (
        f"Role:\n{task.role}\n\nExpected tasks:\n{task.expected_tasks}"
        f"\n\nFunctional constraints:\n{task.constraints}"
    )


def effective_graph(graph: ArchitectureGraph) -> ArchitectureGraph:
    """Resolve current SME briefs without mutating persisted engineering overrides."""
    resolved = graph.model_copy(deep=True)
    tasks = {t.id: t for t in graph.workflow.tasks}
    for node in resolved.nodes:
        if (
            node.type == "agent.sandboxed"
            and node.workflow_task_id in tasks
            and node.instruction_mode != "override"
        ):
            node.configuration["instructions"] = task_instructions(tasks[node.workflow_task_id])
    return resolved


def validate_workflow(
    graph: ArchitectureGraph, profile: Literal["design", "deployment"] = "deployment"
) -> list[ValidationIssue]:
    findings: list[ValidationIssue] = []

    def issue(
        code: str,
        message: str,
        *,
        task: str | None = None,
        transition: str | None = None,
        node: str | None = None,
        port: str | None = None,
        severity: Literal["error", "warning", "info"] = "error",
    ) -> None:
        findings.append(
            ValidationIssue(
                id=f"{code}:{len(findings)}",
                code=code,
                message=message,
                severity=severity,
                taskId=task,
                transitionId=transition,
                nodeId=node,
                portId=port,
            )
        )

    workflow = graph.workflow
    tasks = {t.id: t for t in workflow.tasks}
    transitions = workflow.transitions
    nodes = {n.id: n for n in graph.nodes}
    for ids, code in [
        ([t.id for t in workflow.tasks], "WORKFLOW_DUPLICATE_TASK"),
        ([e.id for e in transitions], "WORKFLOW_DUPLICATE_TRANSITION"),
    ]:
        if len(set(ids)) != len(ids):
            issue(code, "Workflow identifiers must be unique.")
    if not tasks and (any(is_executable(n.type) for n in graph.nodes) or profile == "design"):
        issue("WORKFLOW_EMPTY", "Add a workflow task and connect it to Start.")
    for task in tasks.values():
        if not all(
            s.strip() for s in [task.name, task.role, task.expected_tasks, task.constraints]
        ):
            issue(
                "WORKFLOW_INCOMPLETE_BRIEF",
                "Define the task name, role, expected tasks, and constraints.",
                task=task.id,
            )
    normal = [e for e in transitions if e.kind == "normal"]
    recoveries = [e for e in transitions if e.kind == "recovery"]
    stages: dict[str, int] = {}
    for task_id in tasks:
        incoming = [e.stage for e in normal if e.target_task_id == task_id]
        if incoming:
            stages[task_id] = incoming[0]
            if len(set(incoming)) > 1:
                issue(
                    "WORKFLOW_STAGE_CONFLICT",
                    "All incoming normal transitions must use the same stage.",
                    task=task_id,
                )
        elif not any(e.target_task_id == task_id for e in recoveries):
            issue(
                "WORKFLOW_UNREACHABLE",
                "Connect this task from Start or an earlier task.",
                task=task_id,
            )
    seen: set[tuple[str | None, str, str]] = set()
    recovery_targets = Counter(e.target_task_id for e in recoveries)
    recovery_sources = Counter(e.source_task_id for e in recoveries)
    for edge in transitions:
        key = (edge.source_task_id, edge.target_task_id, edge.kind)
        if key in seen:
            issue(
                "WORKFLOW_DUPLICATE_PATH",
                "Remove the duplicate workflow connection.",
                transition=edge.id,
            )
        seen.add(key)
        if edge.target_task_id not in tasks or (
            edge.source_task_id is not None and edge.source_task_id not in tasks
        ):
            issue(
                "WORKFLOW_MISSING_TASK",
                "A transition references a missing task.",
                transition=edge.id,
            )
            continue
        if edge.kind == "normal":
            if edge.source_task_id is None:
                if edge.stage != 1:
                    issue(
                        "WORKFLOW_START_STAGE",
                        "Start connects only to stage 1.",
                        transition=edge.id,
                    )
            elif edge.source_task_id not in stages or stages[edge.source_task_id] >= edge.stage:
                issue(
                    "WORKFLOW_STAGE_ORDER",
                    "Normal transitions must advance from a normal task to a later stage.",
                    transition=edge.id,
                )
        else:
            if (
                edge.source_task_id not in stages
                or stages.get(edge.source_task_id or "") != edge.stage
            ):
                issue(
                    "WORKFLOW_RECOVERY_STAGE",
                    "A recovery label must match its source task's normal stage.",
                    transition=edge.id,
                )
            if (
                edge.target_task_id in stages
                or recovery_sources[edge.source_task_id] > 1
                or recovery_targets[edge.target_task_id] > 1
            ):
                issue(
                    "WORKFLOW_RECOVERY_CONFLICT",
                    (
                        "Use one dedicated recovery task per normal task; recovery tasks "
                        "cannot also run normally."
                    ),
                    transition=edge.id,
                )
            if any(e.source_task_id == edge.target_task_id for e in transitions):
                issue(
                    "WORKFLOW_RECOVERY_TERMINAL",
                    (
                        "Recovery returns its result to the failed task; it cannot have "
                        "outgoing transitions."
                    ),
                    transition=edge.id,
                )
            if not edge.recovery_description.strip():
                issue(
                    "WORKFLOW_RECOVERY_DESCRIPTION",
                    "Describe the intended recovery behavior.",
                    transition=edge.id,
                )
    if profile == "design":
        return findings

    for node in graph.nodes:
        if node.workflow_task_id and node.workflow_task_id not in tasks:
            issue(
                "WORKFLOW_UNKNOWN_MEMBERSHIP",
                "Assign the component to an existing task.",
                node=node.id,
            )
        if is_executable(node.type) and node.workflow_task_id not in tasks:
            issue(
                "WORKFLOW_UNASSIGNED_AGENT",
                "Assign this executable component to a workflow task.",
                node=node.id,
            )
        if (
            node.workflow_task_id
            and is_executable(node.type)
            and node.instruction_mode == "override"
        ):
            issue(
                "SECURITY_INSTRUCTION_OVERRIDE",
                "Engineering instructions replace the SME brief. Review the comparison.",
                task=node.workflow_task_id,
                node=node.id,
                severity="warning",
            )
        if (
            node.instruction_mode == "override"
            and is_executable(node.type)
            and not str(node.configuration.get("instructions", "")).strip()
        ):
            issue(
                "WORKFLOW_EMPTY_OVERRIDE",
                "Provide replacement instructions or restore SME inheritance.",
                node=node.id,
            )
        if not any(
            e.source_node_id == node.id or e.target_node_id == node.id for e in graph.edges
        ) and not any(
            b and b.node_id == node.id
            for t in tasks.values()
            for b in (t.input_binding, t.output_binding)
        ):
            issue(
                "SECURITY_DISCONNECTED_COMPONENT",
                "This component has no connections.",
                node=node.id,
                severity="info",
            )
        for direction in ("inputs", "outputs"):
            for port in getattr(node, direction):
                linked = any(
                    (e.target_node_id == node.id and e.target_port_id == port.id)
                    if direction == "inputs"
                    else (e.source_node_id == node.id and e.source_port_id == port.id)
                    for e in graph.edges
                )
                boundary = any(
                    b and b.node_id == node.id and b.port_id == port.id
                    for t in tasks.values()
                    for b in (t.input_binding, t.output_binding)
                )
                if not linked and not boundary:
                    issue(
                        "SECURITY_UNUSED_PORT",
                        "Unused connection point; required ports are retained during pruning."
                        if port.required
                        else "Unused optional connection point can be pruned.",
                        node=node.id,
                        port=port.id,
                        severity="info",
                    )
        if node.pruned_ports and node.type not in AGENT_DEFINITIONS_BY_TYPE:
            issue(
                "INVALID_PRUNING",
                "Optional-port pruning requires an executable catalog definition.",
                node=node.id,
            )

    for task in tasks.values():
        members = {n.id for n in graph.nodes if n.workflow_task_id == task.id}
        if not any(is_executable(nodes[n].type) for n in members):
            issue(
                "WORKFLOW_NO_AGENT",
                "Configure at least one agent or harness inside this task.",
                task=task.id,
            )
        for direction, binding in [
            ("inputs", task.input_binding),
            ("outputs", task.output_binding),
        ]:
            if not binding or binding.node_id not in members:
                issue(
                    "WORKFLOW_BOUNDARY",
                    "Choose an input and a result boundary on components assigned to this task.",
                    task=task.id,
                )
                continue
            node = nodes[binding.node_id]
            port = next((p for p in getattr(node, direction) if p.id == binding.port_id), None)
            if not port or port.contract_type.value != "STRING":
                issue(
                    "WORKFLOW_BOUNDARY_TYPE",
                    "Task boundaries must reference existing string ports.",
                    task=task.id,
                    node=node.id,
                    port=binding.port_id,
                )
            if direction == "inputs" and any(
                e.target_node_id == node.id and e.target_port_id == binding.port_id
                for e in graph.edges
            ):
                issue(
                    "WORKFLOW_BOUNDARY_WIRED",
                    "The workflow supplies this input. Remove its component wire.",
                    task=task.id,
                    node=node.id,
                    port=binding.port_id,
                )
        if task.output_binding:
            ancestors = {task.output_binding.node_id}
            while True:
                previous = set(ancestors)
                ancestors.update(
                    e.source_node_id for e in graph.edges if e.target_node_id in previous
                )
                if previous == ancestors:
                    break
            if task.input_binding and task.input_binding.node_id not in ancestors:
                issue(
                    "WORKFLOW_INPUT_UNREACHABLE",
                    "Connect the task input boundary through to its result.",
                    task=task.id,
                )
            for member in members - ancestors:
                if is_executable(nodes[member].type):
                    issue(
                        "WORKFLOW_UNUSED_AGENT",
                        "Connect this agent to the task result or remove its task assignment.",
                        task=task.id,
                        node=member,
                    )
    for component_edge in graph.edges:
        source, target = (
            nodes.get(component_edge.source_node_id),
            nodes.get(component_edge.target_node_id),
        )
        if not source or not target:
            continue
        if (
            source.workflow_task_id != target.workflow_task_id
            and source.workflow_task_id
            and (
                is_executable(source.type)
                or any(
                    p.id == component_edge.source_port_id
                    and p.contract_type.value in {"STRING", "PROMPT", "EVENT"}
                    for p in source.outputs
                )
            )
        ):
            issue(
                "WORKFLOW_CROSS_TASK_WIRE",
                "Use workflow transitions to pass task results across task boundaries.",
                node=target.id,
            )
    return findings


def security_findings(graph: ArchitectureGraph) -> list[ValidationIssue]:
    """Scan all exportable content recursively; never return matched values."""
    findings: list[ValidationIssue] = []
    sensitive = re.compile(
        r"^(api[_-]?key|client[_-]?secret|password|access[_-]?token|private[_-]?key|authorization|secretValue)$",
        re.I,
    )

    def visit(
        value: Any, path: str, node: str | None = None, task: str | None = None, key: str = ""
    ) -> None:
        if isinstance(value, dict):
            for name, child in value.items():
                visit(child, f"{path}.{name}", node, task, name)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                child_node = (
                    child.get("id") if path == "nodes" and isinstance(child, dict) else node
                )
                child_task = (
                    child.get("id")
                    if path == "workflow.tasks" and isinstance(child, dict)
                    else task
                )
                visit(child, f"{path}[{i}]", child_node, child_task, key)
        elif isinstance(value, str) and value.strip():
            reference = bool(re.fullmatch(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}", value))
            if text_contains_embedded_secret(value) or (
                sensitive.fullmatch(key) and not reference and value != "[REDACTED]"
            ):
                findings.append(
                    ValidationIssue(
                        id=f"SECURITY_EMBEDDED_CREDENTIAL:{len(findings)}",
                        severity="error",
                        code="SECURITY_EMBEDDED_CREDENTIAL",
                        message=(
                            "Possible embedded credential. Replace it with an environment or "
                            "vault reference."
                        ),
                        nodeId=node,
                        taskId=task,
                        fieldPath=path,
                    )
                )

    for key, value in graph.model_dump(by_alias=True, exclude_none=True).items():
        visit(value, key)
    return findings
