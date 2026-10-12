/**
 * Persisted UI preferences (e.g. compact node palette).
 */
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type UiPreferencesState = {
  paletteCompact: boolean;
  lowResourceMode: boolean;
  setPaletteCompact: (compact: boolean) => void;
  togglePaletteCompact: () => void;
  setLowResourceMode: (enabled: boolean) => void;
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
      paletteCompact: false,
      lowResourceMode: false,
      setPaletteCompact: (paletteCompact) => set({ paletteCompact }),
      setLowResourceMode: (lowResourceMode) => set({ lowResourceMode }),
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
