import { createEmptyGraph } from "@athanor/contracts";
import { createNodeFromDefinition } from "@athanor/node-definitions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyDraft, assistantTokenStatus, briefsReady, engineeringPlans, requestAnswer, requestDraft } from "@/lib/assistant";
import { createWorkflowTask } from "@/lib/workflow";
import { useProjectStore } from "@/store/project-store";

const SECRET = "sk-live-token-should-not-render";

describe("assistant draft", () => {
  beforeEach(() => {
    const graph = createEmptyGraph("Draft");
    const filled = createWorkflowTask(0);
    filled.role = "Researcher";
    filled.expectedTasks = "Find facts";
    const empty = createWorkflowTask(1);
    graph.workflow.tasks = [filled, empty];
    useProjectStore.setState({ graph, past: [], future: [], connectionError: null, hydrated: true });
  });

  it("keeps the stored token out of the settings status", () => {
    expect(assistantTokenStatus(true)).not.toContain(SECRET);
    expect(assistantTokenStatus(false)).not.toContain(SECRET);
    expect(assistantTokenStatus(true)).toContain("local vault");
    expect(assistantTokenStatus(true, false)).toBe(assistantTokenStatus(false, false));
    expect(assistantTokenStatus(false, false)).toContain("No API token will be sent");
  });

  it("requires a role and expected tasks on every task", () => {
    const tasks = useProjectStore.getState().graph.workflow.tasks;
    expect(briefsReady(tasks)).toBe(false);
    tasks[1]!.role = "Writer";
    tasks[1]!.expectedTasks = "Summarize";
    expect(briefsReady(tasks)).toBe(true);
  });

  it("assigns a draft only to empty tasks and can undo it", () => {
    const graph = useProjectStore.getState().graph;
    const [open, occupied] = graph.workflow.tasks;
    occupied!.role = "Writer";
    occupied!.expectedTasks = "Summarize";
    const existing = {
      id: "existing",
      type: "agent.model",
      version: "1.0.0",
      name: "Existing model",
      position: { x: 0, y: 0 },
      configuration: {},
      inputs: [],
      outputs: [],
      workflowTaskId: occupied!.id,
    };
    graph.nodes = [existing];
    const applied = applyDraft(graph, {
      summary: "Drafted one agent.",
      edges: [
        { source: "model", sourcePort: "model", target: "agent", targetPort: "model" },
      ],
      nodes: [
        {
          ref: "model",
          taskId: open!.id,
          type: "agent.model",
          name: "Research model",
          configuration: {},
        },
        {
          ref: "agent",
          taskId: open!.id,
          type: "agent.sandboxed",
          name: "Research agent",
          configuration: {},
        },
        {
          ref: "other",
          taskId: occupied!.id,
          type: "agent.model",
          name: "Should stay out",
          configuration: {},
        },
      ],
    });
    expect(applied.added).toBe(2);
    expect(applied.graph.nodes.filter((node) => node.workflowTaskId === occupied!.id)).toHaveLength(1);
    const agent = applied.graph.nodes.find((node) => node.name === "Research agent");
    expect(agent?.instructionMode).toBe("inherit");
    expect(applied.graph.workflow.tasks[0]?.inputBinding?.nodeId).toBe(agent?.id);
    useProjectStore.getState().replaceGraph(applied.graph, true);
    expect(useProjectStore.getState().graph.nodes).toHaveLength(3);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().graph.nodes).toHaveLength(1);
    expect(useProjectStore.getState().graph.nodes[0]?.name).toBe("Existing model");
  });

  it("rebuilds a populated task atomically, retains engineered prompts, and supports undo", () => {
    const graph = useProjectStore.getState().graph;
    const task = graph.workflow.tasks[0]!;
    const oldAgent = createNodeFromDefinition("agent.sandboxed", { x: 0, y: 0 });
    oldAgent.workflowTaskId = task.id;
    graph.nodes = [oldAgent];
    task.inputBinding = { nodeId: oldAgent.id, portId: oldAgent.inputs[0]!.id };
    graph.workflow.transitions = [{ id: "start", sourceTaskId: null, targetTaskId: task.id,
      kind: "normal", stage: 1, recoveryDescription: "" }];
    const report = { taskId: task.id, name: task.name, approach: "Research sources",
      inputContract: "Topic and sources", outputContract: "Evidence-backed facts",
      acceptanceChecks: ["Cite evidence"], connectedTools: [], setupRequirements: [] };
    const applied = applyDraft(graph, { summary: "Complete stage", nodes: [
      { ref: "agent", taskId: task.id, type: "agent.sandboxed", name: "Research agent",
        configuration: { instructions: "Specific engineering procedure" },
        instructionMode: "override", engineeringReport: report },
      ...["agent.model", "sandbox.podman", "agent.guardrails"].map((type) => ({
        ref: type, taskId: task.id, type, name: type, configuration: {},
      })),
    ], edges: [
      { source: "agent.model", sourcePort: "model", target: "agent", targetPort: "model" },
      { source: "sandbox.podman", sourcePort: "sandbox", target: "agent", targetPort: "sandbox" },
      { source: "agent.guardrails", sourcePort: "guardrails", target: "agent", targetPort: "guardrails" },
    ], workflowTransitions: [] }, [task.id]);
    expect(applied.graph.nodes).toHaveLength(4);
    expect(applied.graph.edges).toHaveLength(3);
    expect(applied.graph.nodes.some((node) => node.id === oldAgent.id)).toBe(false);
    const agent = applied.graph.nodes.find((node) => node.type === "agent.sandboxed")!;
    expect(agent.instructionMode).toBe("override");
    expect(agent.configuration.instructions).toBe("Specific engineering procedure");
    expect(applied.graph.workflow.tasks[0]?.inputBinding?.nodeId).toBe(agent.id);
    expect(applied.graph.workflow.tasks[0]?.expectedTasks).toBe(task.expectedTasks);
    expect(applied.graph.workflow.transitions).toBe(graph.workflow.transitions);
    expect(engineeringPlans(applied.graph)).toEqual([report]);
    useProjectStore.getState().replaceGraph(applied.graph, true);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().graph.nodes).toEqual([oldAgent]);
  });

  it("adds inferred transitions only when no routes have been drawn", () => {
    const graph = useProjectStore.getState().graph;
    const task = graph.workflow.tasks[0]!;
    const transitions = [{ id: "start", sourceTaskId: null, targetTaskId: task.id,
      kind: "normal" as const, stage: 1, recoveryDescription: "" }];
    const applied = applyDraft(graph, { summary: "Stage", edges: [], workflowTransitions: transitions,
      nodes: [{ ref: "a", taskId: task.id, type: "agent.sandboxed", name: "Agent", configuration: {} }],
    }, [task.id]);
    expect(applied.graph.workflow.transitions).toEqual(transitions);
  });
});

describe("assistant authentication preference", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends all task briefs and workflow input when building selected tasks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const graph = createEmptyGraph("Chain");
    graph.workflow.tasks = [createWorkflowTask(0), createWorkflowTask(1)];
    graph.workflow.input = "Initial state";
    graph.nodes = [createNodeFromDefinition("agent.tool", { x: 0, y: 0 }, {
      name: "Document search", configuration: { endpoint: "https://tools.example.test/search" },
    })];
    const selected = [graph.workflow.tasks[1]!.id];
    await requestDraft("http://127.0.0.1:8081/v1/chat/completions", "local", graph, false, selected);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.workflow.tasks).toHaveLength(2);
    expect(body.workflow.input).toBe("Initial state");
    expect(body.targetTaskIds).toEqual(selected);
    expect(body.workflow.availableTools).toHaveLength(1);
    expect(body.workflow.availableTools[0].name).toBe("Document search");
    expect(body.workflow.availableTools[0].configuration.endpoint).toBe("https://tools.example.test/search");
  });

  it.each([true, false, undefined])("passes useToken=%s to both assistant actions", async (useToken) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const endpoint = "http://127.0.0.1:8081/v1/chat/completions";
    await requestDraft(endpoint, "local", createEmptyGraph("Auth"), useToken);
    await requestAnswer(endpoint, "local", "What is deployed?", [], useToken);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(JSON.parse(options.body).useToken).toBe(useToken ?? true);
      expect(options.headers).not.toHaveProperty("Authorization");
    }
  });
});
