/** Vision lineage nodes: image input, preprocessor, and vision model. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const imageInputDefinition: NodeDefinition = {
  type: "vision.image_input",
  displayName: "Image Input",
  description: "Provides a static image path or URI for vision pipelines.",
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
    "Image Input declares vision source lineage. Export documents the path and MIME type; decoding runs outside the IDE.",
};

export const imagePreprocessorDefinition: NodeDefinition = {
  type: "vision.image_preprocessor",
  displayName: "Image Preprocessor",
  description: "Configures resize and format normalization for an image stream.",
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
    "Image Preprocessor captures resize/format intent for export. It does not transform pixels inside the IDE.",
};

export const visionModelDefinition: NodeDefinition = {
  type: "vision.vision_model",
  displayName: "Vision Model",
  description: "Runs a vision model (caption, OCR, or VLM) over an image input.",
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
    "Vision Model declares inference lineage (model, task, token budget). Inference is out of band for this catalog slice.",
};

export const VISION_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  imageInputDefinition,
  imagePreprocessorDefinition,
  visionModelDefinition,
] as const;
