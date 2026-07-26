/** Vision lineage nodes: image input, preprocessor, and vision model. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const imageInputDefinition: NodeDefinition = {
  type: "vision.image_input",
  displayName: "Image Input",
  description:
    "Image Input is the vision pipeline source that declares a static image path or URI as an IMAGE output. Set path and MIME type in the inspector, then connect into preprocessors, vision models, or multimodal Big Blocks. It keeps the visual asset explicit in the architecture instead of implying images only in prose.",
  category: "vision",
  version: "1.0.0",
  icon: "image",
  exportKind: "vision",
  inputs: [],
  outputs: [portTemplate("image", "output", "IMAGE")],
  configurationFields: [
    {
      key: "imagePath",
      label: "Image path",
      description: "Local path or URI of the source image.",
      type: "string",
      required: true,
      defaultValue: "./assets/sample.png",
    },
    {
      key: "mimeType",
      label: "MIME type",
      description: "Expected image media type.",
      type: "select",
      required: true,
      defaultValue: "image/png",
      options: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    },
  ],
  documentation:
    "Best used for demos, golden fixtures, and documenting which assets a vision flow expects. The IDE does not decode pixels—export records path and MIME for out-of-band runtimes. Prefer multimodal UI or dataset loaders when images arrive dynamically from users or batches.",
};

export const imagePreprocessorDefinition: NodeDefinition = {
  type: "vision.image_preprocessor",
  displayName: "Image Preprocessor",
  description:
    "Image Preprocessor sits between IMAGE producers and consumers to declare resize, fit, and output format. Connect an Image Input or other IMAGE source, configure width/height/fit, and pass the normalized IMAGE downstream to Vision Model or classifiers. It makes preprocessing policy visible before inference.",
  category: "vision",
  version: "1.0.0",
  icon: "scan",
  exportKind: "vision",
  inputs: [portTemplate("image", "input", "IMAGE")],
  outputs: [portTemplate("image", "output", "IMAGE")],
  configurationFields: [
    {
      key: "width",
      label: "Width",
      description: "Target width in pixels (0 keeps original).",
      type: "number",
      required: true,
      defaultValue: 512,
    },
    {
      key: "height",
      label: "Height",
      description: "Target height in pixels (0 keeps original).",
      type: "number",
      required: true,
      defaultValue: 512,
    },
    {
      key: "fit",
      label: "Fit",
      description: "How the image is fit into the target box.",
      type: "select",
      required: true,
      defaultValue: "contain",
      options: ["contain", "cover", "stretch"],
    },
    {
      key: "outputFormat",
      label: "Output format",
      description: "Normalized output encoding.",
      type: "select",
      required: true,
      defaultValue: "png",
      options: ["png", "jpeg", "webp"],
    },
  ],
  documentation:
    "Use it when models require fixed geometry or when you want export docs to capture preprocessing contracts. Pixel transforms do not run in the IDE; this node is lineage for deployed pipelines. Skip it for architectures that already normalize images inside a Vision Model or Big Block stack.",
};

export const visionModelDefinition: NodeDefinition = {
  type: "vision.vision_model",
  displayName: "Vision Model",
  description:
    "Vision Model declares a caption, OCR, VQA, or classify task over an IMAGE input with an optional PROMPT. Connect Image Input/Preprocessor and optionally Prompt Template, set modelId and task, and take STRING text out. It documents which vision capability the architecture depends on.",
  category: "vision",
  version: "1.0.0",
  icon: "scan-eye",
  exportKind: "vision",
  inputs: [
    portTemplate("image", "input", "IMAGE"),
    portTemplate("prompt", "input", "PROMPT", { required: false }),
  ],
  outputs: [portTemplate("text", "output", "STRING")],
  configurationFields: [
    {
      key: "modelId",
      label: "Model id",
      description: "Vision model identifier or handle.",
      type: "string",
      required: true,
      defaultValue: "openai/gpt-4o-mini",
    },
    {
      key: "task",
      label: "Task",
      description: "Primary vision task.",
      type: "select",
      required: true,
      defaultValue: "caption",
      options: ["caption", "ocr", "vqa", "classify"],
    },
    {
      key: "maxTokens",
      label: "Max tokens",
      description: "Upper bound on generated text tokens.",
      type: "number",
      required: true,
      defaultValue: 256,
    },
  ],
  documentation:
    "Best used in fine-grained graphs where you want an explicit vision hop before agents or RAG. Inference is out of band—IDE Run skips lineage vision nodes. Prefer Image Classifier or Multimodal-RAG Big Blocks when you want an opinionated multi-tech composite instead of wiring atomic vision nodes.",
};

export const VISION_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  imageInputDefinition,
  imagePreprocessorDefinition,
  visionModelDefinition,
] as const;
