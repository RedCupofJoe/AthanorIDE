/** Fine-tuning lineage nodes: dataset loader and LoRA trainer. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const datasetLoaderDefinition: NodeDefinition = {
  type: "fine_tuning.dataset_loader",
  displayName: "Dataset Loader",
  description: "Loads a local or remote dataset for fine-tuning workflows.",
  category: "fine-tuning",
  version: "1.0.0",
  icon: "database",
  exportKind: "fine_tuning",
  inputs: [],
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
    "Dataset Loader declares training data lineage. Export documents the path and format; training execution is out of band for Phase 5.",
};

export const loraTrainerDefinition: NodeDefinition = {
  type: "fine_tuning.lora_trainer",
  displayName: "LoRA Trainer",
  description: "Configures a LoRA fine-tuning job over an incoming dataset.",
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
    "LoRA Trainer captures hyperparameters and dataset lineage for export. It does not launch training inside the IDE.",
};

export const FINE_TUNING_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  datasetLoaderDefinition,
  loraTrainerDefinition,
] as const;
