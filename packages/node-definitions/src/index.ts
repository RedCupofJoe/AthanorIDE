/**
 * Aggregated node catalog registry and createNodeFromDefinition factory.
 */
import type { ArchitectureNode, NodePort } from "@athanor/contracts";
import { newId } from "@athanor/contracts";

import { BIG_BLOCKS_NODE_DEFINITIONS } from "./big-blocks/index.js";
import { ENTERPRISE_NODE_DEFINITIONS } from "./enterprise/index.js";
import { FINE_TUNING_NODE_DEFINITIONS } from "./fine-tuning/index.js";
import { FOUNDATION_NODE_DEFINITIONS } from "./foundation/index.js";
import { MULTI_AGENT_NODE_DEFINITIONS } from "./multi-agent/index.js";
import { getRecommendedAdjacent } from "./recommended-adjacent.js";
import type { NodeDefinition, NodeDefinitionSummary } from "./types.js";
import { VISION_NODE_DEFINITIONS } from "./vision/index.js";

export type {
  ConfigFieldDefinition,
  ConfigFieldType,
  NodeCategory,
  NodeDefinition,
  NodeDefinitionSummary,
  NodeExportKind,
} from "./types.js";
export type { RecommendedAdjacent } from "./recommended-adjacent.js";
export { getRecommendedAdjacent, RECOMMENDED_ADJACENT } from "./recommended-adjacent.js";
export { portTemplate, requiredConfigKeys } from "./types.js";
export {
  FOUNDATION_NODE_DEFINITIONS,
  environmentVariableDefinition,
  httpRequestDefinition,
  jsonInputDefinition,
  outputViewerDefinition,
  portalInputDefinition,
  portalOutputDefinition,
  promptTemplateDefinition,
  pythonTransformDefinition,
  secretReferenceDefinition,
  textInputDefinition,
} from "./foundation/index.js";
export {
  FINE_TUNING_NODE_DEFINITIONS,
  datasetLoaderDefinition,
  loraTrainerDefinition,
} from "./fine-tuning/index.js";
export {
  VISION_NODE_DEFINITIONS,
  imageInputDefinition,
  imagePreprocessorDefinition,
  visionModelDefinition,
} from "./vision/index.js";
export {
  MULTI_AGENT_NODE_DEFINITIONS,
  agentDefinition,
  mcpServerDefinition,
  toolDefinitionDefinition,
} from "./multi-agent/index.js";
export {
  ENTERPRISE_NODE_DEFINITIONS,
  auditLogDefinition,
  identityReferenceDefinition,
  policyGuardrailDefinition,
  primaryVectorDbsDefinition,
} from "./enterprise/index.js";
export {
  BIG_BLOCKS_NODE_DEFINITIONS,
  agenticHarnessDefinition,
  aiGatewayDefinition,
  audioToRagDefinition,
  autoRagDefinition,
  graphRagDefinition,
  guardrailBuilderDefinition,
  imageClassifierDefinition,
  localS3BucketDefinition,
  modelRuntimeDefinition,
  multimodalRagDefinition,
  postgresPgvectorDefinition,
  simpleUiChatbotDefinition,
  simpleUiMultimodalDefinition,
  soundClassifierDefinition,
  videoChunkingIcLoraDefinition,
  videoToRagDefinition,
  voiceToTextDefinition,
  webToMarkdownDefinition,
} from "./big-blocks/index.js";

function withRecommendedAdjacent(definition: NodeDefinition): NodeDefinition {
  return {
    ...definition,
    recommendedAdjacent: getRecommendedAdjacent(definition.type),
  };
}

export const NODE_DEFINITIONS: readonly NodeDefinition[] = [
  ...FOUNDATION_NODE_DEFINITIONS,
  ...FINE_TUNING_NODE_DEFINITIONS,
  ...VISION_NODE_DEFINITIONS,
  ...MULTI_AGENT_NODE_DEFINITIONS,
  ...ENTERPRISE_NODE_DEFINITIONS,
  ...BIG_BLOCKS_NODE_DEFINITIONS,
].map(withRecommendedAdjacent);
const BY_TYPE = new Map(NODE_DEFINITIONS.map((definition) => [definition.type, definition]));

export function listNodeDefinitions(): readonly NodeDefinition[] {
  return NODE_DEFINITIONS;
}

export function listNodeDefinitionSummaries(): readonly NodeDefinitionSummary[] {
  return NODE_DEFINITIONS.map((definition) => ({
    type: definition.type,
    displayName: definition.displayName,
    category: definition.category,
    version: definition.version,
    description: definition.description,
    icon: definition.icon,
  }));
}

export function listNodeDefinitionsByCategory(
  category: NodeDefinition["category"],
): readonly NodeDefinition[] {
  return NODE_DEFINITIONS.filter((definition) => definition.category === category);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return BY_TYPE.get(type);
}

function materializePorts(
  templates: NodeDefinition["inputs"],
  direction: "input" | "output",
): NodePort[] {
  return templates.map((template) => ({
    id: `${direction === "input" ? "in" : "out"}-${template.name}`,
    name: template.name,
    direction,
    contractType: template.contractType,
    required: template.required,
    multiple: template.multiple,
    ...(template.schema ? { schema: template.schema } : {}),
  }));
}

export function createNodeFromDefinition(
  type: string,
  position: { x: number; y: number },
  overrides?: Partial<Pick<ArchitectureNode, "id" | "name" | "configuration">>,
): ArchitectureNode {
  const definition = getNodeDefinition(type);
  if (!definition) {
    throw new Error(`Unknown node type: ${type}`);
  }

  const configuration: Record<string, unknown> = {};
  for (const field of definition.configurationFields) {
    configuration[field.key] = field.defaultValue;
  }

  return {
    id: overrides?.id ?? newId(),
    type: definition.type,
    version: definition.version,
    name: overrides?.name ?? definition.displayName,
    description: definition.description,
    position,
    configuration: { ...configuration, ...overrides?.configuration },
    inputs: materializePorts(definition.inputs, "input"),
    outputs: materializePorts(definition.outputs, "output"),
  };
}

export function getDefaultConfiguration(type: string): Record<string, unknown> {
  const definition = getNodeDefinition(type);
  if (!definition) return {};
  const configuration: Record<string, unknown> = {};
  for (const field of definition.configurationFields) {
    configuration[field.key] = field.defaultValue;
  }
  return configuration;
}
