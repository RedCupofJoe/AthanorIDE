import { beforeEach, describe, expect, it } from "vitest";

import { useProjectStore } from "@/store/project-store";

describe("project store", () => {
  beforeEach(() => {
    useProjectStore.setState({
      graph: {
        schemaVersion: "1.0.0",
        project: {
          id: "test",
          name: "Test",
          createdAt: "2026-07-24T14:00:00.000Z",
          updatedAt: "2026-07-24T14:00:00.000Z",
        },
        nodes: [],
        edges: [],
        contracts: [],
        deploymentEnvironments: [],
        macroBlocks: [],
        portalBuses: [],
        validationResults: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      past: [],
      future: [],
      connectionError: null,
      hydrated: true,
    });
  });

  it("adds foundation nodes and supports undo", () => {
    const id = useProjectStore.getState().addNode("foundation.text_input", {
      x: 10,
      y: 20,
    });
    expect(useProjectStore.getState().graph.nodes).toHaveLength(1);
    expect(id).toBeTruthy();

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().graph.nodes).toHaveLength(0);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().graph.nodes).toHaveLength(1);
  });

  it("connects compatible ports", () => {
    const sourceId = useProjectStore
      .getState()
      .addNode("foundation.text_input", { x: 0, y: 0 });
    const targetId = useProjectStore
      .getState()
      .addNode("foundation.python_transform", { x: 200, y: 0 });
    const source = useProjectStore.getState().graph.nodes.find((n) => n.id === sourceId)!;
    const target = useProjectStore.getState().graph.nodes.find((n) => n.id === targetId)!;

    const ok = useProjectStore.getState().connectPorts({
      sourceNodeId: source.id,
      sourcePortId: source.outputs[0]!.id,
      targetNodeId: target.id,
      targetPortId: target.inputs[0]!.id,
    });
    expect(ok).toBe(true);
    expect(useProjectStore.getState().graph.edges).toHaveLength(1);
  });

  it("collapses a selection into a serializable macro block", () => {
    const a = useProjectStore.getState().addNode("foundation.text_input", { x: 0, y: 0 });
    const b = useProjectStore
      .getState()
      .addNode("foundation.python_transform", { x: 200, y: 0 });
    const source = useProjectStore.getState().graph.nodes.find((n) => n.id === a)!;
    const target = useProjectStore.getState().graph.nodes.find((n) => n.id === b)!;
    useProjectStore.getState().connectPorts({
      sourceNodeId: source.id,
      sourcePortId: source.outputs[0]!.id,
      targetNodeId: target.id,
      targetPortId: target.inputs[0]!.id,
    });

    const macroId = useProjectStore.getState().collapseSelectionToMacro([a, b], "Pair");
    expect(macroId).toBeTruthy();
    const graph = useProjectStore.getState().graph;
    expect(graph.macroBlocks).toHaveLength(1);
    expect(graph.macroBlocks[0]?.collapsed).toBe(true);
    expect(graph.nodes.every((node) => node.parentMacroId === macroId)).toBe(true);

    useProjectStore.getState().expandMacro(macroId!);
    expect(useProjectStore.getState().graph.macroBlocks[0]?.collapsed).toBe(false);
  });

  it("adds swimlanes and syncs portal buses", () => {
    const laneId = useProjectStore.getState().addSwimlane("KUBERNETES", "Cluster");
    expect(useProjectStore.getState().graph.deploymentEnvironments[0]?.id).toBe(laneId);

    useProjectStore.getState().addNode("foundation.portal_input", { x: 10, y: 10 });
    useProjectStore.getState().addNode("foundation.portal_output", { x: 20, y: 20 });
    expect(useProjectStore.getState().graph.portalBuses.length).toBeGreaterThan(0);
  });
});
