/**
 * Persist/load helpers that write the open graph into the project library.
 */
import {
  ArchitectureGraphSchema,
  type ArchitectureGraph,
  parseArchitectureGraph,
} from "@athanor/contracts";

import {
  getActiveProjectId,
  listProjectSummaries,
  loadProjectGraph,
  saveProjectGraph,
} from "./project-library";

/** @deprecated Prefer project-library keyed storage; kept for migration compatibility. */
export const STORAGE_KEY = "athanoride.project.v1";

export function loadPersistedGraph(): ArchitectureGraph | null {
  const activeId = getActiveProjectId();
  if (activeId) {
    const active = loadProjectGraph(activeId);
    if (active) return active;
  }
  const first = listProjectSummaries()[0];
  if (first) {
    return loadProjectGraph(first.id);
  }
  return null;
}

export function persistGraph(graph: ArchitectureGraph): void {
  saveProjectGraph(graph);
}

export function exportGraphJson(graph: ArchitectureGraph): string {
  return `${JSON.stringify(ArchitectureGraphSchema.parse(graph), null, 2)}\n`;
}

export function importGraphJson(text: string): ArchitectureGraph {
  return parseArchitectureGraph(JSON.parse(text));
}

export function downloadGraphJson(graph: ArchitectureGraph, filename?: string): void {
  const blob = new Blob([exportGraphJson(graph)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? `${graph.project.name.replace(/\s+/g, "-").toLowerCase()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
