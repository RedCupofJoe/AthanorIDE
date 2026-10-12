/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";
import { MCP_EMBEDDING_MODEL, MCP_EMBEDDING_MODEL_REVISION } from "@/lib/mcp-semantic-config";

type FeaturePipeline = (texts: string | string[], options: { pooling: "mean"; normalize: true }) => Promise<{ data: Float32Array; dims: number[] }>;
type RequestMessage = { id: number; type: "load" } | { id: number; type: "embed"; texts: string[] };
const worker = self as unknown as DedicatedWorkerGlobalScope;
let extractor: FeaturePipeline | null = null;

async function loadModel(id: number): Promise<void> {
  if (extractor) return;
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  worker.postMessage({ id, type: "progress", message: "Loading the local semantic model…" });
  extractor = await pipeline("feature-extraction", MCP_EMBEDDING_MODEL, {
    dtype: "q8",
    revision: MCP_EMBEDDING_MODEL_REVISION,
    progress_callback: (event: { status?: string; progress?: number; file?: string }) => {
      if (event.status === "progress") {
        worker.postMessage({ id, type: "progress", message: `Downloading model files${typeof event.progress === "number" ? ` (${Math.round(event.progress)}%)` : ""}…` });
      } else if (event.status === "done") {
        worker.postMessage({ id, type: "progress", message: "Preparing the CPU model…" });
      }
    },
  }) as unknown as FeaturePipeline;
}

worker.addEventListener("message", (event: MessageEvent<RequestMessage>) => {
  const request = event.data;
  void (async () => {
    try {
      await loadModel(request.id);
      if (request.type === "load") {
        worker.postMessage({ id: request.id, type: "loaded" });
        return;
      }
      const vectors: number[][] = [];
      for (let start = 0; start < request.texts.length; start += 16) {
        const batch = request.texts.slice(start, start + 16);
        const output = await extractor?.(batch, { pooling: "mean", normalize: true });
        if (!output || output.dims.length < 2) throw new Error("The embedding model returned an invalid vector.");
        const width = output.dims[output.dims.length - 1] ?? 0;
        if (width < 1) throw new Error("The embedding model returned an empty vector.");
        for (let row = 0; row < batch.length; row += 1) {
          vectors.push(Array.from(output.data.slice(row * width, (row + 1) * width)));
        }
        worker.postMessage({ id: request.id, type: "progress", message: `Indexing local registry (${Math.min(start + batch.length, request.texts.length)}/${request.texts.length})…` });
      }
      worker.postMessage({ id: request.id, type: "vectors", vectors });
    } catch (error) {
      worker.postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : "Semantic search could not load the local model." });
    }
  })();
});

export {};
