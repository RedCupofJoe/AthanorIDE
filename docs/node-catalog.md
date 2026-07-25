# Node catalog

Authoritative definitions live in `packages/node-definitions` (TypeScript) and are mirrored for the API in `apps/api/athanor_api/catalog.py`.

Each node has:

- **Typed ports** — `contractType` must match when connecting (exact match or `ANY`)
- **Configuration fields** — edited in the right-hand inspector
- **Export kind** — how the exporter records the node in generated docs / code stubs
- **IDE execution** — whether **Run** can produce payloads (many category nodes are lineage-only)

---

## Foundation

### Text Input (`foundation.text_input`)

Static string source. Connect its `text` (STRING) output to transforms, prompts, or viewers.

**Config:** `value` — sample or default text.

**Run:** Emits `value` (or Run override text for the first root text input).

### JSON Input (`foundation.json_input`)

Static JSON document emitted as a STRING payload (serialized JSON text).

**Config:** `json` — must be valid JSON at validate time.

### Prompt Template (`foundation.prompt_template`)

Builds a PROMPT from a template. Optional `variables` (STRING) substitutes into `{{input}}`.

**Config:** `template` — prompt body.

**Run:** Renders template with upstream text when connected.

### Python Transformation (`foundation.python_transform`)

Natural-language instruction describing a text transform. Prefer **Compile transform** before production export.

**Ports:** `text` in/out (STRING).

**Config:** `instruction`; optional `compiledCode` / compile audit fields after compile.

**Run:** Sandboxed compiled code when present; otherwise deterministic classifier (`uppercase` / `lowercase` / `strip` / `identity`).

### HTTP Request (`foundation.http_request`)

Declares an HTTP client for export stubs.

**Config:** `url`, `method`, `timeoutSeconds`.

**Run:** Skipped by default (no host network).

### Output Viewer (`foundation.output_viewer`)

Pipeline sink. Displays the connected STRING payload in Run results.

### Portal Input / Portal Output (`foundation.portal_input` / `foundation.portal_output`)

Logical bus hop. Matching `busId` pairs publish/consume without a drawn edge. Scope: project / macro / deployment.

### Environment Variable (`foundation.environment_variable`)

Named env binding for runtime/export (`.env.example`). Not for secrets.

**Config:** `name`, optional `exampleValue`.

### Secret Reference (`foundation.secret_reference`)

References a secret by name + provider. **Never embed secret values** in the graph.

**Run:** Returns `[redacted:name]` only.

---

## Fine-tuning

### Dataset Loader (`fine_tuning.dataset_loader`)

Declares training data path/format (DATASET out). Lineage for export; not executed in IDE Run.

### LoRA Trainer (`fine_tuning.lora_trainer`)

Hyperparameters + DATASET in → MODEL_WEIGHTS out. Captures training intent; does not launch training in the IDE.

---

## Vision

### Image Input (`vision.image_input`)

Image path/URI source (IMAGE out). Lineage / future inference.

### Image Preprocessor (`vision.image_preprocessor`)

Resize/format intent (IMAGE → IMAGE). Config: width, height, fit, outputFormat.

### Vision Model (`vision.vision_model`)

Caption / OCR / VQA / classify lineage (IMAGE + optional PROMPT → STRING). Inference is out of band for IDE Run.

---

## Multi-agent

### Agent (`multi_agent.agent`)

Role, system prompt, model id (PROMPT/tools in → MODEL_HANDLE / EVENT out). Does not invoke models in the IDE.

### Tool Definition (`multi_agent.tool_definition`)

JSON Schema tool contract (TOOL_DEFINITION out). `inputSchema` must be valid JSON object text.

### MCP Server (`multi_agent.mcp_server`)

MCP endpoint/transport lineage (MCP_SERVER out). IDE does not open the connection.

---

## Enterprise

### Policy Guardrail (`enterprise.policy_guardrail`)

Content policy rules (STRING → STRING). Enforcement is for deployed runtimes; IDE Run skips category lineage nodes.

### Audit Log (`enterprise.audit_log`)

Compliance sink (EVENT in). Retention/sink config for export docs.

### Identity Reference (`enterprise.identity_reference`)

Public IdP client identifiers only. Rejects embedded credentials (`clientSecret`, etc.).

---

## Big Blocks

Opinionated multi-technology composites. Each includes three popular open-source stack options, optional cloud URI + **token secret name** (never the token), and a bottom **custom template** for full overrides. Local-first by default. IDE **Run** skips these nodes (lineage/export).

| Type | Display name | Default OSS trio (examples) |
| --- | --- | --- |
| `big_blocks.ai_gateway` | AI Gateway | LiteLLM, Kong AI, Higress |
| `big_blocks.graphrag` | GraphRAG | Microsoft GraphRAG, Neo4j GenAI, LangChain Graph |
| `big_blocks.autorag` | AutoRAG | Haystack, LlamaIndex, RAGFlow |
| `big_blocks.local_s3_bucket` | Auto Local S3 Bucket | MinIO, Garage, SeaweedFS |
| `big_blocks.simple_ui_chatbot` | Simple UI (Chatbot) | Open WebUI, Chatbot UI, LibreChat |
| `big_blocks.simple_ui_multimodal` | Simple UI Multi-modal | Gradio, Streamlit, Mesop |
| `big_blocks.model_runtime` | Model Runtime | Ollama, vLLM, llama.cpp |
| `big_blocks.image_classifier` | Image Classifier | TIMM, Transformers ViT, Ultralytics |
| `big_blocks.voice_to_text` | Voice-to-Text | Whisper.cpp, faster-whisper, Vosk |
| `big_blocks.sound_classifier` | Sound Classifier | YAMNet, PANNs, BEATs |
| `big_blocks.agentic_harness` | Agentic Harness | Pi, Goose, OpenHarness, Omnigents, Archcon (+ local/hyperscaler runtimes) |
| `big_blocks.video_to_rag` | Video-to-RAG | ffmpeg+Whisper+LlamaIndex-style stacks |
| `big_blocks.audio_to_rag` | Audio-to-RAG | Whisper+Haystack-style stacks |
| `big_blocks.multimodal_rag` | Multimodal-RAG | ColPali / LLaVA / Unstructured-style |
| `big_blocks.video_chunking_ic_lora` | Video-Chunking for IC LoRA | ffmpeg / Decord / TorchVision IO |

Shared fields on every Big Block: `deploymentMode`, `cloudProvider`, `endpointUri`, `tokenSecretName`, `useCustomTemplate`, `customTemplate`.

---

## Contract types (common)

| Type | Typical use |
| --- | --- |
| STRING | Text payloads |
| PROMPT | Prompt templates / agent prompts |
| IMAGE | Vision pipelines |
| DATASET / MODEL_WEIGHTS | Fine-tuning lineage |
| TOOL_DEFINITION / MCP_SERVER / MODEL_HANDLE / EVENT | Multi-agent designs |
| ANY | Wildcard (prefer explicit types) |

Compatibility: exact match, or either side `ANY`. No silent coercion.

## Adding a node

See [packages/node-definitions/README.md](../packages/node-definitions/README.md): define in TypeScript, mirror in `catalog.py`, add validation/export/execution behavior as needed, then tests.
