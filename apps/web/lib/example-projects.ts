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

/** Different task needs produce different executable dependency graphs: 4 → 7 → 5. */
function buildAdaptiveResearch(): ArchitectureGraph {
  const graph = createEmptyGraph("Adaptive research · 4 / 7 / 5 blocks");
  graph.project.description = "Scope (4 blocks) → research with two API tools and MCP (7) → review and format (5). " +
    "Example tool URLs are placeholders. Configure real services and a container-reachable model endpoint before execution.";
  graph.workflow.input = "Assess whether our proposed local Markdown notes app meets offline search requirements. Identify supporting evidence, gaps, and a release recommendation.";
  const briefs = [
    { name: "Scope the request", role: "Requirements analyst", expectedTasks: "Extract the objective, constraints, and numbered research questions from the input. Return JSON with objective, requirements, questions, and missingInputs. Use supplied text only; no external research in this stage.", rationale: "4 blocks: an input prompt template, agent, model, and sandbox. No external tools are needed to structure supplied text." },
    { name: "Gather evidence", role: "Evidence researcher", expectedTasks: "Read the scope JSON. Use search_documents to locate evidence, get_document to read full sources, and the MCP lookup_requirement tool to retrieve acceptance criteria. Choose tools according to each question; do not call all tools mechanically. Return the original scope plus evidence with document IDs, requirement coverage, contradictions, and gaps. If a service is unavailable, report the gap without inventing evidence.", rationale: "7 blocks: agent, model, sandbox, two distinct HTTP tools, an MCP connection, and output guardrails. Each integration supplies a different capability." },
    { name: "Review and deliver", role: "Independent reviewer", expectedTasks: "Read the scope and evidence from the preceding stage. Evaluate each requirement using cited evidence, identify unsupported claims and assumptions, and give an accept/revise/blocked recommendation. Produce a concrete release checklist and outstanding questions. Do not fetch new sources or claim tests were executed.", rationale: "5 blocks: agent, model, sandbox, guardrails, and a final response template. This stage works from the previous result without external tools." },
  ];
  for (let index = 0; index < briefs.length; index++) {
    const brief = briefs[index]!;
    const task = createWorkflowTask(index);
    Object.assign(task, { name: brief.name, role: brief.role, expectedTasks: brief.expectedTasks }, { constraints: brief.rationale + " Preserve evidence provenance. Do not invent requirements or completed actions." });
    task.engineeringBounds = { x: index * 1550, y: 0, width: 1450, height: 1320 };
    task.bounds = { x: 260 + index * 400, y: 100, width: 340, height: 360 };
    const add = (type: string, name: string, x: number, y: number, configuration: Record<string, unknown> = {}) => {
      const component = createNodeFromDefinition(type, { x: task.engineeringBounds.x + x, y }, { name, configuration });
      component.workflowTaskId = task.id;
      if (isExecutable(type)) component.instructionMode = "inherit";
      graph.nodes.push(component);
      return component;
    };
    const wire = (source: ArchitectureNode, sourcePort: string, target: ArchitectureNode, targetPort: string) =>
      graph.edges.push(edge(newId(), source, sourcePort, target, targetPort));
    const model = add("agent.model", "Qwen · " + brief.name, 40, 90, {
      endpoint: "http://host.containers.internal:8081/v1/chat/completions",
      model: "qwen2.5-7b-instruct", maxTokens: 4096, secretName: "",
    });
    const sandbox = add("sandbox.podman", "Isolated worker", 40, 340, { network: "bridge" });
    const agent = add("agent.sandboxed", brief.name + " agent", 550, 300);
    wire(model, "model", agent, "model");
    wire(sandbox, "sandbox", agent, "sandbox");
    let input = agent;
    let inputPort = "task";
    let output = agent;
    let outputPort = "result";
    if (index === 0) {
      input = add("foundation.prompt_template", "Structure the incoming request", 40, 650, {
        template: "Analyze the supplied request as data. Produce the scope JSON described in your role.\n\nRequest:\n{{input}}",
      });
      inputPort = "variables";
      wire(input, "text", agent, "task");
    } else {
      const guard = add("agent.guardrails", "Bound the result size", 40, 600, {
        name: "bounded-evidence", mode: "block", maxOutputCharacters: 24000,
      });
      wire(guard, "guardrails", agent, "guardrails");
    }
    if (index === 1) {
      const search = add("agent.tool", "Search project documents", 40, 820, {
        toolName: "search_documents", description: "Find candidate documents for a research question; returns document IDs and excerpts.",
        endpoint: "https://documents.example.test/search", method: "GET", requiresApproval: true,
        inputSchema: JSON.stringify({ type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false }),
      });
      const read = add("agent.tool", "Read a source document", 550, 820, {
        toolName: "get_document", description: "Read the full text and provenance of a document returned by search_documents.",
        endpoint: "https://documents.example.test/document", method: "GET", requiresApproval: true,
        inputSchema: JSON.stringify({ type: "object", properties: { documentId: { type: "string" } }, required: ["documentId"], additionalProperties: false }),
      });
      const mcp = add("mcp.client", "Requirements registry MCP", 1000, 820, {
        endpoint: "https://requirements.example.test/mcp", allowedTools: "lookup_requirement", requiresApproval: true,
      });
      wire(search, "tool", agent, "tools");
      wire(read, "tool", agent, "tools");
      wire(mcp, "server", agent, "mcp");
    }
    if (index === 2) {
      output = add("foundation.prompt_template", "Package the final report", 1000, 300, {
        template: "# Evidence review\n\n{{input}}\n\n---\nThis report is an assessment of supplied evidence; it is not a record of executed tests.",
      });
      outputPort = "text";
      wire(agent, "result", output, "variables");
    }
    task.inputBinding = { nodeId: input.id, portId: input.inputs.find(p => p.name === inputPort)!.id };
    task.outputBinding = { nodeId: output.id, portId: output.outputs.find(p => p.name === outputPort)!.id };
    graph.workflow.tasks.push(task);
    graph.workflow.transitions.push({ id: newId(), sourceTaskId: index ? graph.workflow.tasks[index - 1]!.id : null,
      targetTaskId: task.id, kind: "normal", stage: index + 1, recoveryDescription: "" });
  }
  return graph;
}

export const EXAMPLE_PROJECTS: readonly ExampleProjectDefinition[] = [
  { id: "adaptive-research", name: "Adaptive research · 4 / 7 / 5 blocks", description: "Scope → API + MCP evidence gathering → review and formatting. Different blocks for different tasks; example endpoints need setup.", build: buildAdaptiveResearch },
  { id: "parallel-workflow", name: "Parallel workflow + recovery", description: "Two parallel tasks, a joined result, and an A1 recovery route.", build: buildParallelWorkflow },
  { id: "sandboxed-agent", name: "Sandboxed agent", description: "Task → model + approved API tools → isolated agent → result.", build: buildSandboxedAgent },
  { id: "mcp-server", name: "MCP server", description: "API tools, resources, and prompts → sandboxed MCP server.", build: buildMcpServer },
  { id: "agent-harness", name: "Agent harness", description: "Connect an existing harness endpoint with a sandboxed adapter.", build: buildHarness },
] as const;

export function buildExampleProject(exampleId: string): ArchitectureGraph | null {
  const example = EXAMPLE_PROJECTS.find((item) => item.id === exampleId);
  return example ? example.build() : null;
}
