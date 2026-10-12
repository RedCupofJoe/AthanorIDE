# MCP Registry Search

The MCP import panel supports online registry lookup plus two browser-local search modes. Online lookup fetches metadata from the registry URL shown in the panel. It does not execute server commands, install packages, or send credentials.

## CPU keyword and topic search

Keyword search is the default. It runs entirely in the browser and has no model download or backend requirement. Search matches server names, descriptions, transport, package identifiers, endpoint text, and inferred topic tags. Name and topic matches rank above description matches. Topic tags are shown on each result, and queries can use filters such as `topic:database` or `transport:stdio`.

The local index contains up to 500 server variants fetched from a registry in this browser. Search online to add more registry results to that index. Once indexed, keyword search works offline. The index is stored in IndexedDB; if browser storage is unavailable, results remain usable for the current page session.

## Optional local semantic search

Semantic mode uses the Apache-2.0 [`Xenova/all-MiniLM-L6-v2`](https://huggingface.co/Xenova/all-MiniLM-L6-v2) text embedding model through [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js). The quantized ONNX weights are about 23 MB. The model is downloaded only when the user first searches semantically, runs in a dedicated Web Worker on CPU/WASM, and does not send queries or registry descriptions to an inference service. Registry metadata must already be in the local index for offline semantic search.

The browser Cache API stores downloaded model files and IndexedDB stores per-server embedding vectors. This avoids re-downloading or recomputing the index in normal browser sessions. The worker holds the loaded model in memory while the import panel is open. Use **Release model from memory** to free its runtime memory while retaining the cached files and vectors; closing the panel releases it automatically. Clearing site storage removes the local index, vectors, and model cache.

The first model download requires access to Hugging Face model hosting. After successful caching, semantic search can run offline for the cached registry entries. If the model cannot load, the panel reports the problem and CPU keyword search remains available. Model revision `751bff3` and the Transformers.js dependency are pinned in source and the workspace lockfile.

## Privacy and limits

Both local search modes only rank already-cached public metadata. Search strings are not submitted to the registry in local mode. Select **Search registry online** to query the configured registry explicitly. The cache is browser-local and bounded to 500 server variants; online registry pagination is still available for larger searches. Imported server manifests are also metadata-only and retain the existing credential-scrubbing behavior.
