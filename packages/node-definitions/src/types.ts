/**
 * NodeDefinition types, export kinds, and portTemplate helpers.
 */
import type { ContractType, NodePort } from "@athanor/contracts";

export type NodeCategory =
  | "foundation"
  | "fine-tuning"
  | "vision"
  | "multi-agent"
  | "enterprise"
  | "big-blocks";

export type ConfigFieldType = "string" | "text" | "number" | "boolean" | "select";

/** How the exporter treats this node type. */
export type NodeExportKind =
  | "pipeline_text_source"
  | "pipeline_transform"
  | "pipeline_sink"
  | "prompt_template"
  | "http_client"
  | "env_binding"
  | "secret_reference"
  | "portal"
  | "fine_tuning"
  | "vision"
  | "multi_agent"
  | "enterprise"
  | "big_blocks"
  | "documentation_only";

export interface ConfigFieldDefinition {
  key: string;
  label: string;
  description: string;
  type: ConfigFieldType;
  required: boolean;
  defaultValue: string | number | boolean;
  /** Allowed values when type is "select". */
  options?: readonly string[];
  advanced?: boolean;
  recommendedDefaultExplanation?: string;
}

export interface NodeDefinition {
  type: string;
  displayName: string;
  description: string;
  category: NodeCategory;
  version: string;
  icon: string;
  inputs: Omit<NodePort, "id">[];
  outputs: Omit<NodePort, "id">[];
  configurationFields: ConfigFieldDefinition[];
  documentation: string;
  /** Exporter / lineage behavior for this node. */
  exportKind: NodeExportKind;
}

export interface NodeDefinitionSummary {
  type: string;
  displayName: string;
  category: NodeCategory;
  version: string;
  description: string;
  icon: string;
}

export function portTemplate(
  name: string,
  direction: "input" | "output",
  contractType: ContractType,
  options?: Partial<Pick<NodePort, "required" | "multiple">>,
): Omit<NodePort, "id"> {
  return {
    name,
    direction,
    contractType,
    required: options?.required ?? true,
    multiple: options?.multiple ?? false,
  };
}

export function requiredConfigKeys(definition: NodeDefinition): string[] {
  return definition.configurationFields
    .filter((field) => field.required)
    .map((field) => field.key);
}
