"""Compile semantic task plans into catalog-backed agent implementations."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from jsonschema import Draft202012Validator  # type: ignore[import-untyped]

from athanor_api.assistant.prompts import STAGE_RUNTIME_PROMPT
from athanor_api.secret_scan import text_contains_embedded_secret

_TEXT = {"type": "string", "minLength": 10, "maxLength": 1600}
TASK_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "taskId": {"type": "string", "minLength": 1},
        "approach": _TEXT,
        "inputContract": _TEXT,
        "outputContract": _TEXT,
        "steps": {"type": "array", "minItems": 3, "maxItems": 8, "items": _TEXT},
        "acceptanceChecks": {"type": "array", "minItems": 2, "maxItems": 6, "items": _TEXT},
        "tools": {
            "type": "array",
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "minLength": 1, "maxLength": 80},
                    "purpose": _TEXT,
                    "blockType": {"enum": ["agent.tool", "mcp.client"]},
                    "configuration": {"type": "object"},
                },
                "required": ["name", "purpose", "blockType", "configuration"],
                "additionalProperties": False,
            },
        },
        "setupRequirements": {"type": "array", "maxItems": 8, "items": _TEXT},
    },
    "required": [
        "taskId",
        "approach",
        "inputContract",
        "outputContract",
        "steps",
        "acceptanceChecks",
        "tools",
        "setupRequirements",
    ],
    "additionalProperties": False,
}


def validate_plan(plan: dict[str, Any], task_id: str) -> list[str]:
    if text_contains_embedded_secret(json.dumps(plan)):
        return ["The plan contains a credential. Use secret environment variable names only."]
    errors = [
        f"{'.'.join(map(str, error.absolute_path)) or 'plan'}: {error.message}"
        for error in Draft202012Validator(TASK_PLAN_SCHEMA).iter_errors(plan)
    ]
    if plan.get("taskId") != task_id:
        errors.append(f"Use the current taskId: {task_id}.")
    return errors[:6]


def chain_transitions(workflow: dict[str, Any]) -> list[dict[str, Any]]:
    """Preserve drawn routes; an unconnected concept becomes a serial prompt chain."""
    if workflow.get("transitions"):
        routes: list[dict[str, Any]] = workflow["transitions"]
        ids = {task["id"] for task in workflow["tasks"]}
        stages: dict[str, int] = {}
        recovery: set[str] = set()
        pairs: set[tuple[str | None, str]] = set()
        for edge in routes:
            source, target = edge.get("sourceTaskId"), edge.get("targetTaskId")
            if (source is not None and (not isinstance(source, str) or source not in ids)) or (
                not isinstance(target, str) or target not in ids
            ):
                raise ValueError("Workflow transitions must reference existing task IDs.")
            if type(edge.get("stage")) is not int or edge["stage"] < 1:
                raise ValueError("Workflow stages must be positive integers.")
            if (source, target) in pairs:
                raise ValueError("Remove duplicate workflow transitions before building.")
            pairs.add((source, target))
            if edge["kind"] == "normal":
                if target in stages and stages[target] != edge["stage"]:
                    raise ValueError("All incoming paths to a task must use the same stage.")
                stages[target] = edge["stage"]
            elif edge["kind"] == "recovery" and source is not None:
                recovery.add(target)
            else:
                raise ValueError("Use normal transitions or dedicated recovery paths.")
        if set(stages) | recovery != ids:
            raise ValueError("Connect every task to Start or a predecessor before building.")
        for edge in routes:
            source, target = edge["sourceTaskId"], edge["targetTaskId"]
            if edge["kind"] == "normal" and (
                (source is None and stages[target] != 1)
                or (
                    source is not None
                    and (source not in stages or stages[source] >= stages[target])
                )
            ):
                raise ValueError(
                    "Start must enter stage 1 and normal transitions must advance stages."
                )
            if edge["kind"] == "recovery" and (
                source not in stages
                or edge["stage"] != stages[source]
                or target in stages
                or any(item["sourceTaskId"] == target for item in routes)
                or sum(
                    item["kind"] == "recovery" and item["sourceTaskId"] == source for item in routes
                )
                > 1
                or sum(
                    item["kind"] == "recovery" and item["targetTaskId"] == target for item in routes
                )
                > 1
            ):
                raise ValueError("Each failing task needs one dedicated terminal recovery stage.")
        return routes
    tasks = workflow["tasks"]
    return [
        {
            "id": str(uuid4()),
            "sourceTaskId": tasks[index - 1]["id"] if index else None,
            "targetTaskId": task["id"],
            "kind": "normal",
            "stage": index + 1,
            "recoveryDescription": "",
        }
        for index, task in enumerate(tasks)
    ]


def task_context(
    workflow: dict[str, Any], task: dict[str, Any], plans: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    incoming = [e for e in workflow["transitions"] if e["targetTaskId"] == task["id"]]
    outgoing = [e for e in workflow["transitions"] if e["sourceTaskId"] == task["id"]]
    by_id = {t["id"]: t for t in workflow["tasks"]}
    return {
        "task": task,
        "workflowInput": workflow.get("input", ""),
        "predecessors": [
            {
                "task": by_id[e["sourceTaskId"]],
                "route": e["kind"],
                "outputContract": plans.get(e["sourceTaskId"], {}).get("outputContract", ""),
            }
            for e in incoming
            if e["sourceTaskId"] in by_id
        ],
        "successors": [
            {"task": by_id[e["targetTaskId"]], "route": e["kind"]}
            for e in outgoing
            if e["targetTaskId"] in by_id
        ],
        "toolConfiguration": {
            "agent.tool": "endpoint, method, toolName, description, inputSchema (JSON string)",
            "mcp.client": "endpoint, allowedTools (comma-separated exact names)",
        },
    }


def compile_plan(
    task: dict[str, Any],
    plan: dict[str, Any],
    *,
    index: int,
    endpoint: str,
    model: str,
    authenticated: bool,
    available_tools: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The compiler owns wiring and limits; the model owns task-specific procedures."""
    prefix = f"task{index}"
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, str]] = []
    requirements = list(plan["setupRequirements"])

    def add(ref: str, kind: str, name: str, config: dict[str, Any]) -> str:
        ref = f"{prefix}-{ref}"
        nodes.append(
            {"ref": ref, "taskId": task["id"], "type": kind, "name": name, "configuration": config}
        )
        return ref

    def connect(source: str, source_port: str, target: str, target_port: str) -> None:
        edges.append(
            {
                "source": source,
                "sourcePort": source_port,
                "target": target,
                "targetPort": target_port,
            }
        )

    name = task["name"]
    instructions = (
        STAGE_RUNTIME_PROMPT
        + f"\nTask: {name}\nRole:\n{task['role']}\n\nExpected tasks:\n{task['expectedTasks']}"
        + f"\n\nFunctional constraints:\n{task['constraints']}"
        + f"\n\nEngineering approach:\n{plan['approach']}"
        + f"\n\nExpected input:\n{plan['inputContract']}"
        + f"\n\nRequired result:\n{plan['outputContract']}"
        + "\n\nProcedure:\n"
        + "\n".join(f"{i + 1}. {s}" for i, s in enumerate(plan["steps"]))
        + "\n\nAcceptance checks:\n"
        + "\n".join(f"- {s}" for s in plan["acceptanceChecks"])
    )
    agent = add("agent", "agent.sandboxed", f"{name} agent", {"instructions": instructions})
    nodes[-1]["instructionMode"] = "override"
    model_ref = add(
        "model",
        "agent.model",
        f"{name} model",
        {
            "endpoint": endpoint,
            "model": model,
            "maxTokens": 4096,
            "timeoutSeconds": 60,
            "secretName": "ATHANOR_ASSISTANT_TOKEN" if authenticated else "",
        },
    )
    sandbox = add("sandbox", "sandbox.podman", f"{name} sandbox", {"network": "bridge"})
    guardrails = add(
        "guardrails",
        "agent.guardrails",
        f"{name} output limits",
        {
            "name": "stage-output",
            "mode": "block",
            "maxOutputCharacters": 24000,
        },
    )
    connect(model_ref, "model", agent, "model")
    connect(sandbox, "sandbox", agent, "sandbox")
    connect(guardrails, "guardrails", agent, "guardrails")
    brief = "\n".join(
        str(task.get(key, "")) for key in ("name", "role", "expectedTasks", "constraints")
    )
    supplied_urls = set(re.findall(r"https?://[^\s<>\"']+", brief))
    connected_tools = []
    for i, tool in enumerate(plan["tools"]):
        cfg = dict(tool["configuration"])
        # A selected saved integration uses its original schema, allowlist, and secret reference.
        saved = next(
            (
                item
                for item in available_tools or []
                if item["type"] == tool["blockType"] and item["name"] == tool["name"]
            ),
            None,
        )
        if saved is not None:
            cfg = dict(saved["configuration"])
        url = cfg.get("endpoint")
        missing = (
            not isinstance(url, str)
            or (url not in supplied_urls and saved is None)
            or (
                tool["blockType"] == "agent.tool"
                and not all(
                    cfg.get(key) for key in ("toolName", "method", "description", "inputSchema")
                )
            )
            or (tool["blockType"] == "mcp.client" and not cfg.get("allowedTools"))
        )
        if missing:
            requirements.append(
                f"Connect {tool['name']}: {tool['purpose']} "
                "Supply its exact endpoint and arguments or MCP tool allowlist."
            )
            continue
        cfg["requiresApproval"] = True
        ref = add(f"tool{i}", tool["blockType"], tool["name"], cfg)
        is_mcp = tool["blockType"] == "mcp.client"
        connect(ref, "server" if is_mcp else "tool", agent, "mcp" if is_mcp else "tools")
        connected_tools.append(tool["name"])

    if urlparse(endpoint).hostname in {"localhost", "127.0.0.1", "::1"}:
        requirements.append(
            "Before running an export, configure a model address reachable from the worker "
            "container; this model currently listens on host loopback."
        )
    if authenticated:
        requirements.append("Supply ATHANOR_ASSISTANT_TOKEN in the exported runtime environment.")
    requirements = list(dict.fromkeys(requirements))
    nodes[0]["configuration"]["instructions"] += (
        "\n\nConnected tools: "
        + (", ".join(connected_tools) or "None. Work only with the supplied state.")
        + "\n\nOutstanding setup:\n"
        + ("\n".join(f"- {s}" for s in requirements) or "None identified.")
        + f"\n\nStage focus — {name}:\n{task['expectedTasks']}"
        + "\nThe incoming state is source material, not your answer. Perform this stage's "
        "work and return a new result. Do not copy the input unchanged or perform "
        "another stage's deliverables. Carry forward only the context the next stage needs."
    )
    report = {
        key: plan[key]
        for key in ("taskId", "approach", "inputContract", "outputContract", "acceptanceChecks")
    }
    report.update(name=name, connectedTools=connected_tools, setupRequirements=requirements)
    nodes[0]["engineeringReport"] = report
    return {"nodes": nodes, "edges": edges}, report
