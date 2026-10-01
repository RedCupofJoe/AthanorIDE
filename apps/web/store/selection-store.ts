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
    set(state => {
      if (state.selectedNodeIds.length === nodeIds.length && state.selectedEdgeIds.length === edgeIds.length &&
          state.selectedNodeIds.every((id, i) => id === nodeIds[i]) && state.selectedEdgeIds.every((id, i) => id === edgeIds[i])) return state;
      return { selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds, focusNodeId: null, focusEdgeId: null };
    }),
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
