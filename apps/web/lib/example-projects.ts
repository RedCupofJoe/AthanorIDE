/**
 * Built-in example architecture graphs (RAG, vision fine-tuning, text transform).
 */
import {
  createEmptyGraph,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
} from "@athanor/contracts";
import { createNodeFromDefinition } from "@athanor/node-definitions";

export type ExampleProjectDefinition = {
  id: string;
  name: string;
  description: string;
  build: () => ArchitectureGraph;
};

function edge(
  id: string,
  source: ArchitectureNode,
  sourcePortName: string,
  target: ArchitectureNode,
  targetPortName: string,
): ArchitectureEdge {
  const sourcePort = source.outputs.find((port) => port.name === sourcePortName);
  const targetPort = target.inputs.find((port) => port.name === targetPortName);
  if (!sourcePort || !targetPort) {
    throw new Error(`Missing ports for edge ${id}`);
  }
  return {
    id,
    sourceNodeId: source.id,
    sourcePortId: sourcePort.id,
    targetNodeId: target.id,
    targetPortId: targetPort.id,
  };
}

function stampProject(
  name: string,
  description: string,
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
): ArchitectureGraph {
  const graph = createEmptyGraph(name);
  return {
    ...graph,
    project: {
      ...graph.project,
      description,
    },
    nodes,
    edges,
    viewport: { x: 40, y: 40, zoom: 0.85 },
  };
}

function buildRagPipeline(): ArchitectureGraph {
  const query = createNodeFromDefinition("foundation.text_input", { x: 40, y: 80 }, {
    name: "User query",
    configuration: { value: "What are the refund policies for enterprise plans?" },
  });
  const corpus = createNodeFromDefinition("foundation.json_input", { x: 40, y: 280 }, {
    name: "Knowledge chunks",
    configuration: {
      json: JSON.stringify(
        {
          chunks: [
            { id: "c1", text: "Enterprise refunds within 30 days." },
            { id: "c2", text: "Support SLA is 4 hours for P1." },
          ],
        },
        null,
        2,
      ),
    },
  });
  const prompt = createNodeFromDefinition("foundation.prompt_template", { x: 320, y: 80 }, {
    name: "RAG prompt",
    configuration: {
      template:
        "Use only the retrieved context to answer.\n\nQuestion:\n{{input}}\n\nCite chunk ids when possible.",
    },
  });
  const retrieve = createNodeFromDefinition(
    "foundation.python_transform",
    { x: 600, y: 160 },
    {
      name: "Retrieve + answer",
      configuration: {
        instruction:
          "Retrieve the most relevant knowledge chunks for the question, then draft a grounded answer.",
      },
    },
  );
  const guardrail = createNodeFromDefinition(
    "enterprise.policy_guardrail",
    { x: 880, y: 160 },
    {
      name: "Grounding policy",
      configuration: {
        policyName: "rag-grounding",
        mode: "block",
        rules: "- Block answers without retrieved context\n- Warn on speculative claims",
      },
    },
  );
  const viewer = createNodeFromDefinition("foundation.output_viewer", { x: 1160, y: 160 }, {
    name: "Answer",
  });
  const vectorUrl = createNodeFromDefinition(
    "foundation.environment_variable",
    { x: 320, y: 320 },
    {
      name: "Vector store URL",
      configuration: { name: "VECTOR_STORE_URL", exampleValue: "http://127.0.0.1:6333" },
    },
  );
  const apiSecret = createNodeFromDefinition(
    "foundation.secret_reference",
    { x: 560, y: 320 },
    {
      name: "Embeddings API key",
      configuration: { secretName: "EMBEDDINGS_API_KEY", provider: "env" },
    },
  );
  const tool = createNodeFromDefinition("multi_agent.tool_definition", { x: 800, y: 320 }, {
    name: "Search tool",
    configuration: {
      toolName: "vector_search",
      description: "Search the vector index for relevant chunks.",
      inputSchema: JSON.stringify(
        {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        null,
        2,
      ),
    },
  });

  const nodes = [query, corpus, prompt, retrieve, guardrail, viewer, vectorUrl, apiSecret, tool];
  const edges = [
    edge("e-query-prompt", query, "text", prompt, "variables"),
    edge("e-query-retrieve", query, "text", retrieve, "text"),
    edge("e-retrieve-policy", retrieve, "text", guardrail, "text"),
    edge("e-policy-view", guardrail, "text", viewer, "text"),
  ];

  return stampProject(
    "Example · RAG pipeline",
    "Query → prompt → retrieve/answer transform → policy guardrail → viewer, with vector-store and tool lineage.",
    nodes,
    edges,
  );
}

function buildVisionFineTunePipeline(): ArchitectureGraph {
  const dataset = createNodeFromDefinition("fine_tuning.dataset_loader", { x: 40, y: 60 }, {
    name: "Vision dataset",
    configuration: {
      datasetPath: "./data/vision/train.jsonl",
      format: "jsonl",
    },
  });
  const trainer = createNodeFromDefinition("fine_tuning.lora_trainer", { x: 320, y: 60 }, {
    name: "Vision LoRA trainer",
    configuration: {
      baseModel: "openai/clip-vit-base-patch32",
      epochs: 3,
      batchSize: 8,
      learningRate: 0.0001,
      rank: 16,
      alpha: 32,
      precision: "bf16",
      gradientAccumulation: 2,
      checkpointInterval: 200,
      outputPath: "./artifacts/vision-lora",
    },
  });
  const image = createNodeFromDefinition("vision.image_input", { x: 40, y: 280 }, {
    name: "Sample image",
    configuration: {
      imagePath: "./assets/sample.png",
      mimeType: "image/png",
    },
  });
  const preprocess = createNodeFromDefinition(
    "vision.image_preprocessor",
    { x: 320, y: 280 },
    {
      name: "Resize / normalize",
      configuration: {
        width: 224,
        height: 224,
        fit: "cover",
        outputFormat: "png",
      },
    },
  );
  const model = createNodeFromDefinition("vision.vision_model", { x: 600, y: 280 }, {
    name: "Vision model",
    configuration: {
      modelId: "openai/clip-vit-base-patch32",
      task: "caption",
      maxTokens: 128,
    },
  });
  const viewer = createNodeFromDefinition("foundation.output_viewer", { x: 880, y: 280 }, {
    name: "Caption output",
  });
  const gpu = createNodeFromDefinition(
    "foundation.environment_variable",
    { x: 320, y: 460 },
    {
      name: "GPU count",
      configuration: { name: "ATHANOR_GPU_COUNT", exampleValue: "1" },
    },
  );

  // Vision model text output → viewer (STRING). Prompt port left optional/unwired.
  // Image chain: image → preprocessor → vision model
  const nodes = [dataset, trainer, image, preprocess, model, viewer, gpu];
  const edges = [
    edge("e-ds-lora", dataset, "dataset", trainer, "dataset"),
    edge("e-img-pre", image, "image", preprocess, "image"),
    edge("e-pre-model", preprocess, "image", model, "image"),
    edge("e-model-view", model, "text", viewer, "text"),
  ];

  return stampProject(
    "Example · Vision fine-tuning",
    "Dataset → LoRA trainer lineage plus an image preprocess → vision model → viewer inference path.",
    nodes,
    edges,
  );
}

function buildTextTransformPipeline(): ArchitectureGraph {
  const input = createNodeFromDefinition("foundation.text_input", { x: 40, y: 120 }, {
    name: "Text Input",
    configuration: { value: "hello athanor" },
  });
  const transform = createNodeFromDefinition(
    "foundation.python_transform",
    { x: 320, y: 120 },
    {
      name: "Python Transformation",
      configuration: { instruction: "uppercase the input" },
    },
  );
  const viewer = createNodeFromDefinition("foundation.output_viewer", { x: 600, y: 120 }, {
    name: "Output Viewer",
  });
  return stampProject(
    "Example · Text transform",
    "Minimal Text Input → Python Transform → Output Viewer starter.",
    [input, transform, viewer],
    [edge("e1", input, "text", transform, "text"), edge("e2", transform, "text", viewer, "text")],
  );
}

export const EXAMPLE_PROJECTS: readonly ExampleProjectDefinition[] = [
  {
    id: "rag-pipeline",
    name: "RAG pipeline",
    description:
      "Grounded Q&A flow with prompt, retrieve/answer transform, policy guardrail, and retrieval lineage.",
    build: buildRagPipeline,
  },
  {
    id: "vision-finetune",
    name: "Vision fine-tuning",
    description:
      "LoRA training lineage paired with an image preprocess → vision model inference path.",
    build: buildVisionFineTunePipeline,
  },
  {
    id: "text-transform",
    name: "Text transform",
    description: "Classic three-node text pipeline for quick smoke tests.",
    build: buildTextTransformPipeline,
  },
] as const;

export function buildExampleProject(exampleId: string): ArchitectureGraph | null {
  const example = EXAMPLE_PROJECTS.find((item) => item.id === exampleId);
  return example ? example.build() : null;
}
