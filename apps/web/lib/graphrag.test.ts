import { createEmptyGraph } from "@athanor/contracts";
import { describe, expect, it } from "vitest";

import { buildChunks, neighborNodeIds, selectPassages } from "@/lib/graphrag";
import { createWorkflowTask } from "@/lib/workflow";

describe("project GraphRAG", () => {
  it("redacts secret-like configuration before a chunk is stored", () => {
    const graph = createEmptyGraph("Indexed");
    const task = createWorkflowTask(0);
    task.role = "Researcher";
    task.expectedTasks = "Find facts";
    task.constraints = "api_key=supersecretvalue";
    graph.workflow.tasks = [task];
    graph.nodes = [
      {
        id: "model",
        type: "agent.model",
        version: "1.0.0",
        name: "Model",
        position: { x: 0, y: 0 },
        configuration: { endpoint: "https://models.example/v1/chat/completions", secretName: "MODEL_API_KEY" },
        inputs: [],
        outputs: [],
        workflowTaskId: task.id,
      },
    ];
    const text = buildChunks(graph).map((chunk) => chunk.text).join("\n");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("supersecretvalue");
    expect(text).toContain("MODEL_API_KEY");
  });

  it("adds the immediate neighbor of a retrieved component", () => {
    const graph = createEmptyGraph("Neighbors");
    graph.nodes = [
      {
        id: "model",
        type: "agent.model",
        version: "1.0.0",
        name: "Model",
        position: { x: 0, y: 0 },
        configuration: {},
        inputs: [],
        outputs: [],
      },
      {
        id: "agent",
        type: "agent.sandboxed",
        version: "1.0.0",
        name: "Agent",
        position: { x: 0, y: 0 },
        configuration: {},
        inputs: [],
        outputs: [],
      },
    ];
    graph.edges = [
      {
        id: "wire",
        sourceNodeId: "model",
        sourcePortId: "out-model",
        targetNodeId: "agent",
        targetPortId: "in-model",
      },
    ];
    const chunks = [
      { id: "node:model", label: "Model", text: "model endpoint", nodeIds: ["model"], vector: [1, 0] },
      { id: "node:agent", label: "Agent", text: "sandboxed agent", nodeIds: ["agent"], vector: [0, 1] },
    ];
    const passages = selectPassages(chunks, [1, 0], graph, 1);
    expect(passages.map((passage) => passage.label)).toEqual(["Model", "Agent"]);
    expect(neighborNodeIds(graph, "model")).toEqual(["agent"]);
  });
});
