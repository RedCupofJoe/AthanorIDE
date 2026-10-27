import { createEmptyGraph } from "@athanor/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { applyDraft, assistantTokenStatus, briefsReady } from "@/lib/assistant";
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
});
