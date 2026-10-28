"""Validate and request an engineering draft from a chat-completions endpoint."""

from __future__ import annotations

import json
import math
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from jsonschema.exceptions import SchemaError  # type: ignore[import-untyped]

from athanor_api.assistant.blocks import definition_by_type, task_tool_inventory
from athanor_api.assistant.plans import (
    TASK_PLAN_SCHEMA,
    chain_transitions,
    compile_plan,
    task_context,
    validate_plan,
)
from athanor_api.assistant.prompts import ENGINEERING_SYSTEM_PROMPT
from athanor_api.schemas.tool_arguments import validate_schema
from athanor_api.secret_scan import redact_embedded_secrets, text_contains_embedded_secret

ChatPost = Callable[[str, str, dict[str, Any]], dict[str, Any]]

_MAX_NODES = 80
_MAX_ROUNDS = 3


class AssistantError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class DraftError(Exception):
    def __init__(self, messages: list[str]) -> None:
        super().__init__("; ".join(messages))
        self.messages = messages


def _redact_text(value: str) -> str:
    return redact_embedded_secrets(value)


def redact_workflow(workflow: dict[str, Any]) -> dict[str, Any]:
    tasks_out: list[dict[str, Any]] = []
    for task in workflow.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        tasks_out.append(
            {
                "id": task.get("id"),
                "name": _redact_text(str(task.get("name") or "")),
                "role": _redact_text(str(task.get("role") or "")),
                "expectedTasks": _redact_text(str(task.get("expectedTasks") or "")),
                "constraints": _redact_text(str(task.get("constraints") or "")),
            }
        )
    transitions_out: list[dict[str, Any]] = []
    for transition in workflow.get("transitions") or []:
        if not isinstance(transition, dict):
            continue
        transitions_out.append(
            {
                "id": transition.get("id"),
                "sourceTaskId": transition.get("sourceTaskId"),
                "targetTaskId": transition.get("targetTaskId"),
                "kind": transition.get("kind"),
                "stage": transition.get("stage"),
                "recoveryDescription": _redact_text(
                    str(transition.get("recoveryDescription") or "")
                ),
            }
        )
    available = []
    for item in workflow.get("availableTools") or []:
        if not isinstance(item, dict) or item.get("type") not in {"agent.tool", "mcp.client"}:
            continue
        try:
            definition = definition_by_type(item["type"])
            assert definition is not None
            configuration = _merge_configuration(definition, item.get("configuration"))
        except DraftError:
            continue
        available.append(
            {
                "name": _redact_text(str(item.get("name", item["type"]))),
                "type": item["type"],
                "configuration": configuration,
            }
        )
    return {
        "availableTools": available,
        "tasks": tasks_out,
        "transitions": transitions_out,
        "input": _redact_text(str(workflow.get("input") or "")),
    }


def _string_values(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        found: list[str] = []
        for item in value.values():
            found.extend(_string_values(item))
        return found
    if isinstance(value, list):
        found = []
        for item in value:
            found.extend(_string_values(item))
        return found
    return []


def _ports(definition: dict[str, Any], direction: str) -> dict[str, str]:
    ports = definition.get(direction)
    if not isinstance(ports, list):
        return {}
    named: dict[str, str] = {}
    for port in ports:
        if isinstance(port, dict) and isinstance(port.get("name"), str):
            named[port["name"]] = str(port.get("contractType") or "")
    return named


def _merge_configuration(definition: dict[str, Any], provided: Any) -> dict[str, Any]:
    if provided is None:
        provided = {}
    if not isinstance(provided, dict):
        raise DraftError(["Node configuration must be an object."])
    fields = definition.get("configurationFields")
    known: dict[str, dict[str, Any]] = {}
    if isinstance(fields, list):
        for field in fields:
            if isinstance(field, dict) and isinstance(field.get("key"), str):
                known[field["key"]] = field
    unknown = sorted(set(provided) - set(known))
    if unknown:
        raise DraftError([f"Unknown configuration fields: {', '.join(unknown)}"])
    merged: dict[str, Any] = {}
    for key, field in known.items():
        if key in provided:
            merged[key] = provided[key]
        else:
            merged[key] = field.get("defaultValue")
        if field.get("required") and merged[key] in (None, ""):
            raise DraftError([f"Missing required configuration field {key}."])
        value = merged[key]
        kind = field.get("type")
        if kind == "boolean" and not isinstance(value, bool):
            raise DraftError([f"Configuration field {key} must be a boolean."])
        if kind == "number" and (
            isinstance(value, bool)
            or not isinstance(value, (float, int))
            or not math.isfinite(value)
            or value <= 0
        ):
            raise DraftError([f"Configuration field {key} must be a positive finite number."])
        if kind == "select" and value not in field.get("options", []):
            raise DraftError(
                [f"Configuration field {key} must be one of {field.get('options', [])}."]
            )
        if kind in {"string", "text", "schema"} and not isinstance(value, str):
            raise DraftError([f"Configuration field {key} must be a string."])
    for text in _string_values(merged):
        if text_contains_embedded_secret(text):
            raise DraftError(["Configuration includes an embedded secret. Use a secret name only."])
    if "inputSchema" in merged:
        try:
            validate_schema(merged["inputSchema"])
        except (ValueError, TypeError, SchemaError):
            raise DraftError(["Tool inputSchema must be a valid JSON Schema object."]) from None
    if merged.get("secretName") and not re.fullmatch(
        r"[A-Za-z_][A-Za-z0-9_]*", merged["secretName"]
    ):
        raise DraftError(["secretName must be an environment variable name."])
    return merged


def validate_draft(workflow: dict[str, Any], proposal: dict[str, Any]) -> dict[str, Any]:
    task_ids = {
        str(task.get("id"))
        for task in workflow.get("tasks") or []
        if isinstance(task, dict) and task.get("id")
    }
    raw_nodes = proposal.get("nodes")
    raw_edges = proposal.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        raise DraftError(["Draft must include nodes and edges arrays."])
    if not task_ids or not raw_nodes:
        raise DraftError(["Build at least one complete agent stage for every requested task."])
    if len(raw_nodes) > _MAX_NODES:
        raise DraftError([f"Draft has more than {_MAX_NODES} components."])

    nodes: list[dict[str, Any]] = []
    contracts: dict[str, dict[str, dict[str, str]]] = {}
    task_by_ref: dict[str, str] = {}
    seen_refs: set[str] = set()
    for raw in raw_nodes:
        if not isinstance(raw, dict):
            raise DraftError(["Each node must be an object."])
        ref = str(raw.get("ref") or "")
        block_type = str(raw.get("type") or "")
        task_id = str(raw.get("taskId") or "")
        name = str(raw.get("name") or "").strip()
        if not ref or ref in seen_refs:
            raise DraftError(["Each node needs a unique ref."])
        seen_refs.add(ref)
        if task_id not in task_ids:
            raise DraftError([f"Node {ref} is not assigned to a requested task."])
        definition = definition_by_type(block_type)
        if definition is None:
            raise DraftError([f"Unknown block type: {block_type}"])
        if not name:
            name = str(definition.get("displayName") or block_type)
        configuration = _merge_configuration(definition, raw.get("configuration"))
        nodes.append(
            {
                "ref": ref,
                "taskId": task_id,
                "type": block_type,
                "name": name,
                "configuration": configuration,
                **(
                    {"instructionMode": raw["instructionMode"]}
                    if raw.get("instructionMode") in {"inherit", "override"}
                    else {}
                ),
                **(
                    {"engineeringReport": raw["engineeringReport"]}
                    if isinstance(raw.get("engineeringReport"), dict)
                    else {}
                ),
            }
        )
        contracts[ref] = {
            "inputs": _ports(definition, "inputs"),
            "outputs": _ports(definition, "outputs"),
        }
        task_by_ref[ref] = task_id

    edges: list[dict[str, Any]] = []
    connected_inputs: set[tuple[str, str]] = set()
    for raw in raw_edges:
        if not isinstance(raw, dict):
            raise DraftError(["Each edge must be an object."])
        source = str(raw.get("source") or "")
        target = str(raw.get("target") or "")
        source_port = str(raw.get("sourcePort") or "")
        target_port = str(raw.get("targetPort") or "")
        if source not in contracts or target not in contracts:
            raise DraftError(["Edges must connect nodes in this draft."])
        if task_by_ref[source] != task_by_ref[target]:
            raise DraftError(["Do not wire components across tasks."])
        source_contract = contracts[source]["outputs"].get(source_port)
        target_contract = contracts[target]["inputs"].get(target_port)
        if source_contract is None or target_contract is None:
            raise DraftError(
                [f"Unknown port on edge {source}.{source_port} -> {target}.{target_port}."]
            )
        if source_contract != target_contract and target_contract != "ANY":
            raise DraftError(
                [
                    f"Incompatible ports {source}.{source_port} ({source_contract}) "
                    f"and {target}.{target_port} ({target_contract})."
                ]
            )
        target_node = next(node for node in nodes if node["ref"] == target)
        definition = definition_by_type(target_node["type"])
        assert definition is not None  # All node types were checked above.
        port = next(p for p in definition["inputs"] if p["name"] == target_port)
        if (target, target_port) in connected_inputs and not port.get("multiple"):
            raise DraftError([f"Input {target}.{target_port} accepts only one connection."])
        if target_port == "task" and target_node["type"] == "agent.sandboxed":
            raise DraftError([f"The workflow supplies {target}.task; remove its component wire."])
        connected_inputs.add((target, target_port))
        edges.append(
            {
                "source": source,
                "sourcePort": source_port,
                "target": target,
                "targetPort": target_port,
            }
        )
    for task_id in task_ids:
        agents = [
            n
            for n in nodes
            if n["taskId"] == task_id
            and (n["type"] == "agent.sandboxed" or n["type"].startswith("harness."))
        ]
        if not agents:
            raise DraftError([f"Task {task_id} needs an executable agent, model, and sandbox."])
        for agent in agents:
            definition = definition_by_type(agent["type"])
            assert definition is not None
            for port in definition["inputs"]:
                if (
                    port.get("required")
                    and port["name"] != "task"
                    and (agent["ref"], port["name"]) not in connected_inputs
                ):
                    raise DraftError([f"Connect required input {agent['ref']}.{port['name']}."])
    summary = f"Drafted {len(nodes)} components and {len(edges)} connections."
    return {"nodes": nodes, "edges": edges, "summary": summary}


def post_chat(endpoint: str, token: str, body: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(body)
    if token and token in encoded:
        raise AssistantError(500, "Refusing to send the vault token to the model.")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        endpoint,
        data=encoded.encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        raise AssistantError(502, f"The model endpoint returned HTTP {exc.code}.") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AssistantError(502, "The model endpoint could not be reached.") from exc
    if not isinstance(payload, dict):
        raise AssistantError(502, "The model endpoint returned an unexpected response.")
    return payload


def _tool_schema() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "submit_task_plan",
                "description": "Submit a complete engineering plan for the current task stage.",
                "parameters": TASK_PLAN_SCHEMA,
            },
        }
    ]


def _message_content(response: dict[str, Any]) -> dict[str, Any]:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise AssistantError(502, "The model endpoint returned no choices.")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise AssistantError(502, "The model endpoint returned no message.")
    return message


def _parse_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _proposal_from_text(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?", "", stripped).strip()
        stripped = re.sub(r"```$", "", stripped).strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", stripped, re.DOTALL)
        if match is None:
            return None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None


def generate_draft(
    *,
    endpoint: str,
    model: str,
    workflow: dict[str, Any],
    token: str,
    target_task_ids: list[str] | None = None,
    post: ChatPost | None = None,
) -> dict[str, Any]:
    sender = post or post_chat
    safe_workflow = redact_workflow(workflow)
    tasks = safe_workflow["tasks"]
    ids = [task["id"] for task in tasks]
    if (
        not tasks
        or len(tasks) > 10
        or any(not isinstance(i, str) or not i for i in ids)
        or len(set(ids)) != len(ids)
    ):
        raise DraftError(["Provide 1-10 tasks with unique IDs to build the prompt chain."])
    selected = set(ids if target_task_ids is None else target_task_ids)
    if not selected or selected - set(ids):
        raise DraftError(["Select existing workflow tasks to build."])
    if any(
        not t["role"].strip() or not t["expectedTasks"].strip()
        for t in tasks
        if t["id"] in selected
    ):
        raise DraftError(["Add a role and expected tasks to each selected task."])
    try:
        safe_workflow["transitions"] = chain_transitions(safe_workflow)
    except ValueError as exc:
        raise DraftError([str(exc)]) from exc
    stages = {e["targetTaskId"]: e["stage"] for e in safe_workflow["transitions"]}
    if any(not isinstance(stage, int) or stage < 1 for stage in stages.values()):
        raise DraftError(["Workflow stages must be positive integers."])
    plans: dict[str, dict[str, Any]] = {}
    proposal: dict[str, Any] = {"nodes": [], "edges": []}
    reports = []
    for index, task in enumerate(sorted(tasks, key=lambda t: stages.get(t["id"], 1))):
        if task["id"] not in selected:
            continue
        messages = [
            {"role": "system", "content": ENGINEERING_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(task_context(safe_workflow, task, plans))},
        ]
        # Inventory is supplied deterministically before planning; no model round trip is wasted
        # asking whether to discover tools. The model sees the actual adapter schemas each time.
        messages[1]["content"] = json.dumps(
            {
                **task_context(safe_workflow, task, plans),
                "toolInventory": task_tool_inventory(safe_workflow["availableTools"]),
            }
        )
        errors = ["Call submit_task_plan with all required fields."]
        for attempt in range(_MAX_ROUNDS):
            response = sender(
                endpoint,
                token,
                {
                    "model": model,
                    "messages": messages,
                    "tools": _tool_schema(),
                    "tool_choice": {"type": "function", "function": {"name": "submit_task_plan"}},
                    "temperature": 0.2,
                    "max_tokens": 3072,
                },
            )
            message = _message_content(response)
            calls = message.get("tool_calls")
            plan = None
            if isinstance(calls, list) and len(calls) == 1 and isinstance(calls[0], dict):
                function = calls[0].get("function", {})
                if isinstance(function, dict) and function.get("name") == "submit_task_plan":
                    plan = _parse_arguments(function.get("arguments"))
            elif not calls:
                plan = _proposal_from_text(str(message.get("content") or ""))
            errors = (
                validate_plan(plan, task["id"])
                if plan is not None
                else ["Submit exactly one submit_task_plan call for the current task."]
            )
            if not errors and plan is not None:
                try:
                    part, report = compile_plan(
                        task,
                        plan,
                        index=index,
                        endpoint=endpoint,
                        model=model,
                        authenticated=bool(token),
                        available_tools=safe_workflow["availableTools"],
                    )
                    part = validate_draft({"tasks": [task]}, part)
                except DraftError as exc:
                    errors = exc.messages
                else:
                    proposal["nodes"].extend(part["nodes"])
                    proposal["edges"].extend(part["edges"])
                    reports.append(report)
                    plans[task["id"]] = plan
                    break
            if attempt == _MAX_ROUNDS - 1:
                raise AssistantError(422, f"Could not build {task['name']}: " + "; ".join(errors))
            # Give precise feedback without retaining malformed tool-call protocol messages.
            messages.append(
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "rejectedPlan": (
                                None if text_contains_embedded_secret(json.dumps(plan)) else plan
                            ),
                            "errors": errors,
                            "instruction": "Correct these issues and resubmit the full task plan.",
                        }
                    ),
                }
            )
    result = validate_draft({"tasks": [t for t in tasks if t["id"] in selected]}, proposal)
    result["taskPlans"] = reports
    if not workflow.get("transitions"):
        result["workflowTransitions"] = safe_workflow["transitions"]
    result["summary"] = (
        f"Built {len(reports)} agent stages, {len(result['nodes'])} components, and "
        f"{len(result['edges'])} connections. Review the stage plans and setup requirements."
    )
    return result
