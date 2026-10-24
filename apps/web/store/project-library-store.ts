/**
 * Zustand facade over the multi-project library (list/create/rename/delete/examples).
 */
"use client";

import { create } from "zustand";
import { useUiPreferencesStore } from "./ui-preferences-store";

import {
  createProject,
  deleteProject,
  getActiveProjectId,
  importProjectIntoLibrary,
  listProjectSummaries,
  renameProject,
  setActiveProjectId,
  type ProjectSummary,
} from "@/lib/project-library";
import { buildExampleProject } from "@/lib/example-projects";

type ProjectLibraryState = {
  projects: ProjectSummary[];
  activeId: string | null;
  refresh: () => void;
  create: (name?: string) => Promise<string>;
  createFromExample: (exampleId: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
};

export const useProjectLibraryStore = create<ProjectLibraryState>((set, get) => ({
  projects: [],
  activeId: null,

  refresh: () => {
    set({
      projects: listProjectSummaries(),
      activeId: getActiveProjectId(),
    });
  },

  create: async (name) => {
    useUiPreferencesStore.getState().setWorkspaceRole("sme");
    const graph = await createProject(name);
    get().refresh();
    return graph.project.id;
  },

  createFromExample: async (exampleId) => {
    const built = buildExampleProject(exampleId);
    if (!built) return null;
    const saved = await importProjectIntoLibrary(built);
    get().refresh();
    return saved.project.id;
  },

  rename: async (id, name) => {
    await renameProject(id, name);
    get().refresh();
  },

  remove: async (id) => {
    await deleteProject(id);
    get().refresh();
  },

  setActive: (id) => {
    setActiveProjectId(id);
    get().refresh();
  },
}));
