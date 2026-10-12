/** Local, bounded MCP Registry index. Registry metadata and vectors stay in this browser. */
import type { McpCandidate } from "@/lib/mcp-import";
import { MCP_EMBEDDING_MODEL, MCP_EMBEDDING_MODEL_REVISION } from "@/lib/mcp-semantic-config";

const DATABASE_NAME = "athanoride-mcp-registry-search";
const DATABASE_VERSION = 1;
const CANDIDATE_STORE = "candidates";
const VECTOR_STORE = "vectors";
const MEMORY_LIMIT = 500;
const memoryCandidates = new Map<string, McpCandidate>();
const memoryVectors = new Map<string, number[]>();

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Browser local storage is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANDIDATE_STORE)) db.createObjectStore(CANDIDATE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(VECTOR_STORE)) db.createObjectStore(VECTOR_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the MCP search cache."));
  });
}

async function transact<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("MCP search cache request failed."));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error("MCP search cache write failed."));
    });
  } finally { db.close(); }
}

export async function loadMcpCandidates(): Promise<McpCandidate[]> {
  try {
    const saved = await transact<McpCandidate[]>(CANDIDATE_STORE, "readonly", (store) => store.getAll());
    for (const candidate of saved) memoryCandidates.set(candidate.id, candidate);
  } catch { /* Keep this-session results usable if browser storage is disabled. */ }
  return [...memoryCandidates.values()];
}

export async function saveMcpCandidates(candidates: McpCandidate[]): Promise<void> {
  await loadMcpCandidates();
  for (const candidate of candidates) memoryCandidates.set(candidate.id, candidate);
  const bounded = [...memoryCandidates.values()].slice(-MEMORY_LIMIT);
  memoryCandidates.clear();
  for (const candidate of bounded) memoryCandidates.set(candidate.id, candidate);
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CANDIDATE_STORE, "readwrite");
        const store = transaction.objectStore(CANDIDATE_STORE);
        for (const candidate of bounded) store.put(candidate);
        const keep = new Set(bounded.map((candidate) => candidate.id));
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (!keep.has(String(cursor.key))) cursor.delete();
          cursor.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not save MCP search results."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Could not save MCP search results."));
      });
    } finally { db.close(); }
  } catch { /* The panel reports this-session cache status without breaking registry import. */ }
}

function vectorKey(id: string): string {
  return `${MCP_EMBEDDING_MODEL}:${MCP_EMBEDDING_MODEL_REVISION}:${id}`;
}

export async function loadMcpVectors(ids: string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const keys = new Set(ids.map(vectorKey));
  try {
    const records = await transact<Array<{ key: string; vector: number[] }>>(VECTOR_STORE, "readonly", (store) => store.getAll());
    for (const record of records) if (keys.has(record.key) && Array.isArray(record.vector)) {
      memoryVectors.set(record.key, record.vector);
      result.set(record.key.slice(record.key.lastIndexOf(":") + 1), record.vector);
    }
  } catch { /* Reuse vectors held in this page if IndexedDB is unavailable. */ }
  for (const id of ids) {
    const key = vectorKey(id);
    const vector = result.get(id) ?? memoryVectors.get(key);
    if (vector) result.set(id, vector);
  }
  return result;
}

export async function saveMcpVectors(vectors: Map<string, number[]>): Promise<void> {
  const records = [...vectors].map(([id, vector]) => ({ key: vectorKey(id), vector }));
  for (const record of records) memoryVectors.set(record.key, record.vector);
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(VECTOR_STORE, "readwrite");
        const store = transaction.objectStore(VECTOR_STORE);
        for (const record of records) store.put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not save MCP embeddings."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Could not save MCP embeddings."));
      });
    } finally { db.close(); }
  } catch { /* Search remains available; missing vectors can be recreated later. */ }
}

export function candidateSearchText(candidate: McpCandidate): string {
  const config = candidate.template.node.configuration;
  return [candidate.name, candidate.description, candidate.transport, ...candidate.topics,
    String(config.packageSpec ?? ""), String(config.endpoint ?? "")].join(". ");
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function queryFilters(query: string): { terms: string[]; topic: string; transport: string } {
  let topic = "";
  let transport = "";
  const terms: string[] = [];
  for (const part of normalize(query).split(/\s+/).filter(Boolean)) {
    if (part.startsWith("topic:") && part.length > 6) topic = part.slice(6);
    else if (part.startsWith("transport:") && part.length > 10) transport = part.slice(10);
    else terms.push(part);
  }
  return { terms, topic, transport };
}

/** GitHub-topic-style CPU search with field weighting and optional topic:/transport: filters. */
export function searchMcpCandidates(candidates: McpCandidate[], query: string): McpCandidate[] {
  const filters = queryFilters(query);
  const normalized = candidates.map((candidate) => ({ candidate,
    name: normalize(candidate.name), description: normalize(candidate.description),
    topics: candidate.topics.map(normalize), transport: normalize(candidate.transport),
    all: normalize(candidateSearchText(candidate)),
  }));
  return normalized.flatMap(({ candidate, name, description, topics, transport, all }) => {
    if (filters.topic && !topics.some((topic) => topic.includes(filters.topic))) return [];
    if (filters.transport && !transport.includes(filters.transport)) return [];
    let score = 0;
    for (const term of filters.terms) {
      if (name === term) score += 16;
      else if (name.startsWith(term)) score += 10;
      else if (name.includes(term)) score += 7;
      if (topics.some((topic) => topic === term)) score += 9;
      else if (topics.some((topic) => topic.includes(term))) score += 5;
      if (transport.includes(term)) score += 4;
      if (description.includes(term)) score += 2;
      if (!all.includes(term)) return [];
    }
    return [{ candidate, score }];
  }).sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name)).map(({ candidate }) => candidate);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return -1;
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) dot += (left[i] ?? 0) * (right[i] ?? 0);
  return dot;
}
