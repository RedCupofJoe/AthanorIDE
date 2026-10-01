import { describe, expect, it } from "vitest";
import { createNodeFromDefinition } from "@athanor/node-definitions";
import { createBlockTemplate, materializeBlockTemplate, parseBlockTemplates, serializeBlockTemplates } from "./block-templates";
import { useProjectStore } from "@/store/project-store";
import { createEmptyGraph } from "@athanor/contracts";

describe("reusable blocks", () => {
  it("round-trips a custom endpoint without carrying project placement or sharing configuration", () => {
    const node = createNodeFromDefinition("agent.custom_tool", { x: 5, y: 8 });
    node.parentMacroId = "old-macro";
    node.deploymentTarget = "old-lane";
    node.configuration.endpoint = "https://api.example.org/search";
    const saved = parseBlockTemplates(serializeBlockTemplates([createBlockTemplate(node)]))[0]!;
    const a = materializeBlockTemplate(saved, { x: 30, y: 40 });
    const b = materializeBlockTemplate(saved, { x: 50, y: 60 });
    expect(a.id).not.toBe(b.id);
    expect(a.type).toBe("agent.custom_tool");
    expect(a.parentMacroId).toBeUndefined();
    expect(a.deploymentTarget).toBeUndefined();
    a.configuration.endpoint = "changed";
    expect(b.configuration.endpoint).toBe("https://api.example.org/search");
  });
  it("rejects malformed and unknown block imports", () => {
    expect(() => parseBlockTemplates('{"version":2,"templates":[]}')).toThrow();
    const template = createBlockTemplate(createNodeFromDefinition("agent.tool", { x: 0, y: 0 }));
    template.node.type = "arbitrary.code";
    expect(() => parseBlockTemplates(serializeBlockTemplates([template]))).toThrow("Unknown block");
  });
  it("places saved blocks in normal undo/redo history", () => {
    useProjectStore.getState().replaceGraph(createEmptyGraph("Test"), false);
    useProjectStore.setState({ past: [], future: [] });
    const template = createBlockTemplate(createNodeFromDefinition("agent.tool", { x: 0, y: 0 }));
    const id = useProjectStore.getState().addTemplate(template);
    expect(useProjectStore.getState().graph.nodes[0]?.id).toBe(id);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().graph.nodes).toHaveLength(0);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().graph.nodes[0]?.id).toBe(id);
  });
});
