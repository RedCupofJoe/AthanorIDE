import { describe, expect, it } from "vitest";
import { areContractsCompatible } from "@athanor/contracts";
import { EXAMPLE_PROJECTS, buildExampleProject } from "./example-projects";

describe("agent starter projects", () => {
  it("exposes role-aware agent engineering flows", () => {
    expect(EXAMPLE_PROJECTS.map(item => item.id)).toEqual(["adaptive-research", "parallel-workflow", "sandboxed-agent", "mcp-server", "agent-harness"]);
  });
  it.each(EXAMPLE_PROJECTS)("$name connects every required input with matching contracts", example => {
    const graph = example.build();
    expect(graph.project.id).not.toBe(example.build().project.id);
    for (const node of graph.nodes) {
      for (const port of node.inputs.filter(p => p.required)) {
        expect(graph.edges.some(e => e.targetNodeId === node.id && e.targetPortId === port.id) || graph.workflow.tasks.some(t => t.inputBinding?.nodeId === node.id && t.inputBinding.portId === port.id)).toBe(true);
      }
    }
    for (const edge of graph.edges) {
      const source = graph.nodes.find(n => n.id === edge.sourceNodeId)!.outputs.find(p => p.id === edge.sourcePortId)!;
      const target = graph.nodes.find(n => n.id === edge.targetNodeId)!.inputs.find(p => p.id === edge.targetPortId)!;
      expect(areContractsCompatible(source.contractType, target.contractType)).toBe(true);
    }
  });
  it("uses different dependency graphs per task with no disconnected filler", () => {
    const graph = buildExampleProject("adaptive-research")!;
    expect(graph.workflow.tasks.map(task => graph.nodes.filter(n => n.workflowTaskId === task.id).length)).toEqual([4, 7, 5]);
    for (const task of graph.workflow.tasks) {
      const closure = new Set([task.outputBinding!.nodeId]);
      let size = -1;
      while (size !== closure.size) {
        size = closure.size;
        graph.edges.filter(e => closure.has(e.targetNodeId)).forEach(e => closure.add(e.sourceNodeId));
      }
      expect(closure.has(task.inputBinding!.nodeId)).toBe(true);
      expect(graph.nodes.filter(n => n.workflowTaskId === task.id).every(n => closure.has(n.id))).toBe(true);
    }
    const tools = graph.nodes.filter(n => n.type === "agent.tool" || n.type === "mcp.client");
    expect(tools).toHaveLength(3);
    expect(tools.every(n => n.workflowTaskId === graph.workflow.tasks[1]!.id && n.configuration.requiresApproval === true)).toBe(true);
  });
  it("returns null for an unknown example", () => expect(buildExampleProject("missing")).toBeNull());
});
