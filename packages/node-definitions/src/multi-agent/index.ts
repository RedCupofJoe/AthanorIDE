/** Multi-agent lineage nodes: agent, tool definition, and MCP server. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const agentDefinition: NodeDefinition = {
  type: "multi_agent.agent",
  displayName: "Agent",
  description: "Defines an agent role with system prompt and model handle.",
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
    "Agent captures role, prompt, and model lineage for multi-agent designs. It does not invoke models inside the IDE.",
};

export const toolDefinitionDefinition: NodeDefinition = {
  type: "multi_agent.tool_definition",
  displayName: "Tool Definition",
  description: "Declares a tool schema agents may call.",
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
      defaultValue: '{\n  "type": "object",\n  "properties": {\n    "query": { "type": "string" }\n  },\n  "required": ["query"]\n}',
    },
  ],
  documentation:
    "Tool Definition documents callable tool contracts. Runtime binding happens outside the IDE.",
};

export const mcpServerDefinition: NodeDefinition = {
  type: "multi_agent.mcp_server",
  displayName: "MCP Server",
  description: "References an MCP server endpoint for tool discovery.",
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
    "MCP Server records endpoint and transport lineage. The IDE does not open network connections to the server.",
};

export const MULTI_AGENT_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  agentDefinition,
  toolDefinitionDefinition,
  mcpServerDefinition,
] as const;
