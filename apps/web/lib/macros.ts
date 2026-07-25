/**
 * Macro block collapse/expand helpers and React Flow id encoding.
 */
import {
  newId,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type NodePort,
} from "@athanor/contracts";

export type MacroPortBinding = {
  nodeId: string;
  portId: string;
};

export type MacroPortBindings = Record<string, MacroPortBinding>;

export type MacroBlockRecord = ArchitectureGraph["macroBlocks"][number];

function portClone(port: NodePort, id: string): NodePort {
  return {
    ...port,
    id,
  };
}

/** Derive external macro ports from edges that cross the selection boundary. */
export function computeMacroExternalPorts(
  nodeIds: string[],
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
): {
  inputs: NodePort[];
  outputs: NodePort[];
  bindings: MacroPortBindings;
} {
  const idSet = new Set(nodeIds);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const inputs: NodePort[] = [];
  const outputs: NodePort[] = [];
  const bindings: MacroPortBindings = {};

  for (const edge of edges) {
    const sourceInside = idSet.has(edge.sourceNodeId);
    const targetInside = idSet.has(edge.targetNodeId);
    if (sourceInside === targetInside) continue;

    if (!sourceInside && targetInside) {
      const target = nodesById.get(edge.targetNodeId);
      const port = target?.inputs.find((item) => item.id === edge.targetPortId);
      if (!port || !target) continue;
      const macroPortId = `macro-in-${edge.id}`;
      inputs.push(portClone(port, macroPortId));
      bindings[macroPortId] = { nodeId: target.id, portId: port.id };
    }

    if (sourceInside && !targetInside) {
      const source = nodesById.get(edge.sourceNodeId);
      const port = source?.outputs.find((item) => item.id === edge.sourcePortId);
      if (!port || !source) continue;
      const macroPortId = `macro-out-${edge.id}`;
      outputs.push(portClone(port, macroPortId));
      bindings[macroPortId] = { nodeId: source.id, portId: port.id };
    }
  }

  return { inputs, outputs, bindings };
}

export function centroidOfNodes(nodes: ArchitectureNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 120, y: 120 };
  const sum = nodes.reduce(
    (acc, node) => ({ x: acc.x + node.position.x, y: acc.y + node.position.y }),
    { x: 0, y: 0 },
  );
  return {
    x: Math.round(sum.x / nodes.length),
    y: Math.round(sum.y / nodes.length),
  };
}

export function buildCollapsedMacro(
  nodeIds: string[],
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  name = "Macro Block",
): MacroBlockRecord {
  const selected = nodes.filter((node) => nodeIds.includes(node.id));
  const { inputs, outputs, bindings } = computeMacroExternalPorts(nodeIds, nodes, edges);
  const position = centroidOfNodes(selected);
  return {
    id: newId(),
    name,
    description: `Collapsed group of ${nodeIds.length} node(s).`,
    nodeIds: [...nodeIds],
    inputs,
    outputs,
    collapsed: true,
    metadata: {
      position,
      portBindings: bindings,
    },
  };
}

export function macroPosition(macro: MacroBlockRecord): { x: number; y: number } {
  const position = macro.metadata?.position;
  if (
    position &&
    typeof position === "object" &&
    "x" in position &&
    "y" in position &&
    typeof (position as { x: unknown }).x === "number" &&
    typeof (position as { y: unknown }).y === "number"
  ) {
    return { x: (position as { x: number }).x, y: (position as { y: number }).y };
  }
  return { x: 120, y: 120 };
}

export function macroPortBindings(macro: MacroBlockRecord): MacroPortBindings {
  const raw = macro.metadata?.portBindings;
  if (!raw || typeof raw !== "object") return {};
  return raw as MacroPortBindings;
}

export function resolveMacroHandle(
  macros: MacroBlockRecord[],
  nodeId: string,
  portId: string,
  direction: "source" | "target",
): { macroId: string; handleId: string } | null {
  for (const macro of macros) {
    if (!macro.collapsed || !macro.nodeIds.includes(nodeId)) continue;
    const bindings = macroPortBindings(macro);
    for (const [handleId, binding] of Object.entries(bindings)) {
      if (binding.nodeId !== nodeId || binding.portId !== portId) continue;
      const isInput = handleId.startsWith("macro-in-");
      if (direction === "target" && isInput) {
        return { macroId: macro.id, handleId };
      }
      if (direction === "source" && !isInput) {
        return { macroId: macro.id, handleId };
      }
    }
  }
  return null;
}

export function isNodeHiddenByMacro(
  nodeId: string,
  macros: MacroBlockRecord[],
): boolean {
  return macros.some(
    (macro) => macro.collapsed && macro.nodeIds.includes(nodeId),
  );
}

export const MACRO_NODE_PREFIX = "macro:" as const;

export function macroFlowId(macroId: string): string {
  return `${MACRO_NODE_PREFIX}${macroId}`;
}

export function parseMacroFlowId(flowId: string): string | null {
  return flowId.startsWith(MACRO_NODE_PREFIX)
    ? flowId.slice(MACRO_NODE_PREFIX.length)
    : null;
}
