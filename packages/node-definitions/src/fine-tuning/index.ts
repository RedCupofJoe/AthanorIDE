/** Fine-tuning lineage nodes: dataset loader and LoRA trainer. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const datasetLoaderDefinition: NodeDefinition = {
  type: "fine_tuning.dataset_loader",
  displayName: "Dataset Loader",
  description:
    "Dataset Loader declares a training dataset as a DATASET output for fine-tuning graphs. Point it at a path or URI, choose a format (jsonl, csv, parquet, or Hugging Face), and connect the output into LoRA Trainer or other training consumers. It makes data lineage visible on the canvas so architects can see what feeds adaptation jobs.",
  category: "fine-tuning",
  version: "1.0.0",
  icon: "database",
  exportKind: "fine_tuning",
  inputs: [
    portTemplate("sourceUri", "input", "STRING", { required: false }),
    portTemplate("sourceText", "input", "STRING", { required: false, multiple: true }),
    portTemplate("sourceSchema", "input", "JSON_SCHEMA", { required: false }),
    portTemplate("sourceDataset", "input", "DATASET", { required: false }),
    portTemplate("sourceFile", "input", "FILE_REFERENCE", { required: false }),
  ],
  outputs: [portTemplate("dataset", "output", "DATASET")],
  configurationFields: [
    {
      key: "datasetPath",
      label: "Dataset path",
      description: "Path or URI of the training dataset.",
      type: "string",
      required: true,
      defaultValue: "./data/train.jsonl",
    },
    {
      key: "format",
      label: "Format",
      description: "Dataset serialization format.",
      type: "select",
      required: true,
      defaultValue: "jsonl",
      options: ["jsonl", "csv", "parquet", "huggingface"],
    },
  ],
  documentation:
    "Best used at the start of fine-tuning or evaluation subgraphs when the corpus should be part of the architecture record. The IDE does not download or shuffle data—export documents path and format for out-of-band training. Prefer Web-to-Markdown or Video-Chunking Big Blocks when you still need to produce the dataset before loading it.",
};

export const loraTrainerDefinition: NodeDefinition = {
  type: "fine_tuning.lora_trainer",
  displayName: "LoRA Trainer",
  description:
    "LoRA Trainer configures a LoRA adaptation job over an incoming DATASET and emits MODEL_WEIGHTS lineage. Connect Dataset Loader (or compatible producers), set base model, rank, learning rate, and output path, then export the hyperparameters with the architecture. It captures training intent without launching GPUs inside the IDE.",
  category: "fine-tuning",
  version: "1.0.0",
  icon: "sparkles",
  exportKind: "fine_tuning",
  inputs: [portTemplate("dataset", "input", "DATASET")],
  outputs: [portTemplate("weights", "output", "MODEL_WEIGHTS")],
  configurationFields: [
    {
      key: "baseModel",
      label: "Base model",
      description: "Base model identifier or path.",
      type: "string",
      required: true,
      defaultValue: "meta-llama/Llama-3.2-1B",
    },
    {
      key: "epochs",
      label: "Epochs",
      description: "Number of training epochs.",
      type: "number",
      required: true,
      defaultValue: 3,
    },
    {
      key: "batchSize",
      label: "Batch size",
      description: "Per-device train batch size.",
      type: "number",
      required: true,
      defaultValue: 4,
    },
    {
      key: "learningRate",
      label: "Learning rate",
      description: "Optimizer learning rate.",
      type: "number",
      required: true,
      defaultValue: 0.0002,
    },
    {
      key: "rank",
      label: "LoRA rank",
      description: "LoRA rank (r).",
      type: "number",
      required: true,
      defaultValue: 8,
    },
    {
      key: "alpha",
      label: "LoRA alpha",
      description: "LoRA scaling alpha.",
      type: "number",
      required: true,
      defaultValue: 16,
    },
    {
      key: "precision",
      label: "Precision",
      description: "Training numeric precision.",
      type: "select",
      required: true,
      defaultValue: "bf16",
      options: ["fp32", "fp16", "bf16"],
    },
    {
      key: "gradientAccumulation",
      label: "Gradient accumulation",
      description: "Gradient accumulation steps.",
      type: "number",
      required: true,
      defaultValue: 1,
    },
    {
      key: "checkpointInterval",
      label: "Checkpoint interval",
      description: "Steps between checkpoints.",
      type: "number",
      required: true,
      defaultValue: 500,
    },
    {
      key: "outputPath",
      label: "Output path",
      description: "Directory for adapter weights.",
      type: "string",
      required: true,
      defaultValue: "./artifacts/lora",
    },
  ],
  documentation:
    "Use it when you need an auditable LoRA recipe tied to a specific dataset node—product adapters, domain jargon, or IC LoRA from video chunks. Training execution remains out of band; pair with Model Runtime or Vision Model nodes to show where adapted weights will be consumed after training.",
};

export const FINE_TUNING_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  datasetLoaderDefinition,
  loraTrainerDefinition,
] as const;
