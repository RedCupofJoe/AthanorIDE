/**
 * Queues canvas-initiated deletes until the inspector sidebar confirms or cancels.
 */
"use client";

import { create } from "zustand";

import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";

export type PendingDelete = {
  nodeIds: string[];
  edgeIds: string[];
};

type PendingDeleteState = {
  pending: PendingDelete | null;
  /** Queue a delete initiated from the canvas; confirmation happens in the inspector. */
  requestDelete: (nodeIds: string[], edgeIds: string[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
};

export const usePendingDeleteStore = create<PendingDeleteState>((set, get) => ({
  pending: null,

  requestDelete: (nodeIds, edgeIds) => {
    const nodes = nodeIds.filter(
      (id) => !id.startsWith("macro:") && !id.startsWith("swimlane:"),
    );
    if (nodes.length === 0 && edgeIds.length === 0) return;
    set({ pending: { nodeIds: nodes, edgeIds } });
    useSelectionStore.getState().setSelection(nodes, edgeIds);
  },

  cancelDelete: () => set({ pending: null }),

  confirmDelete: () => {
    const pending = get().pending;
    if (!pending) return;
    useProjectStore
      .getState()
      .deleteSelection(pending.nodeIds, pending.edgeIds);
    useSelectionStore.getState().clearSelection();
    set({ pending: null });
  },
}));
