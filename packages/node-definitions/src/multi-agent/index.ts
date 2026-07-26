/** Multi-agent lineage nodes: agent, tool definition, and MCP server. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const agentDefinition: NodeDefinition = {
  type: "multi_agent.agent",
  displayName: "Agent",
  description:
    "Agent defines a role, system prompt, and model handle for multi-agent architectures. Optionally connect PROMPT and one or more TOOL_DEFINITION inputs, then use MODEL_HANDLE and EVENT outputs to show how the agent participates in a larger orchestration. It makes agent responsibilities and model choices reviewable on the canvas.",
  category: "multi-agent",
  version: "1.0.0",
  icon: "bot",
  exportKind: "multi_agent",
  inputs: [
    portTemplate("prompt", "input", "PROMPT", { required: false }),
    portTemplate("tools", "input", "TOOL_DEFINITION", { required: false, multiple: true }),
  ],
  outputs: [
    portTemplate("handle", "output", "MODEL_HANDLE"),
    portTemplate("event", "output", "EVENT"),
  ],
  configurationFields: [
    {
      key: "role",
      label: "Role",
      description: "Short agent role name.",
      type: "string",
      required: true,
      defaultValue: "researcher",
    },
    {
      key: "systemPrompt",
      label: "System prompt",
      description: "Standing instructions for the agent.",
      type: "text",
      required: true,
      defaultValue: "You are a careful research assistant.",
    },
    {
      key: "modelId",
      label: "Model id",
      description: "Underlying chat model identifier.",
      type: "string",
      required: true,
      defaultValue: "openai/gpt-4o-mini",
    },
    {
      key: "temperature",
      label: "Temperature",
      description: "Sampling temperature.",
      type: "number",
      required: true,
      defaultValue: 0.2,
    },
  ],
  documentation:
    "Use Agent when designing multi-role systems—researchers, critics, routers, planners—before committing to a specific harness or runtime. Wire optional PROMPT and TOOL_DEFINITION inputs to show how each role is prompted and which tools it may call. The IDE does not invoke models or run agent loops; export captures role, prompt, model, and tool lineage for review. Prefer Agentic Harness Big Block when you want an opinionated Pi/Goose-style assembly with MCP and companion frameworks instead of composing atomic agent nodes by hand.",
};

export const toolDefinitionDefinition: NodeDefinition = {
  type: "multi_agent.tool_definition",
  displayName: "Tool Definition",
  description:
    "Tool Definition declares a named tool schema agents may call, emitting TOOL_DEFINITION. Author toolName, description, and a JSON Schema for arguments, then connect into Agent tool inputs (multiple allowed). It documents the callable surface of your agent system without implementing the tool body in the IDE.",
  category: "multi-agent",
  version: "1.0.0",
  icon: "wrench",
  exportKind: "multi_agent",
  inputs: [],
  outputs: [portTemplate("tool", "output", "TOOL_DEFINITION")],
  configurationFields: [
    {
      key: "toolName",
      label: "Tool name",
      description: "Stable tool identifier.",
      type: "string",
      required: true,
      defaultValue: "search",
    },
    {
      key: "description",
      label: "Description",
      description: "What the tool does for the agent.",
      type: "text",
      required: true,
      defaultValue: "Search an external knowledge base.",
    },
    {
      key: "inputSchema",
      label: "Input schema",
      description: "JSON Schema for tool arguments.",
      type: "text",
      required: true,
      defaultValue:
        '{\n  "type": "object",\n  "properties": {\n    "query": { "type": "string" }\n  },\n  "required": ["query"]\n}',
    },
  ],
  documentation:
    "Best used whenever agents need structured capabilities—search, ticketing, retrieval—that should be reviewed as contracts. Runtime binding happens outside the IDE; invalid JSON Schema fails validation. Prefer MCP Server when tools are discovered from an external MCP endpoint rather than hand-authored schemas.",
};

export const mcpServerDefinition: NodeDefinition = {
  type: "multi_agent.mcp_server",
  displayName: "MCP Server",
  description:
    "MCP Server references an Model Context Protocol endpoint for tool discovery, emitting MCP_SERVER. Configure server name, endpoint, and transport, then connect into harnesses or agents that consume MCP. It records how the architecture reaches external tool hosts without opening those connections from the IDE.",
  category: "multi-agent",
  version: "1.0.0",
  icon: "server",
  exportKind: "multi_agent",
  inputs: [],
  outputs: [portTemplate("server", "output", "MCP_SERVER")],
  configurationFields: [
    {
      key: "serverName",
      label: "Server name",
      description: "Logical MCP server name.",
      type: "string",
      required: true,
      defaultValue: "filesystem",
    },
    {
      key: "endpoint",
      label: "Endpoint",
      description: "MCP server URL or transport URI.",
      type: "string",
      required: true,
      defaultValue: "http://127.0.0.1:3100",
    },
    {
      key: "transport",
      label: "Transport",
      description: "MCP transport kind.",
      type: "select",
      required: true,
      defaultValue: "http",
      options: ["http", "sse", "stdio"],
    },
  ],
  documentation:
    "Use it when tools live behind MCP (filesystem, browser, SaaS bridges) and should appear as first-class architecture dependencies. The IDE never connects to the server. Prefer Tool Definition for a small number of hand-written tools, and Agentic Harness when MCP is one ingredient of a larger opinionated stack.",
};

export const MULTI_AGENT_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  agentDefinition,
  toolDefinitionDefinition,
  mcpServerDefinition,
] as const;
