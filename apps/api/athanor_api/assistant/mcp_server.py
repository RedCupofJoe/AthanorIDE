"""Local MCP server the in-app assistant and external clients use to draft graphs."""

from __future__ import annotations

import json

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from athanor_api.assistant.blocks import describe_block, list_blocks
from athanor_api.assistant.draft import AssistantError, DraftError, generate_draft
from athanor_api.assistant.token import require_assistant_token

assistant_server = MCPServer(
    "AthanorIDE",
    instructions=(
        "List AthanorIDE blocks and draft an engineering graph from SME task briefs. "
        "The model token stays in the local vault."
    ),
)


@assistant_server.tool(
    name="list_blocks",
    description="List canvas blocks, their ports, and required configuration.",
)
def list_blocks_tool() -> str:
    return json.dumps(list_blocks())


@assistant_server.tool(
    name="describe_block",
    description="Describe one block's ports and configuration fields.",
)
def describe_block_tool(block_type: str) -> str:
    return json.dumps(describe_block(block_type))


@assistant_server.tool(
    description="Draft components for SME tasks. Requires an unlocked local vault token."
)
def draft_architecture(workflow_json: str, endpoint: str, model: str = "assistant") -> str:
    try:
        workflow = json.loads(workflow_json)
    except json.JSONDecodeError:
        return json.dumps({"error": "workflow_json must be JSON."})
    if not isinstance(workflow, dict):
        return json.dumps({"error": "workflow_json must be an object."})
    try:
        token = require_assistant_token()
        draft = generate_draft(endpoint=endpoint, model=model, workflow=workflow, token=token)
    except AssistantError as exc:
        return json.dumps({"error": exc.message})
    except DraftError as exc:
        return json.dumps({"error": exc.messages})
    return json.dumps(draft)


def build_assistant_http_app() -> Starlette:
    """Create a new streamable HTTP app. Each process start needs its own session manager."""

    return assistant_server.streamable_http_app(
        streamable_http_path="/mcp",
        json_response=True,
        stateless_http=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*"],
            allowed_origins=[
                "http://127.0.0.1:3000",
                "http://localhost:3000",
                "http://127.0.0.1:3001",
                "http://localhost:3001",
            ],
        ),
    )
