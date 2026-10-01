"use client";
import { create } from "zustand";
import type { ArchitectureNode } from "@athanor/contracts";
import { BLOCK_TEMPLATE_KEY, createBlockTemplate, parseBlockTemplates, serializeBlockTemplates, type BlockTemplate } from "@/lib/block-templates";

type State = {
  templates: BlockTemplate[];
  error: string | null;
  hydrate: () => void;
  save: (node: ArchitectureNode) => void;
  remove: (id: string) => void;
  importJson: (raw: string) => void;
};
export const useBlockTemplateStore = create<State>((set, get) => {
  const commit = (templates: BlockTemplate[]) => {
    try {
      const serialized = serializeBlockTemplates(templates);
      parseBlockTemplates(serialized);
      localStorage.setItem(BLOCK_TEMPLATE_KEY, serialized);
      set({ templates, error: null });
    } catch (error) { set({ error: error instanceof Error ? error.message : "Could not save templates." }); }
  };
  return {
    templates: [], error: null,
    hydrate: () => {
      try {
        const raw = localStorage.getItem(BLOCK_TEMPLATE_KEY);
        set({ templates: raw ? parseBlockTemplates(raw) : [], error: null });
      } catch { set({ error: "Saved templates could not be read. Your stored file has been preserved." }); }
    },
    save: node => commit([...get().templates, createBlockTemplate(node)]),
    remove: id => commit(get().templates.filter(t => t.id !== id)),
    importJson: raw => {
      try {
        const imported = parseBlockTemplates(raw);
        const merged = new Map(get().templates.map(t => [t.id, t]));
        imported.forEach(t => merged.set(t.id, t));
        commit([...merged.values()]);
      } catch (error) { set({ error: error instanceof Error ? error.message : "Invalid template file." }); }
    },
  };
});
