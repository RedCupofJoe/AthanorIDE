"""Deterministic, design-only external builder handoff."""

from __future__ import annotations

import base64
import json

from athanor_api.exporter.service import ExportError, build_zip_archive
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph


def workflow_documents(graph: ArchitectureGraph) -> dict[str, str]:
    workflow = graph.workflow.model_dump(by_alias=True, exclude_none=True)
    lines = [
        f"# {graph.project.name}: workflow build brief",
        "",
        (
            "Build the task implementations in AthanorIDE graph schema 2.0.0. "
            "Keep task IDs, briefs, stage transitions, and recovery semantics "
            "intact. Return a complete project JSON with a string input/result "
            "binding per task. Models, tools, and sandboxes must be configured "
            "explicitly. Never include credential values. Engineer instruction "
            "replacements must use instructionMode=override."
        ),
        "",
        f"Parallel task limit: {graph.workflow.max_parallel_tasks}",
        "",
        "## Workflow input",
        graph.workflow.input,
        "",
    ]
    for task in sorted(graph.workflow.tasks, key=lambda t: t.id):
        lines += [
            f"## {task.name}",
            f"Task ID: {task.id}",
            "",
            "### Role",
            task.role,
            "",
            "### Expected tasks",
            task.expected_tasks,
            "",
            "### Functional constraints",
            task.constraints,
            "",
        ]
    lines += [
        "## Transitions",
        (
            "Normal labels identify global stages. All tasks in a stage finish or"
            " recover before the next stage starts. Recovery replaces the failed "
            "task result and resumes its normal path. Failures without successful"
            " recovery stop advancement."
        ),
        "",
    ]
    for edge in sorted(graph.workflow.transitions, key=lambda e: (e.stage, e.id)):
        label = ("A" if edge.kind == "recovery" else "") + str(edge.stage)
        lines.append(
            f"- {edge.source_task_id or 'Start'} → {edge.target_task_id}: {label}. "
            f"{edge.recovery_description}"
        )
    return {
        "workflow.json": json.dumps(
            {
                "schemaVersion": "2.0.0",
                "project": graph.project.model_dump(by_alias=True, exclude_none=True),
                "workflow": workflow,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        "build-brief.md": "\n".join(lines) + "\n",
    }


def create_handoff(graph: ArchitectureGraph) -> tuple[dict[str, str], str]:
    issues = validate_architecture_graph(graph, "design")
    if any(i.severity == "error" for i in issues):
        raise ExportError(
            "Resolve SME design and credential findings before handoff.", validation_issues=issues
        )
    files = workflow_documents(graph)
    # The empty implementation scaffold carries the full canonical envelope for the builder.
    scaffold = graph.model_copy(deep=True)
    scaffold.nodes = []
    scaffold.edges = []
    scaffold.macro_blocks = []
    scaffold.portal_buses = []
    scaffold.validation_results = []
    for task in scaffold.workflow.tasks:
        task.input_binding = None
        task.output_binding = None
    files["project-scaffold.json"] = (
        json.dumps(scaffold.model_dump(by_alias=True, exclude_none=True), indent=2, sort_keys=True)
        + "\n"
    )
    return files, base64.b64encode(build_zip_archive(files)).decode("ascii")
