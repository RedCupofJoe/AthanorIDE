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
});
