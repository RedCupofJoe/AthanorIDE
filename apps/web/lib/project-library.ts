/**
 * Multi-project localStorage library: index and per-project bodies for agent projects.
 */
import {
  ArchitectureGraphSchema,
  createEmptyGraph,
  type ArchitectureGraph,
  parseArchitectureGraph,
} from "@athanor/contracts";

export const PROJECT_INDEX_KEY = "athanoride.agents.projects.index.v1";

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectIndex = {
  version: 1;
  activeId: string | null;
  entries: ProjectSummary[];
};

function bodyKey(id: string): string {
  return `athanoride.agents.project.${id}.v1`;
}

function emptyIndex(): ProjectIndex {
  return { version: 1, activeId: null, entries: [] };
}

function readIndexRaw(): ProjectIndex {
  if (typeof window === "undefined") return emptyIndex();
  try {
    const raw = window.localStorage.getItem(PROJECT_INDEX_KEY);
    if (!raw) return emptyIndex();
    const parsed = JSON.parse(raw) as ProjectIndex;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyIndex();
    return {
      version: 1,
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      entries: parsed.entries
        .filter(
          (entry) =>
            entry &&
            typeof entry.id === "string" &&
            typeof entry.name === "string" &&
            typeof entry.createdAt === "string" &&
            typeof entry.updatedAt === "string",
        )
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
    };
  } catch {
    return emptyIndex();
  }
}

function writeIndex(index: ProjectIndex): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));
}

function summaryFromGraph(graph: ArchitectureGraph): ProjectSummary {
  return {
    id: graph.project.id,
    name: graph.project.name,
    createdAt: graph.project.createdAt,
    updatedAt: graph.project.updatedAt,
  };
}

function upsertSummary(index: ProjectIndex, summary: ProjectSummary): ProjectIndex {
  const without = index.entries.filter((entry) => entry.id !== summary.id);
  return {
    ...index,
    entries: [summary, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export function listProjectSummaries(): ProjectSummary[] {
  return readIndexRaw().entries;
}

export function getActiveProjectId(): string | null {
  return readIndexRaw().activeId;
}

export function setActiveProjectId(id: string | null): void {
  const index = readIndexRaw();
  writeIndex({ ...index, activeId: id });
}

export function loadProjectGraph(id: string): ArchitectureGraph | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(bodyKey(id));
    if (!raw) return null;
    return parseArchitectureGraph(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveProjectGraph(graph: ArchitectureGraph): void {
  if (typeof window === "undefined") return;
  const parsed = ArchitectureGraphSchema.parse(graph);
  window.localStorage.setItem(bodyKey(parsed.project.id), JSON.stringify(parsed));
  const index = upsertSummary(readIndexRaw(), summaryFromGraph(parsed));
  index.activeId = parsed.project.id;
  writeIndex(index);
}

export function createProject(name = "Untitled project"): ArchitectureGraph {
  const graph = createEmptyGraph(name);
  saveProjectGraph(graph);
  return graph;
}

export function renameProject(id: string, name: string): ArchitectureGraph | null {
  const graph = loadProjectGraph(id);
  if (!graph) return null;
  const next: ArchitectureGraph = {
    ...graph,
    project: {
      ...graph.project,
      name: name.trim() || graph.project.name,
      updatedAt: new Date().toISOString(),
    },
  };
  saveProjectGraph(next);
  return next;
}

export function deleteProject(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(bodyKey(id));
  const index = readIndexRaw();
  const entries = index.entries.filter((entry) => entry.id !== id);
  const activeId = index.activeId === id ? (entries[0]?.id ?? null) : index.activeId;
  writeIndex({ version: 1, activeId, entries });
}

export function importProjectIntoLibrary(graph: ArchitectureGraph): ArchitectureGraph {
  const stamped: ArchitectureGraph = {
    ...graph,
    project: {
      ...graph.project,
      updatedAt: new Date().toISOString(),
    },
  };
  saveProjectGraph(stamped);
  return stamped;
}
