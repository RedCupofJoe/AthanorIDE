"use client";

type WorkerReply =
  | { id: number; type: "progress"; message: string }
  | { id: number; type: "loaded" }
  | { id: number; type: "vectors"; vectors: number[][] }
  | { id: number; type: "error"; message: string };
type PendingRequest = { resolve: (value: number[][]) => void; reject: (reason: Error) => void; onProgress?: (message: string) => void };

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (typeof window === "undefined") throw new Error("Semantic search is available in the browser only.");
  if (!worker) {
    worker = new Worker(new URL("./mcp-semantic.worker.ts", import.meta.url), { type: "module", name: "athanor-mcp-semantic-search" });
    worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      if (event.data.type === "progress") { request.onProgress?.(event.data.message); return; }
      pending.delete(event.data.id);
      if (event.data.type === "error") request.reject(new Error(event.data.message));
      else request.resolve(event.data.type === "vectors" ? event.data.vectors : []);
    });
    worker.addEventListener("error", () => {
      for (const request of pending.values()) request.reject(new Error("The semantic-search worker stopped unexpectedly."));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
  }
  return worker;
}

function request(message: { type: "load" } | { type: "embed"; texts: string[] }, onProgress?: (message: string) => void): Promise<number[][]> {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    try { getWorker().postMessage({ ...message, id }); }
    catch (error) { pending.delete(id); reject(error instanceof Error ? error : new Error("Could not start semantic search.")); }
  });
}

export async function loadSemanticModel(onProgress?: (message: string) => void): Promise<void> {
  await request({ type: "load" }, onProgress);
}

export async function embedMcpSearchTexts(texts: string[], onProgress?: (message: string) => void): Promise<number[][]> {
  if (texts.length === 0) return [];
  return request({ type: "embed", texts }, onProgress);
}

/** Release model weights and WASM memory while retaining browser-cached model files. */
export function unloadSemanticModel(): void {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) request.reject(new Error("Semantic model was released from memory."));
  pending.clear();
}
