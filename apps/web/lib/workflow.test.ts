import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyGraph, parseArchitectureGraph } from "@athanor/contracts";
import { createNodeFromDefinition } from "@athanor/node-definitions";
import { buildExampleProject } from "./example-projects";
import {
  createWorkflowTask,
  workflowEndTasks,
  disconnectedCandidates,
  optionalPortCandidates,
  pruneOptionalPorts,
  restoreOptionalPorts,
} from "./workflow";
import { useProjectStore } from "@/store/project-store";
import { useValidationStore } from "@/store/validation-store";

describe("workflow project mutations", () => {
  beforeEach(() => {
    useProjectStore.setState({
      graph: createEmptyGraph(),
      past: [],
      future: [],
      hydrated: true,
    });
  });
  it("clones briefs without components, bindings or connections, and undoes deletion", () => {
    const store = useProjectStore.getState();
    const id = store.addTask();
    const node = store.addNode("agent.sandboxed");
    store.assignTask([node], id);
    store.updateTask(id, {
      role: "Reviewer",
      constraints: "Check evidence",
      inputBinding: { nodeId: node, portId: "input" },
    });
    store.cloneTask(id);
    let graph = useProjectStore.getState().graph;
    expect(graph.workflow.tasks[1]?.role).toBe("Reviewer");
    expect(graph.workflow.tasks[1]?.inputBinding).toBeUndefined();
    expect(graph.nodes).toHaveLength(1);
    store.removeTask(id);
    graph = useProjectStore.getState().graph;
    expect(graph.nodes[0]?.workflowTaskId).toBeUndefined();
    store.undo();
    expect(useProjectStore.getState().graph.nodes[0]?.workflowTaskId).toBe(id);
  });
  it("keeps custom instructions as an explicit override when assigning a node", () => {
    const store = useProjectStore.getState();
    const task = store.addTask();
    const node = store.addNode("agent.sandboxed");
    store.updateNodeConfiguration(node, {
      instructions: "Custom specialist instructions",
    });
    store.assignTask([node], task);
    expect(useProjectStore.getState().graph.nodes[0]?.instructionMode).toBe(
      "override",
    );
    expect(
      useProjectStore.getState().graph.nodes[0]?.configuration.instructions,
    ).toBe("Custom specialist instructions");
  });
  it("invalidates validation and moves a group with its components as one undo step", () => {
    const store = useProjectStore.getState();
    const task = store.addTask();
    const node = store.addNode("agent.sandboxed", { x: 100, y: 200 });
    store.assignTask([node], task);
    store.beginGesture();
    store.moveTaskGroup(task, 50, 60);
    expect(useProjectStore.getState().graph.nodes[0]?.position).toEqual({
      x: 150,
      y: 260,
    });
    store.undo();
    expect(useProjectStore.getState().graph.nodes[0]?.position).toEqual({
      x: 100,
      y: 200,
    });
    useValidationStore.getState().setResult(true, [], 1);
    store.updateTask(task, { constraints: "New constraint" });
    expect(useValidationStore.getState().status).toBe("idle");
  });
  it("clears deleted node bindings and restores them with undo", () => {
    const graph = buildExampleProject("sandboxed-agent")!;
    const id = graph.workflow.tasks[0]!.inputBinding!.nodeId;
    useProjectStore.getState().replaceGraph(graph, false);
    useProjectStore.getState().deleteSelection([id], []);
    expect(
      useProjectStore.getState().graph.workflow.tasks[0]?.inputBinding,
    ).toBeUndefined();
    useProjectStore.getState().undo();
    expect(
      useProjectStore.getState().graph.workflow.tasks[0]?.inputBinding?.nodeId,
    ).toBe(id);
  });
});

describe("safe pruning", () => {
  it("removes optional ports from persisted JSON, retains linked and required ports, and restores", () => {
    const graph = buildExampleProject("sandboxed-agent")!;
    const agent = graph.nodes.find((n) => n.type === "agent.sandboxed")!;
    const candidates = optionalPortCandidates(graph, agent.id);
    expect(candidates.map((p) => p.name).sort()).toEqual(["guardrails", "mcp"]);
    const pruned = parseArchitectureGraph(
      JSON.parse(JSON.stringify(pruneOptionalPorts(graph, agent.id))),
    );
    const persisted = pruned.nodes.find((n) => n.id === agent.id)!;
    expect(persisted.inputs.some((p) => p.name === "mcp")).toBe(false);
    expect(persisted.inputs.some((p) => p.name === "task")).toBe(true);
    expect(persisted.inputs.some((p) => p.name === "tools")).toBe(true);
    const restored = restoreOptionalPorts(pruned, agent.id).nodes.find(
      (n) => n.id === agent.id,
    )!;
    expect(restored.inputs.map((p) => p.name).sort()).toEqual(
      agent.inputs.map((p) => p.name).sort(),
    );
    expect(restored.prunedPorts).toBeUndefined();
  });
  it("protects optional boundary ports and macro references", () => {
    const graph = buildExampleProject("sandboxed-agent")!;
    const agent = graph.nodes.find((n) => n.type === "agent.sandboxed")!;
    const port = agent.inputs.find((p) => p.name === "mcp")!;
    graph.workflow.tasks[0]!.inputBinding = {
      nodeId: agent.id,
      portId: port.id,
    };
    expect(
      optionalPortCandidates(graph, agent.id).some((p) => p.id === port.id),
    ).toBe(false);
    delete graph.workflow.tasks[0]!.inputBinding;
    graph.macroBlocks.push({
      id: "macro",
      name: "Macro",
      nodeIds: [agent.id],
      collapsed: true,
      inputs: [],
      outputs: [],
      metadata: {
        portBindings: { external: { nodeId: agent.id, portId: port.id } },
      },
    });
    expect(
      optionalPortCandidates(graph, agent.id).some((p) => p.id === port.id),
    ).toBe(false);
  });
  it("only prunes disconnected group members, preserving shared, linked and portal nodes", () => {
    const graph = createEmptyGraph();
    const task = createWorkflowTask();
    graph.workflow.tasks.push(task);
    const orphan = {
      ...createNodeFromDefinition("agent.tool", { x: 0, y: 0 }),
      workflowTaskId: task.id,
    };
    const shared = createNodeFromDefinition("agent.tool", { x: 0, y: 0 });
    const boundary = {
      ...createNodeFromDefinition("agent.sandboxed", { x: 0, y: 0 }),
      workflowTaskId: task.id,
    };
    const portal = {
      ...createNodeFromDefinition("foundation.portal_input", { x: 0, y: 0 }),
      workflowTaskId: task.id,
    };
    graph.nodes.push(orphan, shared, boundary, portal);
    task.inputBinding = { nodeId: boundary.id, portId: boundary.inputs[0]!.id };
    expect(disconnectedCandidates(graph, task.id).map((n) => n.id)).toEqual([
      orphan.id,
    ]);
  });
});


describe("SME End node", () => {
  it("collects reachable normal leaves and excludes recovery and unconnected tasks", () => {
    const graph = createEmptyGraph();
    graph.workflow.tasks = [0, 1, 2, 3, 4].map(createWorkflowTask);
    const [a, b, join, recovery] = graph.workflow.tasks;
    graph.workflow.transitions = [
      { id: "a", sourceTaskId: null, targetTaskId: a!.id, kind: "normal", stage: 1, recoveryDescription: "" },
      { id: "b", sourceTaskId: null, targetTaskId: b!.id, kind: "normal", stage: 1, recoveryDescription: "" },
      { id: "join", sourceTaskId: a!.id, targetTaskId: join!.id, kind: "normal", stage: 2, recoveryDescription: "" },
      { id: "recover", sourceTaskId: a!.id, targetTaskId: recovery!.id, kind: "recovery", stage: 1, recoveryDescription: "Recover" },
    ];
    expect(workflowEndTasks(graph.workflow).map(t => t.id)).toEqual([b!.id, join!.id]);
    graph.workflow.transitions = [];
    expect(workflowEndTasks(graph.workflow)).toEqual([]);
  });
});
