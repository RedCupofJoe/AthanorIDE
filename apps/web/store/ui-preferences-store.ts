/**
 * Persisted UI preferences (e.g. compact node palette).
 */
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type UiPreferencesState = {
  paletteCompact: boolean;
  setPaletteCompact: (compact: boolean) => void;
  togglePaletteCompact: () => void;
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
      setPaletteCompact: (paletteCompact) => set({ paletteCompact }),
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
