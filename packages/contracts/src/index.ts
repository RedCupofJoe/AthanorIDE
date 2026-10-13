/**
 * Canonical architecture-graph Zod schemas, types, and empty-graph factory.
 * Mirrors packages/contracts/schema/architecture-graph.v1.schema.json.
 */
import { z } from "zod";

/** Persisted schema version. Must match packages/contracts/schema/architecture-graph.v1.schema.json */
export const SCHEMA_VERSION = "1.0.0" as const;

export const ContractTypeSchema = z.enum([
  "STRING",
  "PROMPT",
  "MODEL_HANDLE",
  "MODEL_WEIGHTS",
  "VECTOR_EMBEDDING",
  "DATABASE_HANDLE",
  "TOOL_DEFINITION",
  "MCP_SERVER",
  "SANDBOX_POLICY",
  "SANDBOX_RUNTIME",
  "GUARDRAIL",
  "MCP_RESOURCE",
  "MCP_PROMPT",
  "STREAMING_PAYLOAD",
  "JSON_SCHEMA",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "TENSOR",
  "FILE_REFERENCE",
  "DATASET",
  "EVENT",
  "ANY",
]);

export type ContractType = z.infer<typeof ContractTypeSchema>;

export const NodePortSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(["input", "output"]),
  contractType: ContractTypeSchema,
  required: z.boolean(),
  multiple: z.boolean(),
  schema: z.record(z.unknown()).optional(),
});

export type NodePort = z.infer<typeof NodePortSchema>;

export const ArchitectureNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  configuration: z.record(z.unknown()),
  inputs: z.array(NodePortSchema),
  outputs: z.array(NodePortSchema),
  deploymentTarget: z.string().optional(),
  parentMacroId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ArchitectureNode = z.infer<typeof ArchitectureNodeSchema>;

export const ArchitectureEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPortId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type ArchitectureEdge = z.infer<typeof ArchitectureEdgeSchema>;

export const ProjectMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const ValidationIssueSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  nodeId: z.string().nullable().optional(),
  edgeId: z.string().nullable().optional(),
  suggestedAction: z.string().nullable().optional(),
});

export const ViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

export const DeploymentEnvironmentKindSchema = z.enum([
  "LOCAL_WORKSTATION",
  "ON_PREMISES",
  "OPENSHIFT",
  "KUBERNETES",
  "AWS_GPU",
  "GCP_CLOUD_RUN",
  "AZURE_CONTAINER_APPS",
  "EDGE_DEVICE",
  "RASPBERRY_PI",
  "AIR_GAPPED_ENVIRONMENT",
]);

export const InfrastructureTokenKindSchema = z.enum([
  "huggingface",
  "kaggle",
  "docker",
  "github",
  "uci_ml",
  "pytorch_hub",
  "custom",
]);

export type InfrastructureTokenKind = z.infer<typeof InfrastructureTokenKindSchema>;

export const InfrastructureTokenSlotSchema = z.object({
  id: z.string().min(1),
  kind: InfrastructureTokenKindSchema,
  label: z.string().min(1),
  /** Secret name only — never the token value. */
  secretName: z.string(),
  provider: z.enum(["env", "file", "vault", "cloud_secret_manager"]).default("env"),
  recommendedEnvName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type InfrastructureTokenSlot = z.infer<typeof InfrastructureTokenSlotSchema>;

/** Built-in infrastructure pull-token providers shown by default. */
export const DEFAULT_INFRASTRUCTURE_TOKEN_KINDS = [
  { kind: "huggingface", label: "Hugging Face", recommendedEnvName: "HF_TOKEN" },
  { kind: "kaggle", label: "Kaggle", recommendedEnvName: "KAGGLE_KEY" },
  { kind: "docker", label: "Docker Hub", recommendedEnvName: "DOCKERHUB_TOKEN" },
  { kind: "github", label: "GitHub", recommendedEnvName: "GITHUB_TOKEN" },
  { kind: "uci_ml", label: "UCI Machine Learning", recommendedEnvName: "UCI_ML_TOKEN" },
  { kind: "pytorch_hub", label: "PyTorch Hub", recommendedEnvName: "PYTORCH_HUB_TOKEN" },
] as const satisfies ReadonlyArray<{
  kind: Exclude<InfrastructureTokenKind, "custom">;
  label: string;
  recommendedEnvName: string;
}>;

export function createDefaultInfrastructureTokens(): InfrastructureTokenSlot[] {
  return DEFAULT_INFRASTRUCTURE_TOKEN_KINDS.map((item) => ({
    id: `infra-token-${item.kind}`,
    kind: item.kind,
    label: item.label,
    secretName: "",
    provider: "env" as const,
    recommendedEnvName: item.recommendedEnvName,
  }));
}

export const ArchitectureGraphSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  project: ProjectMetadataSchema,
  nodes: z.array(ArchitectureNodeSchema),
  edges: z.array(ArchitectureEdgeSchema),
  contracts: z
    .array(
      z.object({
        id: z.string().min(1),
        contractType: ContractTypeSchema,
        name: z.string().min(1),
        schema: z.record(z.unknown()).optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  deploymentEnvironments: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: DeploymentEnvironmentKindSchema,
        name: z.string().min(1),
        bounds: z
          .object({
            x: z.number().optional(),
            y: z.number().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          })
          .optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  macroBlocks: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        nodeIds: z.array(z.string()),
        inputs: z.array(NodePortSchema),
        outputs: z.array(NodePortSchema),
        collapsed: z.boolean().default(true),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  portalBuses: z
    .array(
      z.object({
        id: z.string().min(1),
        busId: z.string().min(1),
        displayName: z.string().min(1),
        contractType: ContractTypeSchema,
        scope: z.enum(["project", "macro", "deployment"]),
        scopeId: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
  infrastructureTokens: z.array(InfrastructureTokenSlotSchema).default([]),
  validationResults: z.array(ValidationIssueSchema).default([]),
  exportConfiguration: z
    .object({
      projectSlug: z.string().optional(),
      includeDockerCompat: z.boolean().default(false),
      includeKubernetes: z.boolean().default(false),
      includeOpenShift: z.boolean().default(false),
      includeTerraform: z.boolean().default(false),
      includeArgoCd: z.boolean().default(false),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
  viewport: ViewportSchema,
});

export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>;

export function parseArchitectureGraph(input: unknown): ArchitectureGraph {
  return ArchitectureGraphSchema.parse(input);
}

/**
 * Generate a UUID-ish id that works in browsers without `crypto.randomUUID`
 * (older Safari / some non-secure contexts) and in Node.
 */
export function newId(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    // RFC 4122 version 4
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createEmptyGraph(name = "Untitled Project"): ArchitectureGraph {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: newId(),
      name,
      createdAt: now,
      updatedAt: now,
    },
    nodes: [],
    edges: [],
    contracts: [],
    deploymentEnvironments: [],
    macroBlocks: [],
    portalBuses: [],
    infrastructureTokens: createDefaultInfrastructureTokens(),
    validationResults: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export {
  areContractsCompatible,
  CONTRACT_TYPE_LABELS,
  contractCompatibilityReason,
} from "./compatibility.js";
