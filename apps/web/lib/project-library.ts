/**
 * Multi-project localStorage library: index, per-project bodies, legacy migration.
 */
import {
  ArchitectureGraphSchema,
  createEmptyGraph,
  type ArchitectureGraph,
  parseArchitectureGraph,
} from "@athanor/contracts";

/** Legacy single-project key (migrated on first library access). */
export const LEGACY_STORAGE_KEY = "athanoride.project.v1";
export const PROJECT_INDEX_KEY = "athanoride.projects.index.v1";

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
  return `athanoride.project.${id}.v1`;
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

/** One-time migration from the Phase-1 single-project storage key. */
export function migrateLegacyProjectIfNeeded(): void {
  if (typeof window === "undefined") return;
  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return;

  try {
    const graph = parseArchitectureGraph(JSON.parse(legacy));
    const index = readIndexRaw();
    if (!index.entries.some((entry) => entry.id === graph.project.id)) {
      window.localStorage.setItem(bodyKey(graph.project.id), JSON.stringify(graph));
      const next = upsertSummary(index, summaryFromGraph(graph));
      next.activeId = next.activeId ?? graph.project.id;
      writeIndex(next);
    }
  } catch {
    // Leave legacy key in place if it cannot be parsed.
    return;
  }

  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function listProjectSummaries(): ProjectSummary[] {
  migrateLegacyProjectIfNeeded();
  return readIndexRaw().entries;
}

export function getActiveProjectId(): string | null {
  migrateLegacyProjectIfNeeded();
  return readIndexRaw().activeId;
}

export function setActiveProjectId(id: string | null): void {
  migrateLegacyProjectIfNeeded();
  const index = readIndexRaw();
  writeIndex({ ...index, activeId: id });
}

export function loadProjectGraph(id: string): ArchitectureGraph | null {
  if (typeof window === "undefined") return null;
  migrateLegacyProjectIfNeeded();
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
  migrateLegacyProjectIfNeeded();
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
  migrateLegacyProjectIfNeeded();
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
