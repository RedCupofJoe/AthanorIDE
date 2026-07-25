/**
 * Portal bus helpers: detect portal nodes, sync bus records, find linked ends.
 */
import {
  ContractTypeSchema,
  type ArchitectureGraph,
  type ArchitectureNode,
  type ContractType,
} from "@athanor/contracts";

export const PORTAL_INPUT_TYPE = "foundation.portal_input";
export const PORTAL_OUTPUT_TYPE = "foundation.portal_output";

export type PortalScope = "project" | "macro" | "deployment";

export function isPortalNode(node: ArchitectureNode): boolean {
  return node.type === PORTAL_INPUT_TYPE || node.type === PORTAL_OUTPUT_TYPE;
}

export function portalBusId(node: ArchitectureNode): string {
  const value = node.configuration.busId;
  return typeof value === "string" ? value.trim() : "";
}

export function portalDisplayName(node: ArchitectureNode): string {
  const value = node.configuration.displayName;
  return typeof value === "string" && value.trim() ? value.trim() : node.name;
}

export function portalContractType(node: ArchitectureNode): ContractType {
  const value = node.configuration.contractType;
  const parsed = ContractTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "STRING";
}

export function portalScope(node: ArchitectureNode): PortalScope {
  const value = node.configuration.scope;
  if (value === "macro" || value === "deployment" || value === "project") {
    return value;
  }
  return "project";
}

/** Rebuild the graph-level portal bus registry from portal nodes. */
export function syncPortalBusesFromNodes(
  nodes: ArchitectureNode[],
): ArchitectureGraph["portalBuses"] {
  const portals = nodes.filter(isPortalNode);
  const byBus = new Map<string, ArchitectureGraph["portalBuses"][number]>();

  for (const node of portals) {
    const busId = portalBusId(node);
    if (!busId) continue;
    const existing = byBus.get(busId);
    const contractType = portalContractType(node);
    const displayName = portalDisplayName(node);
    const scope = portalScope(node);
    if (!existing) {
      byBus.set(busId, {
        id: `portal-bus-${busId}`,
        busId,
        displayName,
        contractType,
        scope,
      });
    }
  }

  return [...byBus.values()].sort((a, b) => a.busId.localeCompare(b.busId));
}

/** Apply portal configuration onto the node's physical ports. */
export function withSyncedPortalPorts(node: ArchitectureNode): ArchitectureNode {
  if (!isPortalNode(node)) return node;
  const contractType = portalContractType(node);
  if (node.type === PORTAL_INPUT_TYPE) {
    return {
      ...node,
      outputs: node.outputs.map((port) => ({ ...port, contractType })),
      inputs: [],
    };
  }
  return {
    ...node,
    inputs: node.inputs.map((port) => ({ ...port, contractType })),
    outputs: [],
  };
}

export function findLinkedPortalNodes(
  nodes: ArchitectureNode[],
  nodeId: string,
): ArchitectureNode[] {
  const current = nodes.find((node) => node.id === nodeId);
  if (!current || !isPortalNode(current)) return [];
  const busId = portalBusId(current);
  if (!busId) return [];
  return nodes.filter(
    (node) =>
      node.id !== nodeId &&
      isPortalNode(node) &&
      portalBusId(node) === busId,
  );
}

export function groupPortalsByBus(
  nodes: ArchitectureNode[],
): Map<string, ArchitectureNode[]> {
  const groups = new Map<string, ArchitectureNode[]>();
  for (const node of nodes) {
    if (!isPortalNode(node)) continue;
    const busId = portalBusId(node);
    if (!busId) continue;
    const list = groups.get(busId) ?? [];
    list.push(node);
    groups.set(busId, list);
  }
  return groups;
}
