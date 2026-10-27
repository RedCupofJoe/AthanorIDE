/**
 * Persisted UI preferences (e.g. compact node palette).
 */
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceRole = "sme" | "engineer" | "security";

type UiPreferencesState = {
  workspaceRole: WorkspaceRole;
  setWorkspaceRole: (role: WorkspaceRole) => void;
  paletteCompact: boolean;
  lowResourceMode: boolean;
  assistantEndpoint: string;
  assistantModel: string;
  setPaletteCompact: (compact: boolean) => void;
  togglePaletteCompact: () => void;
  setLowResourceMode: (enabled: boolean) => void;
  setAssistantEndpoint: (assistantEndpoint: string) => void;
  setAssistantModel: (assistantModel: string) => void;
};

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (name: string) => map.get(name) ?? null,
    setItem: (name: string, value: string) => {
      map.set(name, value);
    },
    removeItem: (name: string) => {
      map.delete(name);
    },
  };
};

export const useUiPreferencesStore = create<UiPreferencesState>()(
  persist(
    (set) => ({
      workspaceRole: "sme",
      setWorkspaceRole: (workspaceRole) => set({ workspaceRole }),
      paletteCompact: false,
      lowResourceMode: false,
      assistantEndpoint: "",
      assistantModel: "assistant",
      setPaletteCompact: (paletteCompact) => set({ paletteCompact }),
      setLowResourceMode: (lowResourceMode) => set({ lowResourceMode }),
      setAssistantEndpoint: (assistantEndpoint) => set({ assistantEndpoint }),
      setAssistantModel: (assistantModel) => set({ assistantModel }),
      togglePaletteCompact: () =>
        set((state) => ({ paletteCompact: !state.paletteCompact })),
    }),
    {
      name: "athanor.ui-preferences",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage() : window.localStorage,
      ),
    },
  ),
);
