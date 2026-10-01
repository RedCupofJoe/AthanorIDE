/**
 * Connection evaluation: contract compatibility, occupancy, and cycle detection.
 */
import {
  areContractsCompatible,
  contractCompatibilityReason,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type ContractType,
} from "@athanor/contracts";

export interface ConnectionRejectResult {
  ok: false;
  reason: string;
}

export interface ConnectionAcceptResult {
  ok: true;
}

export type ConnectionDecision = ConnectionAcceptResult | ConnectionRejectResult;

function findNode(
  nodes: ArchitectureNode[],
  id: string,
): ArchitectureNode | undefined {
  return nodes.find((node) => node.id === id);
}

function wouldCreateCycle(
  edges: ArchitectureEdge[],
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  if (sourceNodeId === targetNodeId) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.sourceNodeId) ?? [];
    list.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, list);
  }
  const provisional = adjacency.get(sourceNodeId) ?? [];
  provisional.push(targetNodeId);
  adjacency.set(sourceNodeId, provisional);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return dfs(sourceNodeId);
}

export function evaluateConnection(params: {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}): ConnectionDecision {
  const sourceNode = findNode(params.nodes, params.sourceNodeId);
  const targetNode = findNode(params.nodes, params.targetNodeId);
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: "Connection references a missing node." };
  }

  const sourcePort = sourceNode.outputs.find((port) => port.id === params.sourcePortId);
  const targetPort = targetNode.inputs.find((port) => port.id === params.targetPortId);
  if (!sourcePort || !targetPort) {
    return {
      ok: false,
      reason: "Connect an output port to an input port.",
    };
  }

  if (!areContractsCompatible(sourcePort.contractType, targetPort.contractType)) {
    return {
      ok: false,
      reason:
        contractCompatibilityReason(sourcePort.contractType, targetPort.contractType) ??
        "Incompatible contracts.",
    };
  }

  if (params.edges.some(edge => edge.sourceNodeId === params.sourceNodeId && edge.sourcePortId === params.sourcePortId && edge.targetNodeId === params.targetNodeId && edge.targetPortId === params.targetPortId)) {
    return { ok: false, reason: "These ports are already connected." };
  }

  if (!targetPort.multiple) {
    const occupied = params.edges.some(
      (edge) =>
        edge.targetNodeId === params.targetNodeId &&
        edge.targetPortId === params.targetPortId,
    );
    if (occupied) {
      return {
        ok: false,
        reason: `Input '${targetPort.name}' already has a connection. Disconnect it first or use a multi-input port.`,
      };
    }
  }

  if (
    wouldCreateCycle(params.edges, params.sourceNodeId, params.targetNodeId)
  ) {
    return {
      ok: false,
      reason: "This connection would create a cycle. Keep the canvas acyclic; bounded agent loops run inside the agent block.",
    };
  }

  return { ok: true };
}

export function cloneGraphSlice(graph: ArchitectureGraph): {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
} {
  return {
    nodes: structuredClone(graph.nodes),
    edges: structuredClone(graph.edges),
  };
}

export function contractLabel(type: ContractType): string {
  return type.replaceAll("_", " ");
}
