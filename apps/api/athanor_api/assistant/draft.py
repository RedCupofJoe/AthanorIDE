"""Validate and request an engineering draft from a chat-completions endpoint."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from athanor_api.assistant.blocks import definition_by_type, describe_block, list_blocks
from athanor_api.secret_scan import redact_embedded_secrets, text_contains_embedded_secret

ChatPost = Callable[[str, str, dict[str, Any]], dict[str, Any]]

_MAX_NODES = 40
_MAX_ROUNDS = 6


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
                "sourceTaskId": transition.get("sourceTaskId"),
                "targetTaskId": transition.get("targetTaskId"),
                "kind": transition.get("kind"),
                "stage": transition.get("stage"),
            }
        )
    return {"tasks": tasks_out, "transitions": transitions_out}


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
    for text in _string_values(merged):
        if text_contains_embedded_secret(text):
            raise DraftError(["Configuration includes an embedded secret. Use a secret name only."])
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
            }
        )
        contracts[ref] = {
            "inputs": _ports(definition, "inputs"),
            "outputs": _ports(definition, "outputs"),
        }
        task_by_ref[ref] = task_id

    edges: list[dict[str, Any]] = []
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
        edges.append(
            {
                "source": source,
                "sourcePort": source_port,
                "target": target,
                "targetPort": target_port,
            }
        )
    summary = f"Drafted {len(nodes)} components and {len(edges)} connections."
    return {"nodes": nodes, "edges": edges, "summary": summary}


def post_chat(endpoint: str, token: str, body: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(body)
    if token and token in encoded:
        raise AssistantError(500, "Refusing to send the vault token to the model.")
    request = urllib.request.Request(
        endpoint,
        data=encoded.encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
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
                "name": "list_blocks",
                "description": "List canvas blocks, their ports, and required fields.",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "describe_block",
                "description": "Describe one block's ports and configuration fields.",
                "parameters": {
                    "type": "object",
                    "properties": {"block_type": {"type": "string"}},
                    "required": ["block_type"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "submit_draft",
                "description": "Submit the finished architecture. Do not include secret values.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nodes": {"type": "array", "items": {"type": "object"}},
                        "edges": {"type": "array", "items": {"type": "object"}},
                    },
                    "required": ["nodes", "edges"],
                    "additionalProperties": False,
                },
            },
        },
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
    post: ChatPost | None = None,
) -> dict[str, Any]:
    sender = post or post_chat
    safe_workflow = redact_workflow(workflow)
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "Draft an AthanorIDE engineering graph for the supplied SME tasks. "
                "Use list_blocks and describe_block to choose catalog blocks. "
                "Put each component on one task. Connect components only inside that task. "
                "Prefer a model endpoint, a sandbox, and one sandboxed agent or harness per task. "
                "Keep catalog defaults. Secret fields stay empty or name an environment variable. "
                "Finish by calling submit_draft."
            ),
        },
        {"role": "user", "content": json.dumps({"workflow": safe_workflow})},
    ]
    tools = _tool_schema()
    for _round in range(_MAX_ROUNDS):
        message = _message_content(
            sender(
                endpoint,
                token,
                {"model": model, "messages": messages, "tools": tools, "temperature": 0},
            )
        )
        tool_calls = message.get("tool_calls")
        if not isinstance(tool_calls, list) or not tool_calls:
            proposal = _proposal_from_text(str(message.get("content") or ""))
            if proposal is None:
                messages.append({"role": "assistant", "content": message.get("content") or ""})
                messages.append(
                    {"role": "user", "content": "Call submit_draft with the architecture."}
                )
                continue
            try:
                return validate_draft(workflow, proposal)
            except DraftError as exc:
                messages.append({"role": "assistant", "content": message.get("content") or ""})
                messages.append(
                    {"role": "user", "content": "Draft rejected: " + "; ".join(exc.messages)}
                )
            continue
        messages.append(
            {
                "role": "assistant",
                "content": message.get("content") or "",
                "tool_calls": tool_calls,
            }
        )
        for call in tool_calls:
            if not isinstance(call, dict):
                continue
            function = call.get("function")
            if not isinstance(function, dict):
                continue
            name = str(function.get("name") or "")
            arguments = _parse_arguments(function.get("arguments"))
            if name == "submit_draft":
                try:
                    return validate_draft(workflow, arguments)
                except DraftError as exc:
                    result = json.dumps({"error": exc.messages})
            elif name == "list_blocks":
                result = json.dumps(list_blocks())
            elif name == "describe_block":
                result = json.dumps(describe_block(str(arguments.get("block_type") or "")))
            else:
                result = json.dumps({"error": f"Unknown tool {name}"})
            messages.append(
                {"role": "tool", "tool_call_id": str(call.get("id") or name), "content": result}
            )
    raise AssistantError(422, "The model did not return a valid architecture.")
