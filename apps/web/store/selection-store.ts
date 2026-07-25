/**
 * Canvas selection + focus state (nodes, edges, navigation targets).
 */
import { create } from "zustand";

interface SelectionStore {
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  focusNodeId: string | null;
  focusEdgeId: string | null;
  setSelection: (nodeIds: string[], edgeIds?: string[]) => void;
  clearSelection: () => void;
  focusNode: (nodeId: string | null) => void;
  focusEdge: (edgeId: string | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedNodeIds: [],
  selectedEdgeIds: [],
  focusNodeId: null,
  focusEdgeId: null,
  setSelection: (nodeIds, edgeIds = []) =>
    set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds, focusEdgeId: null }),
  clearSelection: () =>
    set({
      selectedNodeIds: [],
      selectedEdgeIds: [],
      focusNodeId: null,
      focusEdgeId: null,
    }),
  focusNode: (nodeId) =>
    set({
      focusNodeId: nodeId,
      focusEdgeId: null,
      selectedNodeIds: nodeId ? [nodeId] : [],
      selectedEdgeIds: [],
    }),
  focusEdge: (edgeId) =>
    set({
      focusEdgeId: edgeId,
      focusNodeId: null,
      selectedEdgeIds: edgeId ? [edgeId] : [],
      selectedNodeIds: [],
    }),
}));
