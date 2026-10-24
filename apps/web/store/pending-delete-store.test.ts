import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePendingDeleteStore } from "@/store/pending-delete-store";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";

describe("pending delete store", () => {
  beforeEach(() => {
    usePendingDeleteStore.setState({ pending: null });
    useSelectionStore.getState().clearSelection();
    useProjectStore.setState({
      graph: {
        schemaVersion: "2.0.0", workflow: {"tasks": [], "transitions": [], "input": "", "maxParallelTasks": 4, "viewport": {"x": 0, "y": 0, "zoom": 1}},
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
        infrastructureTokens: [],
        validationResults: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      past: [],
      future: [],
      connectionError: null,
      hydrated: true,
    });
  });

  it("queues a delete without removing nodes until confirm", () => {
    const id = useProjectStore.getState().addNode("foundation.text_input", { x: 0, y: 0 });
    usePendingDeleteStore.getState().requestDelete([id], []);
    expect(usePendingDeleteStore.getState().pending).toEqual({
      nodeIds: [id],
      edgeIds: [],
    });
    expect(useProjectStore.getState().graph.nodes).toHaveLength(1);

    usePendingDeleteStore.getState().cancelDelete();
    expect(usePendingDeleteStore.getState().pending).toBeNull();
    expect(useProjectStore.getState().graph.nodes).toHaveLength(1);
  });

  it("confirms delete through the project store", () => {
    const id = useProjectStore.getState().addNode("foundation.text_input", { x: 0, y: 0 });
    const spy = vi.spyOn(useProjectStore.getState(), "deleteSelection");
    usePendingDeleteStore.getState().requestDelete([id], []);
    usePendingDeleteStore.getState().confirmDelete();
    expect(spy).toHaveBeenCalledWith([id], []);
    expect(usePendingDeleteStore.getState().pending).toBeNull();
    expect(useProjectStore.getState().graph.nodes).toHaveLength(0);
    spy.mockRestore();
  });

  it("can queue an edge-only delete without nodes", () => {
    const sourceId = useProjectStore.getState().addNode("foundation.text_input", {
      x: 0,
      y: 0,
    });
    const targetId = useProjectStore.getState().addNode("foundation.output_viewer", {
      x: 200,
      y: 0,
    });
    const source = useProjectStore.getState().graph.nodes.find((node) => node.id === sourceId)!;
    const target = useProjectStore.getState().graph.nodes.find((node) => node.id === targetId)!;
    const connected = useProjectStore.getState().connectPorts({
      sourceNodeId: sourceId,
      sourcePortId: source.outputs[0]!.id,
      targetNodeId: targetId,
      targetPortId: target.inputs[0]!.id,
    });
    expect(connected).toBe(true);
    const edgeId = useProjectStore.getState().graph.edges[0]!.id;

    usePendingDeleteStore.getState().requestDelete([], [edgeId]);
    expect(usePendingDeleteStore.getState().pending).toEqual({
      nodeIds: [],
      edgeIds: [edgeId],
    });
    usePendingDeleteStore.getState().confirmDelete();
    expect(useProjectStore.getState().graph.edges).toHaveLength(0);
    expect(useProjectStore.getState().graph.nodes).toHaveLength(2);
  });
});
