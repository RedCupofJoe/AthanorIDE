"""Catalog tools shared by the assistant MCP server and the draft loop."""

from __future__ import annotations

from typing import Any

from athanor_api.catalog import AGENT_DEFINITIONS


def catalog_definitions() -> list[dict[str, Any]]:
    raw = AGENT_DEFINITIONS
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def definition_by_type(block_type: str) -> dict[str, Any] | None:
    for item in catalog_definitions():
        if item.get("type") == block_type:
            return item
    return None


def _ports(definition: dict[str, Any], direction: str) -> list[dict[str, Any]]:
    ports = definition.get(direction)
    if not isinstance(ports, list):
        return []
    summarized: list[dict[str, Any]] = []
    for port in ports:
        if not isinstance(port, dict):
            continue
        summarized.append(
            {
                "name": port.get("name"),
                "contractType": port.get("contractType"),
                "required": bool(port.get("required", True)),
            }
        )
    return summarized


def list_blocks() -> list[dict[str, Any]]:
    """Return block summaries. Configuration defaults and secret values are omitted."""

    blocks: list[dict[str, Any]] = []
    for item in catalog_definitions():
        fields = item.get("configurationFields")
        required: list[str] = []
        if isinstance(fields, list):
            required = [
                str(field.get("key"))
                for field in fields
                if isinstance(field, dict) and field.get("required") and field.get("key")
            ]
        blocks.append(
            {
                "type": item.get("type"),
                "displayName": item.get("displayName"),
                "category": item.get("category"),
                "description": item.get("description"),
                "inputs": _ports(item, "inputs"),
                "outputs": _ports(item, "outputs"),
                "requiredConfig": required,
            }
        )
    return blocks


def describe_block(block_type: str) -> dict[str, Any]:
    definition = definition_by_type(block_type)
    if definition is None:
        return {"error": f"Unknown block type: {block_type}"}
    documentation = str(definition.get("documentation") or "")
    fields = definition.get("configurationFields")
    configuration: list[dict[str, Any]] = []
    if isinstance(fields, list):
        for field in fields:
            if not isinstance(field, dict):
                continue
            default = field.get("defaultValue")
            if isinstance(default, str) and len(default) > 240:
                default = default[:240] + "…"
            configuration.append(
                {
                    "key": field.get("key"),
                    "label": field.get("label"),
                    "type": field.get("type"),
                    "required": bool(field.get("required")),
                    "defaultValue": default,
                }
            )
    return {
        "type": definition.get("type"),
        "displayName": definition.get("displayName"),
        "description": definition.get("description"),
        "documentation": documentation[:800],
        "inputs": _ports(definition, "inputs"),
        "outputs": _ports(definition, "outputs"),
        "configurationFields": configuration,
    }


def task_tool_inventory(available: list[dict[str, Any]]) -> dict[str, Any]:
    """List supported adapters and saved integrations, without contacting services."""
    return {
        "adapters": [describe_block(kind) for kind in ("agent.tool", "mcp.client")],
        "configuredTools": available,
        "availability": "Saved configurations are candidates, not verified reachable services. "
        "Reuse their exact configuration when relevant. Missing endpoints require setup. "
        "Sandbox isolation does not itself give the agent file or shell tools.",
    }
