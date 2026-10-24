/**
 * Starter graphs for sandboxed agents, MCP servers, and harness endpoints.
 */
import {
  createEmptyGraph,
  newId,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
} from "@athanor/contracts";
import { createWorkflowTask, isExecutable } from "./workflow";
import { createNodeFromDefinition } from "@athanor/node-definitions";

export type ExampleProjectDefinition = {
  id: string;
  name: string;
  description: string;
  build: () => ArchitectureGraph;
};

function edge(
  id: string,
  source: ArchitectureNode,
  sourcePortName: string,
  target: ArchitectureNode,
  targetPortName: string,
): ArchitectureEdge {
  const sourcePort = source.outputs.find((port) => port.name === sourcePortName);
  const targetPort = target.inputs.find((port) => port.name === targetPortName);
  if (!sourcePort || !targetPort) {
    throw new Error(`Missing ports for edge ${id}`);
  }
  return {
    id,
    sourceNodeId: source.id,
    sourcePortId: sourcePort.id,
    targetNodeId: target.id,
    targetPortId: targetPort.id,
  };
}

function stampProject(
  name: string,
  description: string,
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
): ArchitectureGraph {
  const graph = createEmptyGraph(name);
  const agent = nodes.find(n => isExecutable(n.type));
  if (agent) {
    const task = createWorkflowTask();
    task.name = name; task.role = "Task specialist"; task.expectedTasks = description;
    task.constraints = "Use only configured capabilities. Respect the connected guardrails, approvals, and execution limits.";
    task.engineeringBounds = { x: -30, y: -60, width: 1400, height: 1000 };
    task.inputBinding = { nodeId: agent.id, portId: agent.inputs.find(p => p.name === "task")!.id };
    task.outputBinding = { nodeId: agent.id, portId: agent.outputs.find(p => p.name === "result")!.id };
    const source = nodes.find(n => n.type === "foundation.text_input");
    graph.workflow.input = String(source?.configuration.value ?? "");
    nodes = nodes.filter(n => n.id !== source?.id).map(n => ({ ...n, workflowTaskId: task.id, ...(isExecutable(n.type) ? { instructionMode: "inherit" as const } : {}) }));
    edges = edges.filter(e => e.sourceNodeId !== source?.id);
    graph.workflow.tasks = [task];
    graph.workflow.transitions = [{ id: newId(), sourceTaskId: null, targetTaskId: task.id, kind: "normal", stage: 1, recoveryDescription: "" }];
  }
  return {
    ...graph,
    project: {
      ...graph.project,
      description,
    },
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function buildSandboxedAgent(): ArchitectureGraph {
  const task = createNodeFromDefinition("foundation.text_input", { x: 20, y: 40 }, { name: "Task", configuration: { value: "Look up the documentation for this product and summarize it." } });
  const model = createNodeFromDefinition("agent.model", { x: 20, y: 240 });
  const sandbox = createNodeFromDefinition("sandbox.podman", { x: 20, y: 440 });
  const tool = createNodeFromDefinition("agent.tool", { x: 360, y: 420 });
  const agent = createNodeFromDefinition("agent.sandboxed", { x: 700, y: 80 });
  const output = createNodeFromDefinition("foundation.output_viewer", { x: 1060, y: 80 });
  return stampProject("Sandboxed agent", "A bounded agent with an API tool and rootless container isolation. Configure endpoints, model ID, and network access before live use.", [task, model, sandbox, tool, agent, output], [
    edge("task-agent", task, "text", agent, "task"), edge("model-agent", model, "model", agent, "model"),
    edge("sandbox-agent", sandbox, "sandbox", agent, "sandbox"), edge("tool-agent", tool, "tool", agent, "tools"),
    edge("agent-output", agent, "result", output, "text"),
  ]);
}

function buildMcpServer(): ArchitectureGraph {
  const tool = createNodeFromDefinition("agent.tool", { x: 20, y: 20 });
  const resource = createNodeFromDefinition("mcp.resource", { x: 20, y: 240 });
  const prompt = createNodeFromDefinition("mcp.prompt", { x: 360, y: 420 });
  const sandbox = createNodeFromDefinition("sandbox.podman", { x: 360, y: 640 });
  const server = createNodeFromDefinition("mcp.server", { x: 720, y: 120 });
  return stampProject("MCP server", "Expose an API tool, resource, and prompt with the official MCP SDK. Local stdio transport is the default.", [tool, resource, prompt, sandbox, server], [
    edge("tool-server", tool, "tool", server, "tools"), edge("resource-server", resource, "resource", server, "resources"),
    edge("prompt-server", prompt, "prompt", server, "prompts"), edge("sandbox-server", sandbox, "sandbox", server, "sandbox"),
  ]);
}

function buildHarness(): ArchitectureGraph {
  const task = createNodeFromDefinition("foundation.text_input", { x: 20, y: 60 }, { name: "Task", configuration: { value: "Research this question using the deployed harness." } });
  const sandbox = createNodeFromDefinition("sandbox.podman", { x: 20, y: 320 });
  const harness = createNodeFromDefinition("harness.langgraph", { x: 380, y: 60 });
  const output = createNodeFromDefinition("foundation.output_viewer", { x: 740, y: 60 });
  return stampProject("Agent harness", "Connect a deployed harness through a configurable request/response endpoint. Swap in one of five framework adapters.", [task, sandbox, harness, output], [
    edge("task-harness", task, "text", harness, "task"), edge("sandbox-harness", sandbox, "sandbox", harness, "sandbox"),
    edge("harness-output", harness, "result", output, "text"),
  ]);
}


function buildParallelWorkflow(): ArchitectureGraph {
  const graph = createEmptyGraph("Parallel research with recovery");
  const labels = ["Research evidence", "Check requirements", "Combine findings", "Recover research"];
  for (let i = 0; i < labels.length; i++) {
    const part = buildSandboxedAgent();
    const task = part.workflow.tasks[0]!;
    task.color = createWorkflowTask(i).color;
    task.name = labels[i]!; task.expectedTasks = labels[i]!;
    task.bounds = { x: i < 2 ? 260 : 720, y: i === 1 || i === 3 ? 460 : 60, width: 320, height: 340 };
    task.engineeringBounds = { ...task.engineeringBounds, x: i * 1500 - 30 };
    graph.workflow.tasks.push(task);
    graph.nodes.push(...part.nodes.map(n => ({ ...n, position: { x: n.position.x + i * 1500, y: n.position.y } })));
    graph.edges.push(...part.edges.map(e => ({ ...e, id: newId() })));
  }
  const [a, b, join, recover] = graph.workflow.tasks;
  graph.workflow.input = "Research the requested topic and produce a grounded recommendation.";
  graph.workflow.transitions = [
    { id: newId(), sourceTaskId: null, targetTaskId: a!.id, kind: "normal", stage: 1, recoveryDescription: "" },
    { id: newId(), sourceTaskId: null, targetTaskId: b!.id, kind: "normal", stage: 1, recoveryDescription: "" },
    { id: newId(), sourceTaskId: a!.id, targetTaskId: join!.id, kind: "normal", stage: 2, recoveryDescription: "" },
    { id: newId(), sourceTaskId: b!.id, targetTaskId: join!.id, kind: "normal", stage: 2, recoveryDescription: "" },
    { id: newId(), sourceTaskId: a!.id, targetTaskId: recover!.id, kind: "recovery", stage: 1, recoveryDescription: "Return a bounded alternative result using the original input and failure category." },
  ];
  return graph;
}

export const EXAMPLE_PROJECTS: readonly ExampleProjectDefinition[] = [
  { id: "parallel-workflow", name: "Parallel workflow + recovery", description: "Two parallel tasks, a joined result, and an A1 recovery route.", build: buildParallelWorkflow },
  { id: "sandboxed-agent", name: "Sandboxed agent", description: "Task → model + approved API tools → isolated agent → result.", build: buildSandboxedAgent },
  { id: "mcp-server", name: "MCP server", description: "API tools, resources, and prompts → sandboxed MCP server.", build: buildMcpServer },
  { id: "agent-harness", name: "Agent harness", description: "Connect an existing harness endpoint with a sandboxed adapter.", build: buildHarness },
] as const;

export function buildExampleProject(exampleId: string): ArchitectureGraph | null {
  const example = EXAMPLE_PROJECTS.find((item) => item.id === exampleId);
  return example ? example.build() : null;
}
