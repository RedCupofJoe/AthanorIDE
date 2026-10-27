/** Per-project index of task briefs and component configuration. Not part of exported JSON. */

import type { ArchitectureGraph } from "@athanor/contracts";

import { cosineSimilarity } from "@/lib/mcp-registry-search";
import { embedMcpSearchTexts } from "@/lib/mcp-semantic-search";
import { redactSecrets } from "@/lib/redact-secrets";

export type GraphChunk = {
  id: string;
  label: string;
  text: string;
  nodeIds: string[];
  vector?: number[];
};

type StoredIndex = {
  projectId: string;
  signature: string;
  chunks: GraphChunk[];
};

const DATABASE_NAME = "athanoride-project-graphrag";
const STORE = "indexes";
const memory = new Map<string, StoredIndex>();

function configText(configuration: Record<string, unknown>): string {
  return Object.entries(configuration)
    .map(([key, value]) => `${key}: ${redactSecrets(typeof value === "string" ? value : JSON.stringify(value))}`)
    .join("\n");
}

export function buildChunks(graph: ArchitectureGraph): GraphChunk[] {
  const chunks: GraphChunk[] = [];
  for (const task of graph.workflow.tasks) {
    const members = graph.nodes.filter((node) => node.workflowTaskId === task.id).map((node) => node.id);
    chunks.push({
      id: `task:${task.id}`,
      label: task.name,
      nodeIds: members,
      text: redactSecrets(
        `Task ${task.name}\nRole: ${task.role}\nExpected tasks: ${task.expectedTasks}\nConstraints: ${task.constraints}`,
      ),
    });
  }
  for (const node of graph.nodes) {
    const task = graph.workflow.tasks.find((item) => item.id === node.workflowTaskId);
    chunks.push({
      id: `node:${node.id}`,
      label: node.name,
      nodeIds: [node.id],
      text: redactSecrets(
        `${node.name} (${node.type})${task ? `\nTask: ${task.name}` : ""}\n${configText(node.configuration)}`,
      ),
    });
  }
  return chunks;
}

export function neighborNodeIds(graph: ArchitectureGraph, nodeId: string): string[] {
  const ids = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.sourceNodeId === nodeId) ids.add(edge.targetNodeId);
    if (edge.targetNodeId === nodeId) ids.add(edge.sourceNodeId);
  }
  return [...ids];
}

export function selectPassages(
  chunks: readonly GraphChunk[],
  query: number[],
  graph: ArchitectureGraph,
  limit = 4,
): { label: string; text: string }[] {
  const ranked = chunks
    .filter((chunk) => chunk.vector && chunk.vector.length > 0)
    .map((chunk) => ({ chunk, score: cosineSimilarity(query, chunk.vector ?? []) }))
    .sort((left, right) => right.score - left.score);
  const chosen = ranked.slice(0, limit).map((item) => item.chunk);
  const ids = new Set(chosen.flatMap((chunk) => chunk.nodeIds));
  for (const id of [...ids]) {
    for (const neighbor of neighborNodeIds(graph, id)) ids.add(neighbor);
  }
  const expanded = chunks.filter(
    (chunk) => chunk.nodeIds.some((id) => ids.has(id)) && !chosen.includes(chunk),
  );
  return [...chosen, ...expanded].slice(0, limit + 4).map((chunk) => ({
    label: chunk.label,
    text: chunk.text,
  }));
}

function signatureOf(chunks: readonly GraphChunk[]): string {
  return chunks.map((chunk) => `${chunk.id}\n${chunk.text}`).join("\n---\n");
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "projectId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the project index."));
  });
}

async function loadIndex(projectId: string): Promise<StoredIndex | null> {
  const cached = memory.get(projectId);
  if (cached) return cached;
  try {
    const db = await openDatabase();
    const stored = await new Promise<StoredIndex | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(projectId);
      request.onsuccess = () => resolve(request.result as StoredIndex | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (stored) memory.set(projectId, stored);
    return stored ?? null;
  } catch {
    return null;
  }
}

async function saveIndex(index: StoredIndex): Promise<void> {
  memory.set(index.projectId, index);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(index);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // The in-memory index still answers questions for this session.
  }
}

export async function refreshProjectIndex(graph: ArchitectureGraph): Promise<void> {
  const chunks = buildChunks(graph);
  const signature = signatureOf(chunks);
  const existing = await loadIndex(graph.project.id);
  if (existing?.signature === signature) return;
  const vectors = chunks.length ? await embedMcpSearchTexts(chunks.map((chunk) => chunk.text)) : [];
  await saveIndex({
    projectId: graph.project.id,
    signature,
    chunks: chunks.map((chunk, index) => ({ ...chunk, vector: vectors[index] ?? [] })),
  });
}

export async function retrievePassages(
  graph: ArchitectureGraph,
  question: string,
): Promise<{ label: string; text: string }[]> {
  await refreshProjectIndex(graph);
  const index = await loadIndex(graph.project.id);
  if (!index || index.chunks.length === 0) return [];
  const [query] = await embedMcpSearchTexts([redactSecrets(question)]);
  if (!query) return [];
  return selectPassages(index.chunks, query, graph);
}
