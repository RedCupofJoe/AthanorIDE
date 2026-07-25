/**
 * Zustand facade over the multi-project library (list/create/rename/delete/examples).
 */
"use client";

import { create } from "zustand";

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
  create: (name?: string) => string;
  createFromExample: (exampleId: string) => string | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
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

  create: (name) => {
    const graph = createProject(name);
    get().refresh();
    return graph.project.id;
  },

  createFromExample: (exampleId) => {
    const built = buildExampleProject(exampleId);
    if (!built) return null;
    const saved = importProjectIntoLibrary(built);
    get().refresh();
    return saved.project.id;
  },

  rename: (id, name) => {
    renameProject(id, name);
    get().refresh();
  },

  remove: (id) => {
    deleteProject(id);
    get().refresh();
  },

  setActive: (id) => {
    setActiveProjectId(id);
    get().refresh();
  },
}));
