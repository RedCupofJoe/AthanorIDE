import { describe, expect, it } from "vitest";
import { areContractsCompatible } from "@athanor/contracts";
import { EXAMPLE_PROJECTS, buildExampleProject } from "./example-projects";

describe("agent starter projects", () => {
  it("exposes the three agent engineering flows", () => {
    expect(EXAMPLE_PROJECTS.map(item => item.id)).toEqual(["sandboxed-agent", "mcp-server", "agent-harness"]);
  });
  it.each(EXAMPLE_PROJECTS)("$name connects every required input with matching contracts", example => {
    const graph = example.build();
    expect(graph.project.id).not.toBe(example.build().project.id);
    for (const node of graph.nodes) {
      for (const port of node.inputs.filter(p => p.required)) {
        expect(graph.edges.some(e => e.targetNodeId === node.id && e.targetPortId === port.id)).toBe(true);
      }
    }
    for (const edge of graph.edges) {
      const source = graph.nodes.find(n => n.id === edge.sourceNodeId)!.outputs.find(p => p.id === edge.sourcePortId)!;
      const target = graph.nodes.find(n => n.id === edge.targetNodeId)!.inputs.find(p => p.id === edge.targetPortId)!;
      expect(areContractsCompatible(source.contractType, target.contractType)).toBe(true);
    }
  });
  it("returns null for an unknown example", () => expect(buildExampleProject("missing")).toBeNull());
});
