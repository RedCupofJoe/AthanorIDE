/** Port contract compatibility: exact match or ANY wildcard (no silent coercion). */
import type { ContractType } from "./index.js";

/**
 * Contract compatibility rules.
 * Exact match always works. ANY is a wildcard on either side.
 * Silent coercion is forbidden — use adapter nodes later for conversions.
 */
export function areContractsCompatible(
  source: ContractType,
  target: ContractType,
): boolean {
  if (source === target) return true;
  if (source === "ANY" || target === "ANY") return true;
  return false;
}

export function contractCompatibilityReason(
  source: ContractType,
  target: ContractType,
): string | null {
  if (areContractsCompatible(source, target)) return null;
  return (
    `Contract mismatch: output ${source} cannot connect to input ${target}. ` +
    `Use an adapter node or matching port types.`
  );
}

/** Human-readable labels (never rely on color alone). */
export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  STRING: "String",
  PROMPT: "Prompt",
  MODEL_HANDLE: "Model handle",
  MODEL_WEIGHTS: "Model weights",
  VECTOR_EMBEDDING: "Vector embedding",
  DATABASE_HANDLE: "Database handle",
  TOOL_DEFINITION: "Tool definition",
  MCP_SERVER: "MCP server",
  STREAMING_PAYLOAD: "Streaming payload",
  JSON_SCHEMA: "JSON schema",
  IMAGE: "Image",
  VIDEO: "Video",
  AUDIO: "Audio",
  TENSOR: "Tensor",
  FILE_REFERENCE: "File reference",
  DATASET: "Dataset",
  EVENT: "Event",
  ANY: "Any",
};
