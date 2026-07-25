/**
 * Big Blocks — opinionated multi-technology composite nodes.
 *
 * Each block bundles popular open-source defaults, optional cloud URI + secret-name
 * bindings, and a bottom custom template for full overrides (local-first).
 */
import { portTemplate, type NodeDefinition } from "../types.js";
import {
  bigBlockCloudFields,
  bigBlockTemplateFields,
  defaultBigBlockTemplate,
  openSourceStackField,
} from "./shared.js";

function block(
  partial: Omit<NodeDefinition, "category" | "version" | "exportKind"> & {
    version?: string;
  },
): NodeDefinition {
  return {
    category: "big-blocks",
    version: partial.version ?? "1.0.0",
    exportKind: "big_blocks",
    ...partial,
  };
}

export const aiGatewayDefinition = block({
  type: "big_blocks.ai_gateway",
  displayName: "AI Gateway",
  description:
    "Opinionated AI gateway bundling routing, auth hooks, and provider adapters for local and cloud LLMs.",
  icon: "network",
  inputs: [
    portTemplate("request", "input", "PROMPT", { required: false }),
    portTemplate("tools", "input", "TOOL_DEFINITION", { required: false, multiple: true }),
  ],
  outputs: [
    portTemplate("response", "output", "STRING"),
    portTemplate("handle", "output", "MODEL_HANDLE"),
  ],
  configurationFields: [
    openSourceStackField(
      ["litellm", "kong-ai", "higress"],
      "litellm",
      "Gateway stack",
      "LiteLLM, Kong AI, or Higress — three common open-source AI gateway choices.",
    ),
    {
      key: "defaultModel",
      label: "Default model id",
      description: "Fallback model routed when callers omit one.",
      type: "string",
      required: true,
      defaultValue: "local/llama-3.2-3b",
    },
    ...bigBlockCloudFields({ defaultUri: "http://127.0.0.1:4000" }),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("ai_gateway", "litellm")),
  ],
  documentation:
    "AI Gateway is a Big Block for unified model access. Prefer local gateways; bind cloud providers via endpoint URI + token secret name. Customize fully with the template at the bottom.",
});

export const graphRagDefinition = block({
  type: "big_blocks.graphrag",
  displayName: "GraphRAG",
  description:
    "Graph-augmented RAG: extract entities/relations, store a knowledge graph, and answer with graph+vector retrieval.",
  icon: "git-fork",
  inputs: [
    portTemplate("documents", "input", "STRING", { required: false }),
    portTemplate("query", "input", "STRING"),
  ],
  outputs: [
    portTemplate("answer", "output", "STRING"),
    portTemplate("graph", "output", "JSON_SCHEMA", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["microsoft-graphrag", "neo4j-genai", "langchain-graph"],
      "microsoft-graphrag",
      "GraphRAG stack",
    ),
    {
      key: "graphStore",
      label: "Graph store",
      description: "Backing graph database for entities and relations.",
      type: "select",
      required: true,
      defaultValue: "neo4j",
      options: ["neo4j", "networkx", "kuzu"],
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("graphrag", "microsoft-graphrag")),
  ],
  documentation:
    "GraphRAG Big Block wires chunking, graph extraction, and hybrid retrieval. Local Neo4j/Kuzu by default; cloud URI optional.",
});

export const autoRagDefinition = block({
  type: "big_blocks.autorag",
  displayName: "AutoRAG",
  description:
    "Automated RAG pipeline that chooses chunking, embeddings, and retrieval settings from a corpus profile.",
  icon: "wand-sparkles",
  inputs: [
    portTemplate("corpus", "input", "DATASET", { required: false }),
    portTemplate("query", "input", "STRING"),
  ],
  outputs: [portTemplate("answer", "output", "STRING")],
  configurationFields: [
    openSourceStackField(
      ["haystack", "llamaindex", "ragflow"],
      "haystack",
      "AutoRAG stack",
    ),
    {
      key: "embeddingModel",
      label: "Embedding model",
      description: "Local-first embedding model id.",
      type: "string",
      required: true,
      defaultValue: "sentence-transformers/all-MiniLM-L6-v2",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("autorag", "haystack")),
  ],
  documentation:
    "AutoRAG picks sensible RAG defaults for a corpus. Override via cloud URI or the custom template.",
});

export const localS3BucketDefinition = block({
  type: "big_blocks.local_s3_bucket",
  displayName: "Auto Local S3 Bucket",
  description:
    "Connect to or stand up a local S3-compatible bucket (MinIO/Garage/SeaweedFS) with optional cloud S3 URI.",
  icon: "hard-drive",
  inputs: [portTemplate("objectKey", "input", "STRING", { required: false })],
  outputs: [
    portTemplate("bucketUri", "output", "FILE_REFERENCE"),
    portTemplate("object", "output", "FILE_REFERENCE", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["minio", "garage", "seaweedfs"],
      "minio",
      "S3-compatible stack",
    ),
    {
      key: "bucketName",
      label: "Bucket name",
      description: "Default bucket to create or attach.",
      type: "string",
      required: true,
      defaultValue: "athanor-artifacts",
    },
    {
      key: "autoProvision",
      label: "Auto-provision local bucket",
      description: "When local, attempt to create the bucket if missing.",
      type: "boolean",
      required: true,
      defaultValue: true,
    },
    ...bigBlockCloudFields({
      defaultProvider: "none",
      defaultUri: "http://127.0.0.1:9000",
    }),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("local_s3_bucket", "minio")),
  ],
  documentation:
    "Local-first object storage Big Block. Defaults to MinIO; point endpointUri at AWS S3 or another provider and set tokenSecretName for credentials.",
});

export const simpleUiChatbotDefinition = block({
  type: "big_blocks.simple_ui_chatbot",
  displayName: "Simple UI (Chatbot)",
  description:
    "Opinionated chatbot front-end wired to a local or cloud model runtime.",
  icon: "message-circle",
  inputs: [
    portTemplate("model", "input", "MODEL_HANDLE", { required: false }),
    portTemplate("system", "input", "PROMPT", { required: false }),
  ],
  outputs: [
    portTemplate("messages", "output", "EVENT"),
    portTemplate("uiSpec", "output", "JSON_SCHEMA", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["open-webui", "chatbot-ui", "librechat"],
      "open-webui",
      "Chat UI stack",
    ),
    {
      key: "title",
      label: "App title",
      description: "Displayed product name in the UI shell.",
      type: "string",
      required: true,
      defaultValue: "Athanor Chat",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("simple_ui_chatbot", "open-webui")),
  ],
  documentation:
    "Simple chatbot UI Big Block. Local Open WebUI / Chatbot UI / LibreChat presets; cloud endpoints optional.",
});

export const simpleUiMultimodalDefinition = block({
  type: "big_blocks.simple_ui_multimodal",
  displayName: "Simple UI Multi-modal",
  description:
    "Multi-modal input UI (text, image, audio, file) with opinionated preprocessing hooks.",
  icon: "images",
  inputs: [
    portTemplate("model", "input", "MODEL_HANDLE", { required: false }),
  ],
  outputs: [
    portTemplate("bundle", "output", "ANY"),
    portTemplate("events", "output", "EVENT"),
  ],
  configurationFields: [
    openSourceStackField(
      ["gradio", "streamlit", "mesop"],
      "gradio",
      "Multi-modal UI stack",
    ),
    {
      key: "acceptImage",
      label: "Accept images",
      type: "boolean",
      required: true,
      defaultValue: true,
      description: "Enable image upload controls.",
    },
    {
      key: "acceptAudio",
      label: "Accept audio",
      type: "boolean",
      required: true,
      defaultValue: true,
      description: "Enable audio upload/record controls.",
    },
    {
      key: "acceptVideo",
      label: "Accept video",
      type: "boolean",
      required: true,
      defaultValue: false,
      description: "Enable video upload controls.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("simple_ui_multimodal", "gradio")),
  ],
  documentation:
    "Multi-modal Simple UI Big Block for capturing mixed inputs before downstream RAG or classifiers.",
});

export const modelRuntimeDefinition = block({
  type: "big_blocks.model_runtime",
  displayName: "Model Runtime",
  description:
    "Most common open-source local model runtimes plus provider URI bindings.",
  icon: "cpu",
  inputs: [portTemplate("prompt", "input", "PROMPT", { required: false })],
  outputs: [
    portTemplate("handle", "output", "MODEL_HANDLE"),
    portTemplate("completion", "output", "STRING", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["ollama", "vllm", "llama-cpp"],
      "ollama",
      "Local runtime",
      "Ollama, vLLM, or llama.cpp — the three most common local open-source runtimes.",
    ),
    {
      key: "modelId",
      label: "Model id",
      description: "Local tag or provider model name.",
      type: "string",
      required: true,
      defaultValue: "llama3.2:3b",
    },
    {
      key: "providerUriPreset",
      label: "Provider URI preset",
      description: "Optional managed endpoint family when not pure-local.",
      type: "select",
      required: true,
      defaultValue: "none",
      options: [
        "none",
        "openai-compatible",
        "azure-openai",
        "bedrock",
        "vertex",
        "custom",
      ],
    },
    ...bigBlockCloudFields({ defaultUri: "http://127.0.0.1:11434" }),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("model_runtime", "ollama")),
  ],
  documentation:
    "Model Runtime Big Block for local OSS inference with optional OpenAI-compatible / hyperscaler URIs and secret-name tokens.",
});

export const imageClassifierDefinition = block({
  type: "big_blocks.image_classifier",
  displayName: "Image Classifier",
  description:
    "Opinionated image classification stack with local OSS models and optional cloud vision APIs.",
  icon: "scan-eye",
  inputs: [portTemplate("image", "input", "IMAGE")],
  outputs: [
    portTemplate("labels", "output", "JSON_SCHEMA"),
    portTemplate("topLabel", "output", "STRING"),
  ],
  configurationFields: [
    openSourceStackField(
      ["timm", "transformers-vit", "ultralytics-cls"],
      "timm",
      "Classifier stack",
    ),
    {
      key: "modelId",
      label: "Model id",
      type: "string",
      required: true,
      defaultValue: "resnet50",
      description: "Local checkpoint or hub id.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("image_classifier", "timm")),
  ],
  documentation:
    "Image Classifier Big Block. Local TIMM / ViT / Ultralytics presets; cloud vision URI optional.",
});

export const voiceToTextDefinition = block({
  type: "big_blocks.voice_to_text",
  displayName: "Voice-to-Text",
  description:
    "Speech-to-text Big Block with the most common open-source ASR stacks and cloud STT URIs.",
  icon: "mic",
  inputs: [portTemplate("audio", "input", "AUDIO")],
  outputs: [
    portTemplate("transcript", "output", "STRING"),
    portTemplate("segments", "output", "JSON_SCHEMA", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["whisper.cpp", "faster-whisper", "vosk"],
      "faster-whisper",
      "ASR stack",
    ),
    {
      key: "language",
      label: "Language",
      type: "string",
      required: true,
      defaultValue: "en",
      description: "BCP-47 language code or 'auto'.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("voice_to_text", "faster-whisper")),
  ],
  documentation:
    "Voice-to-Text Big Block. Prefer local Whisper variants; bind cloud STT via URI + secret name.",
});

export const soundClassifierDefinition = block({
  type: "big_blocks.sound_classifier",
  displayName: "Sound Classifier",
  description:
    "Environmental / event sound classification with popular open-source audio models.",
  icon: "audio-lines",
  inputs: [portTemplate("audio", "input", "AUDIO")],
  outputs: [
    portTemplate("labels", "output", "JSON_SCHEMA"),
    portTemplate("topLabel", "output", "STRING"),
  ],
  configurationFields: [
    openSourceStackField(
      ["yamnet", "panns", "beats"],
      "yamnet",
      "Sound classifier stack",
    ),
    {
      key: "topK",
      label: "Top-K labels",
      type: "number",
      required: true,
      defaultValue: 5,
      description: "How many class labels to emit.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("sound_classifier", "yamnet")),
  ],
  documentation:
    "Sound Classifier Big Block for non-speech audio events. Local YAMNet/PANNs/BEATs by default.",
});

export const agenticHarnessDefinition = block({
  type: "big_blocks.agentic_harness",
  displayName: "Agentic Harness",
  description:
    "Opinionated agent harness (Pi, Goose, OpenHarness, Omnigents, Archcon) with local and hyperscaler runtimes.",
  icon: "bot",
  inputs: [
    portTemplate("goal", "input", "PROMPT"),
    portTemplate("tools", "input", "TOOL_DEFINITION", { required: false, multiple: true }),
    portTemplate("mcp", "input", "MCP_SERVER", { required: false, multiple: true }),
  ],
  outputs: [
    portTemplate("run", "output", "EVENT"),
    portTemplate("result", "output", "STRING", { required: false }),
  ],
  configurationFields: [
    {
      key: "harness",
      label: "Harness",
      description: "Which agentic harness to assemble.",
      type: "select",
      required: true,
      defaultValue: "goose",
      options: ["pi", "goose", "openharness", "omnigents", "archcon"],
    },
    openSourceStackField(
      ["openclaw", "crewai", "autogen"],
      "openclaw",
      "Companion OSS agent framework",
      "Supporting open-source agent framework paired with the harness selection.",
    ),
    {
      key: "harnessRuntime",
      label: "Harness runtime",
      description: "Where the harness process runs — local-first, hyperscalers opt-in.",
      type: "select",
      required: true,
      defaultValue: "local",
      options: [
        "local",
        "docker",
        "kubernetes",
        "aws",
        "azure",
        "gcp",
        "custom",
      ],
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("agentic_harness", "goose")),
  ],
  documentation:
    "Agentic Harness Big Block. Choose Pi/Goose/OpenHarness/Omnigents/Archcon, pair with a local OSS agent framework, and optionally target hyperscaler runtimes via URI + secret name.",
});

export const videoToRagDefinition = block({
  type: "big_blocks.video_to_rag",
  displayName: "Video-to-RAG",
  description:
    "Ingest video, extract frames/transcripts, index for retrieval-augmented answering.",
  icon: "video",
  inputs: [
    portTemplate("video", "input", "VIDEO"),
    portTemplate("query", "input", "STRING", { required: false }),
  ],
  outputs: [
    portTemplate("index", "output", "DATASET"),
    portTemplate("answer", "output", "STRING", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["whisper-ffmpeg-llamaindex", "videodb", "twelve-open"],
      "whisper-ffmpeg-llamaindex",
      "Video-to-RAG stack",
    ),
    {
      key: "frameIntervalSeconds",
      label: "Frame interval (s)",
      type: "number",
      required: true,
      defaultValue: 5,
      description: "Seconds between sampled frames for visual indexing.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(
      defaultBigBlockTemplate("video_to_rag", "whisper-ffmpeg-llamaindex"),
    ),
  ],
  documentation:
    "Video-to-RAG Big Block: local ffmpeg + ASR + indexer presets, optional cloud media APIs.",
});

export const audioToRagDefinition = block({
  type: "big_blocks.audio_to_rag",
  displayName: "Audio-to-RAG",
  description:
    "Transcribe and chunk audio into a retrievable corpus for grounded Q&A.",
  icon: "headphones",
  inputs: [
    portTemplate("audio", "input", "AUDIO"),
    portTemplate("query", "input", "STRING", { required: false }),
  ],
  outputs: [
    portTemplate("index", "output", "DATASET"),
    portTemplate("answer", "output", "STRING", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["whisper-haystack", "speechbrain-rag", "nemo-asr-rag"],
      "whisper-haystack",
      "Audio-to-RAG stack",
    ),
    {
      key: "chunkSeconds",
      label: "Chunk length (s)",
      type: "number",
      required: true,
      defaultValue: 30,
      description: "Transcript chunk size before embedding.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("audio_to_rag", "whisper-haystack")),
  ],
  documentation:
    "Audio-to-RAG Big Block for podcasts/calls/meetings. Local ASR + RAG stack by default.",
});

export const multimodalRagDefinition = block({
  type: "big_blocks.multimodal_rag",
  displayName: "Multimodal-RAG",
  description:
    "Unified RAG over text, image, audio, and video with a shared retrieval plane.",
  icon: "layers",
  inputs: [
    portTemplate("query", "input", "STRING"),
    portTemplate("text", "input", "STRING", { required: false }),
    portTemplate("image", "input", "IMAGE", { required: false }),
    portTemplate("audio", "input", "AUDIO", { required: false }),
    portTemplate("video", "input", "VIDEO", { required: false }),
  ],
  outputs: [portTemplate("answer", "output", "STRING")],
  configurationFields: [
    openSourceStackField(
      ["colpali-rag", "llava-rag", "unstructured-mm"],
      "colpali-rag",
      "Multimodal RAG stack",
    ),
    {
      key: "fusion",
      label: "Fusion strategy",
      type: "select",
      required: true,
      defaultValue: "late",
      options: ["early", "late", "hybrid"],
      description: "How modalities are fused before answering.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(defaultBigBlockTemplate("multimodal_rag", "colpali-rag")),
  ],
  documentation:
    "Multimodal-RAG Big Block for mixed corpora. Opinionated local fusion; cloud VLMs via URI + secret name.",
});

export const videoChunkingIcLoraDefinition = block({
  type: "big_blocks.video_chunking_ic_lora",
  displayName: "Video-Chunking for IC LoRA",
  description:
    "Chunk video into instruction-compatible clips/frames for image/video LoRA fine-tuning datasets.",
  icon: "clapperboard",
  inputs: [portTemplate("video", "input", "VIDEO")],
  outputs: [
    portTemplate("dataset", "output", "DATASET"),
    portTemplate("manifest", "output", "JSON_SCHEMA", { required: false }),
  ],
  configurationFields: [
    openSourceStackField(
      ["ffmpeg-clips", "decord-sampler", "torchvision-io"],
      "ffmpeg-clips",
      "Chunking stack",
    ),
    {
      key: "clipSeconds",
      label: "Clip length (s)",
      type: "number",
      required: true,
      defaultValue: 4,
      description: "Duration of each training clip.",
    },
    {
      key: "strideSeconds",
      label: "Stride (s)",
      type: "number",
      required: true,
      defaultValue: 2,
      description: "Overlap stride between clips.",
    },
    {
      key: "instructionTemplate",
      label: "IC instruction template",
      type: "text",
      required: true,
      defaultValue: "Describe the visual content of this clip for LoRA training.",
      description: "Instruction-compatible caption/prompt template per chunk.",
    },
    ...bigBlockCloudFields(),
    ...bigBlockTemplateFields(
      defaultBigBlockTemplate("video_chunking_ic_lora", "ffmpeg-clips"),
    ),
  ],
  documentation:
    "Video-Chunking for IC LoRA prepares instruction-compatible datasets from video. Connect Dataset output to LoRA Trainer or export lineage.",
});

export const BIG_BLOCKS_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  aiGatewayDefinition,
  graphRagDefinition,
  autoRagDefinition,
  localS3BucketDefinition,
  simpleUiChatbotDefinition,
  simpleUiMultimodalDefinition,
  modelRuntimeDefinition,
  imageClassifierDefinition,
  voiceToTextDefinition,
  soundClassifierDefinition,
  agenticHarnessDefinition,
  videoToRagDefinition,
  audioToRagDefinition,
  multimodalRagDefinition,
  videoChunkingIcLoraDefinition,
] as const;
