/**
 * Tracks an in-progress React Flow connection so ports can highlight compatibility.
 */
"use client";

import { create } from "zustand";
import type { ContractType } from "@athanor/contracts";

export type ConnectionDraft = {
  nodeId: string;
  handleId: string;
  /** React Flow handle type of the drag origin. */
  handleType: "source" | "target";
  contractType: ContractType;
};

type ConnectionDraftState = {
  draft: ConnectionDraft | null;
  setDraft: (draft: ConnectionDraft | null) => void;
  clearDraft: () => void;
};

export const useConnectionDraftStore = create<ConnectionDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
