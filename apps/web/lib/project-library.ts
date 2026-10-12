/** IndexedDB project bodies with a small localStorage index and legacy migration. */
import {
  ArchitectureGraphSchema,
  createEmptyGraph,
  type ArchitectureGraph,
  parseArchitectureGraph,
} from "@athanor/contracts";

export const PROJECT_INDEX_KEY = "athanoride.agents.projects.index.v1";
const LEGACY_BODY_PREFIX = "athanoride.agents.project.";
const DATABASE_NAME = "athanoride-project-library";
const DATABASE_VERSION = 1;
const STORE_NAME = "projects";

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectIndex = { version: 1; activeId: string | null; entries: ProjectSummary[] };

function bodyKey(id: string): string {
  return `${LEGACY_BODY_PREFIX}${id}.v1`;
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
      entries: parsed.entries.filter((entry) => entry && typeof entry.id === "string"
        && typeof entry.name === "string" && typeof entry.createdAt === "string"
        && typeof entry.updatedAt === "string").map((entry) => ({
        id: entry.id, name: entry.name, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      })),
    };
  } catch {
    return emptyIndex();
  }
}

function writeIndex(index: ProjectIndex): void {
  if (typeof window !== "undefined") window.localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "project.id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open project storage"));
  });
}

async function idbRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("Project storage request failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Project storage transaction aborted"));
      transaction.oncomplete = () => resolve(result);
    });
  } finally {
    database.close();
  }
}

function summaryFromGraph(graph: ArchitectureGraph): ProjectSummary {
  return { id: graph.project.id, name: graph.project.name,
    createdAt: graph.project.createdAt, updatedAt: graph.project.updatedAt };
}

function upsertSummary(index: ProjectIndex, summary: ProjectSummary): ProjectIndex {
  const entries = [summary, ...index.entries.filter((entry) => entry.id !== summary.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { ...index, entries };
}

export function listProjectSummaries(): ProjectSummary[] { return readIndexRaw().entries; }
export function getActiveProjectId(): string | null { return readIndexRaw().activeId; }
export function setActiveProjectId(id: string | null): void {
  writeIndex({ ...readIndexRaw(), activeId: id });
}

export async function loadProjectGraph(id: string): Promise<ArchitectureGraph | null> {
  if (typeof window === "undefined") return null;
  try {
    const stored = await idbRequest<ArchitectureGraph | undefined>("readonly", (store) => store.get(id));
    if (stored) return parseArchitectureGraph(stored);
  } catch {
    // Fall back to legacy storage so browser privacy settings do not make projects disappear.
  }
  try {
    const raw = window.localStorage.getItem(bodyKey(id));
    if (!raw) return null;
    const graph = parseArchitectureGraph(JSON.parse(raw));
    await saveProjectGraph(graph);
    window.localStorage.removeItem(bodyKey(id));
    return graph;
  } catch {
    return null;
  }
}

export async function saveProjectGraph(graph: ArchitectureGraph): Promise<void> {
  if (typeof window === "undefined") return;
  const parsed = ArchitectureGraphSchema.parse(graph);
  try {
    await idbRequest("readwrite", (store) => store.put(parsed));
  } catch (error) {
    // Preserve usability in restricted browser contexts; expose storage errors at the UI layer.
    if (!(error instanceof Error)) throw error;
    window.localStorage.setItem(bodyKey(parsed.project.id), JSON.stringify(parsed));
  }
  const index = upsertSummary(readIndexRaw(), summaryFromGraph(parsed));
  index.activeId = parsed.project.id;
  writeIndex(index);
}

export async function createProject(name = "Untitled project"): Promise<ArchitectureGraph> {
  const graph = createEmptyGraph(name);
  await saveProjectGraph(graph);
  return graph;
}

export async function renameProject(id: string, name: string): Promise<ArchitectureGraph | null> {
  const graph = await loadProjectGraph(id);
  if (!graph) return null;
  const next = { ...graph, project: { ...graph.project,
    name: name.trim() || graph.project.name, updatedAt: new Date().toISOString() } };
  await saveProjectGraph(next);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  try { await idbRequest("readwrite", (store) => store.delete(id)); } catch { /* remove legacy copy below */ }
  window.localStorage.removeItem(bodyKey(id));
  const index = readIndexRaw();
  const entries = index.entries.filter((entry) => entry.id !== id);
  writeIndex({ version: 1, activeId: index.activeId === id ? (entries[0]?.id ?? null) : index.activeId, entries });
}

export async function importProjectIntoLibrary(graph: ArchitectureGraph): Promise<ArchitectureGraph> {
  const stamped = { ...graph, project: { ...graph.project, updatedAt: new Date().toISOString() } };
  await saveProjectGraph(stamped);
  return stamped;
}
