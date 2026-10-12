/** Browser-local, versioned marketplace snapshot with a 24-hour refresh cadence. */
import { getApiBaseUrl } from "@/lib/api";

export const MARKETPLACE_TOPICS = [
  { id: "agent-frameworks", label: "Agent frameworks and orchestration" },
  { id: "mcp-tools", label: "MCP servers and tool integrations" },
  { id: "model-serving", label: "Model serving and inference runtimes" },
  { id: "rag-retrieval", label: "RAG and retrieval pipelines" },
  { id: "vector-databases", label: "Vector databases and search" },
  { id: "fine-tuning", label: "Fine-tuning and model adaptation" },
  { id: "computer-vision", label: "Computer vision" },
  { id: "multimodal-media", label: "Multimodal, audio, and video" },
  { id: "enterprise-integration", label: "Enterprise integration and data platforms" },
  { id: "security-observability", label: "Security, guardrails, and observability" },
] as const;

export type MarketplaceAdvisory = {
  id: string; aliases: string[]; summary: string; severity: string | null;
  cvssScore: number | null; affectedRange: string | null; fixedVersions: string[];
  url: string; publishedAt: string | null;
};
export type MarketplaceEntry = {
  id: string; topic: string; name: string; description: string; ecosystem: "npm";
  version: string; license: string | null; registryUrl: string; repositoryUrl: string | null;
  downloads90d: number | null; rating: number | null; ratingSource: string | null;
  ratingCount: number | null; advisories: MarketplaceAdvisory[];
  securityStatus: "checked" | "unavailable"; score: number | null;
  scoreCompleteness: string[]; checkedAt: string;
};
export type MarketplaceSnapshot = {
  schemaVersion: 1; refreshedAt: string; source: string;
  entries: MarketplaceEntry[]; unavailableTopics: string[];
};

const DB_NAME = "athanoride-local-marketplace";
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "public-marketplace-v1";
const FALLBACK_KEY = "athanoride.marketplace.snapshot.v1";
export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
let refreshInFlight: Promise<MarketplaceSnapshot> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function loadMarketplaceSnapshot(): Promise<MarketplaceSnapshot | null> {
  try {
    const saved = await storeRequest<MarketplaceSnapshot | undefined>("readonly", (store) => store.get(SNAPSHOT_KEY));
    if (saved?.schemaVersion === 1 && Array.isArray(saved.entries)) return saved;
  } catch { /* browser may disable IndexedDB; use the resilient fallback */ }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    return saved && typeof saved === "object" && "schemaVersion" in saved && saved.schemaVersion === 1
      ? saved as MarketplaceSnapshot : null;
  } catch { return null; }
}

export async function saveMarketplaceSnapshot(snapshot: MarketplaceSnapshot): Promise<void> {
  try { await storeRequest("readwrite", (store) => store.put(snapshot, SNAPSHOT_KEY)); }
  catch { localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot)); }
}

export function marketplaceSnapshotIsStale(snapshot: MarketplaceSnapshot | null, now = Date.now()): boolean {
  if (!snapshot) return true;
  const updated = Date.parse(snapshot.refreshedAt);
  return !Number.isFinite(updated) || now - updated >= REFRESH_INTERVAL_MS;
}

export function refreshMarketplace(signal?: AbortSignal): Promise<MarketplaceSnapshot> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/marketplace/refresh`, {
      method: "POST", headers: { Accept: "application/json" }, signal, cache: "no-store",
    });
    if (!response.ok) throw new Error(`Marketplace refresh failed (${response.status}).`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("entries" in value) || !Array.isArray(value.entries)
      || !("refreshedAt" in value) || typeof value.refreshedAt !== "string") {
      throw new Error("Marketplace service returned an invalid snapshot.");
    }
    const snapshot = value as MarketplaceSnapshot;
    await saveMarketplaceSnapshot(snapshot);
    return snapshot;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
