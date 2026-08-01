"use client";

/**
 * React Flow canvas: nodes/edges rendering, connect validation, keyboard shortcuts.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { architectureNodeTypes } from "@/components/nodes/nodeTypes";
import type { ArchitectureFlowNodeData } from "@/components/nodes/FoundationNode";
import type { MacroFlowNodeData } from "@/components/nodes/MacroBlockNode";
import type { SwimlaneFlowNodeData } from "@/components/nodes/SwimlaneNode";
import { lodFromZoom, lodLabel, type LodLevel } from "@/lib/lod";
import {
  isNodeHiddenByMacro,
  macroFlowId,
  macroPosition,
  parseMacroFlowId,
  resolveMacroHandle,
} from "@/lib/macros";
import { groupPortalsByBus } from "@/lib/portals";
import {
  isCrossEnvironmentEdge,
  parseSwimlaneFlowId,
  swimlaneBounds,
  swimlaneFlowId,
} from "@/lib/swimlanes";
import { evaluateConnection } from "@/lib/graph-utils";
import { useConnectionDraftStore } from "@/store/connection-draft-store";
import { usePendingDeleteStore } from "@/store/pending-delete-store";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";
import { useValidationStore } from "@/store/validation-store";
import { selectPayloadPreview, useExecutionStore } from "@/store/execution-store";

function CanvasInner() {
  const graph = useProjectStore((state) => state.graph);
  const connectPorts = useProjectStore((state) => state.connectPorts);
  const updateNodePositions = useProjectStore((state) => state.updateNodePositions);
  const updateNodePosition = useProjectStore((state) => state.updateNodePosition);
  const beginGesture = useProjectStore((state) => state.beginGesture);
  const setViewport = useProjectStore((state) => state.setViewport);
  const duplicateNodes = useProjectStore((state) => state.duplicateNodes);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const connectionError = useProjectStore((state) => state.connectionError);
  const clearConnectionError = useProjectStore((state) => state.clearConnectionError);
  const expandMacro = useProjectStore((state) => state.expandMacro);
  const updateMacroPosition = useProjectStore((state) => state.updateMacroPosition);
  const updateSwimlaneBounds = useProjectStore((state) => state.updateSwimlaneBounds);
  const assignNodesToSwimlanes = useProjectStore((state) => state.assignNodesToSwimlanes);

  const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useSelectionStore((state) => state.selectedEdgeIds);
  const setSelection = useSelectionStore((state) => state.setSelection);
  const focusNodeId = useSelectionStore((state) => state.focusNodeId);
  const focusEdgeId = useSelectionStore((state) => state.focusEdgeId);

  const issues = useValidationStore((state) => state.issues);
  const executionSteps = useExecutionStore((state) => state.steps);
  const edgePayloads = useExecutionStore((state) => state.edgePayloads);

  const { setCenter, fitView, getZoom } = useReactFlow();
  const [lod, setLod] = useState<LodLevel>(() => lodFromZoom(graph.viewport.zoom));

  const healthByNode = useMemo(() => {
    const map = new Map<string, ArchitectureFlowNodeData["health"]>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      const current = map.get(issue.nodeId);
      if (issue.severity === "error") {
        map.set(issue.nodeId, "error");
      } else if (issue.severity === "warning" && current !== "error") {
        map.set(issue.nodeId, "warning");
      } else if (!current) {
        map.set(issue.nodeId, "ok");
      }
    }
    if (issues.length > 0) {
      for (const node of graph.nodes) {
        if (!map.has(node.id)) map.set(node.id, "ok");
      }
    }
    return map;
  }, [graph.nodes, issues]);

  const laneNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const lane of graph.deploymentEnvironments) {
      map.set(lane.id, lane.name);
    }
    return map;
  }, [graph.deploymentEnvironments]);

  const nodes: Node[] = useMemo(() => {
    const swimlaneNodes: Node[] = graph.deploymentEnvironments.map((lane) => {
      const bounds = swimlaneBounds(lane);
      const nodeCount = graph.nodes.filter(
        (node) => node.deploymentTarget === lane.id,
      ).length;
      return {
        id: swimlaneFlowId(lane.id),
        type: "swimlane",
        position: { x: bounds.x, y: bounds.y },
        style: { width: bounds.width, height: bounds.height, zIndex: -1 },
        draggable: true,
        selectable: true,
        data: {
          name: lane.name,
          kind: lane.kind,
          lod,
          nodeCount,
        } satisfies SwimlaneFlowNodeData,
      };
    });

    const architectureNodes: Node[] = graph.nodes
      .filter((node) => !isNodeHiddenByMacro(node.id, graph.macroBlocks))
      .map((node) => {
        const step = executionSteps.find((item) => item.nodeId === node.id);
        return {
          id: node.id,
          type: "architecture",
          position: node.position,
          selected: selectedNodeIds.includes(node.id),
          zIndex: 1,
          data: {
            architectureNode: node,
            lod,
            health: healthByNode.get(node.id) ?? "unknown",
            deploymentLabel: node.deploymentTarget
              ? laneNameById.get(node.deploymentTarget)
              : undefined,
            payloadPreview: selectPayloadPreview(executionSteps, node.id),
            executionStatus: step?.status ?? null,
          } satisfies ArchitectureFlowNodeData,
        };
      });

    const macroNodes: Node[] = graph.macroBlocks
      .filter((macro) => macro.collapsed)
      .map((macro) => ({
        id: macroFlowId(macro.id),
        type: "macro",
        position: macroPosition(macro),
        selected: selectedNodeIds.includes(macroFlowId(macro.id)),
        zIndex: 2,
        data: {
          macroId: macro.id,
          name: macro.name,
          description: macro.description,
          nodeCount: macro.nodeIds.length,
          inputs: macro.inputs,
          outputs: macro.outputs,
          lod,
          onExpand: expandMacro,
        } satisfies MacroFlowNodeData,
      }));

    return [...swimlaneNodes, ...architectureNodes, ...macroNodes];
  }, [
    expandMacro,
    graph.deploymentEnvironments,
    graph.macroBlocks,
    graph.nodes,
    healthByNode,
    laneNameById,
    lod,
    selectedNodeIds,
    executionSteps,
  ]);

  const edges: Edge[] = useMemo(() => {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const result: Edge[] = [];

    for (const edge of graph.edges) {
      const sourceHidden = isNodeHiddenByMacro(edge.sourceNodeId, graph.macroBlocks);
      const targetHidden = isNodeHiddenByMacro(edge.targetNodeId, graph.macroBlocks);
      if (sourceHidden && targetHidden) continue;

      let source = edge.sourceNodeId;
      let target = edge.targetNodeId;
      let sourceHandle = edge.sourcePortId;
      let targetHandle = edge.targetPortId;

      if (sourceHidden) {
        const resolved = resolveMacroHandle(
          graph.macroBlocks,
          edge.sourceNodeId,
          edge.sourcePortId,
          "source",
        );
        if (!resolved) continue;
        source = macroFlowId(resolved.macroId);
        sourceHandle = resolved.handleId;
      }
      if (targetHidden) {
        const resolved = resolveMacroHandle(
          graph.macroBlocks,
          edge.targetNodeId,
          edge.targetPortId,
          "target",
        );
        if (!resolved) continue;
        target = macroFlowId(resolved.macroId);
        targetHandle = resolved.handleId;
      }

      const cross = isCrossEnvironmentEdge(edge, nodesById);
      const payload = edgePayloads.find((item) => item.edgeId === edge.id);
      const isSelected =
        selectedEdgeIds.includes(edge.id) || focusEdgeId === edge.id;
      const sourceNode = nodesById.get(edge.sourceNodeId);
      const sourcePort = sourceNode?.outputs.find(
        (port) => port.id === edge.sourcePortId,
      );
      const contractLabel = sourcePort?.contractType ?? "link";
      const payloadLabel =
        payload && lod !== "macro"
          ? payload.value.length > 24
            ? `${payload.value.slice(0, 24)}…`
            : payload.value
          : undefined;
      result.push({
        id: edge.id,
        source,
        target,
        sourceHandle,
        targetHandle,
        selectable: true,
        focusable: true,
        interactionWidth: 28,
        selected: isSelected,
        label:
          lod === "macro"
            ? undefined
            : payloadLabel
              ? payloadLabel
              : cross
                ? "cross-env"
                : contractLabel,
        animated: cross || Boolean(payload) || isSelected,
        style: {
          stroke: isSelected
            ? "var(--athanor-ember)"
            : cross
              ? "#c2410c"
              : payload
                ? "#9a3412"
                : "#78716c",
          strokeWidth: isSelected ? 3 : cross || payload ? 2 : 1.75,
          strokeDasharray: cross ? "6 4" : undefined,
        },
        className: focusEdgeId === edge.id ? "athanor-focus-edge" : undefined,
      });
    }

    if (lod !== "micro") {
      const portalGroups = groupPortalsByBus(graph.nodes);
      for (const [busId, portals] of portalGroups) {
        const inputs = portals.filter((node) => node.type === "foundation.portal_input");
        const outputs = portals.filter((node) => node.type === "foundation.portal_output");
        for (const output of outputs) {
          if (isNodeHiddenByMacro(output.id, graph.macroBlocks)) continue;
          for (const input of inputs) {
            if (isNodeHiddenByMacro(input.id, graph.macroBlocks)) continue;
            result.push({
              id: `portal-bus-${busId}-${output.id}-${input.id}`,
              source: output.id,
              target: input.id,
              sourceHandle: "bus-out",
              targetHandle: "bus-in",
              selectable: false,
              focusable: false,
              animated: true,
              label: lod === "macro" ? busId : `bus:${busId}`,
              style: {
                stroke: "#a16207",
                strokeDasharray: "2 6",
                strokeWidth: 1.5,
              },
            });
          }
        }
      }
    }

    return result;
  }, [focusEdgeId, graph.edges, graph.macroBlocks, graph.nodes, lod, selectedEdgeIds, edgePayloads]);

  useEffect(() => {
    setLod(lodFromZoom(graph.viewport.zoom));
  }, [graph.viewport.zoom]);

  useEffect(() => {
    if (!focusNodeId) return;
    const node = graph.nodes.find((item) => item.id === focusNodeId);
    if (!node) return;
    const hidden = isNodeHiddenByMacro(node.id, graph.macroBlocks);
    if (hidden) {
      const macro = graph.macroBlocks.find(
        (item) => item.collapsed && item.nodeIds.includes(node.id),
      );
      if (macro) {
        const position = macroPosition(macro);
        void setCenter(position.x + 110, position.y + 40, {
          zoom: Math.max(getZoom(), 0.9),
          duration: 400,
        });
        return;
      }
    }
    void setCenter(node.position.x + 110, node.position.y + 40, {
      zoom: Math.max(getZoom(), 0.9),
      duration: 400,
    });
  }, [focusNodeId, getZoom, graph.macroBlocks, graph.nodes, setCenter]);

  useEffect(() => {
    if (!focusEdgeId) return;
    const edge = graph.edges.find((item) => item.id === focusEdgeId);
    if (!edge) return;
    const source = graph.nodes.find((node) => node.id === edge.sourceNodeId);
    const target = graph.nodes.find((node) => node.id === edge.targetNodeId);
    if (!source || !target) return;
    void setCenter(
      (source.position.x + target.position.x) / 2 + 110,
      (source.position.y + target.position.y) / 2 + 40,
      { zoom: Math.max(getZoom(), 0.85), duration: 400 },
    );
  }, [focusEdgeId, getZoom, graph.edges, graph.nodes, setCenter]);

  const onConnect = useCallback(
    (connection: Connection) => {
      useConnectionDraftStore.getState().clearDraft();
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      ) {
        return;
      }
      if (
        connection.source.startsWith("macro:") ||
        connection.target.startsWith("macro:") ||
        connection.source.startsWith("swimlane:") ||
        connection.target.startsWith("swimlane:")
      ) {
        return;
      }
      connectPorts({
        sourceNodeId: connection.source,
        sourcePortId: connection.sourceHandle,
        targetNodeId: connection.target,
        targetPortId: connection.targetHandle,
      });
    },
    [connectPorts],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      ) {
        return false;
      }
      if (
        connection.source.startsWith("macro:") ||
        connection.target.startsWith("macro:") ||
        connection.source.startsWith("swimlane:") ||
        connection.target.startsWith("swimlane:")
      ) {
        return false;
      }
      const decision = evaluateConnection({
        nodes: useProjectStore.getState().graph.nodes,
        edges: useProjectStore.getState().graph.edges,
        sourceNodeId: connection.source,
        sourcePortId: connection.sourceHandle,
        targetNodeId: connection.target,
        targetPortId: connection.targetHandle,
      });
      return decision.ok;
    },
    [],
  );

  const onConnectStart = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      params: { nodeId: string | null; handleId: string | null; handleType: "source" | "target" | null },
    ) => {
      if (!params.nodeId || !params.handleId || !params.handleType) {
        useConnectionDraftStore.getState().clearDraft();
        return;
      }
      const node = useProjectStore
        .getState()
        .graph.nodes.find((item) => item.id === params.nodeId);
      if (!node) {
        useConnectionDraftStore.getState().clearDraft();
        return;
      }
      const port =
        params.handleType === "source"
          ? node.outputs.find((item) => item.id === params.handleId)
          : node.inputs.find((item) => item.id === params.handleId);
      if (!port) {
        useConnectionDraftStore.getState().clearDraft();
        return;
      }
      useConnectionDraftStore.getState().setDraft({
        nodeId: node.id,
        handleId: port.id,
        handleType: params.handleType,
        contractType: port.contractType,
      });
    },
    [],
  );

  const onConnectEnd = useCallback(() => {
    useConnectionDraftStore.getState().clearDraft();
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      const edgeIds = selectedEdges
        .map((edge) => edge.id)
        .filter((id) => !id.startsWith("portal-bus-"));
      // Prefer connection-only selection when the user clicked an edge so Delete
      // removes wires without also removing their endpoint nodes.
      if (edgeIds.length > 0 && selectedNodes.length === 0) {
        setSelection([], edgeIds);
        return;
      }
      setSelection(
        selectedNodes
          .map((node) => node.id)
          .filter((id) => !id.startsWith("swimlane:")),
        edgeIds,
      );
    },
    [setSelection],
  );

  const onEdgeClick = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      if (edge.id.startsWith("portal-bus-")) return;
      event.stopPropagation();
      setSelection([], [edge.id]);
    },
    [setSelection],
  );

  const onNodeDragStart: OnNodeDrag = useCallback(() => {
    beginGesture();
  }, [beginGesture]);

  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      const macroId = parseMacroFlowId(node.id);
      if (macroId) {
        updateMacroPosition(macroId, node.position);
        return;
      }
      const swimlaneId = parseSwimlaneFlowId(node.id);
      if (swimlaneId) {
        const width = typeof node.style?.width === "number" ? node.style.width : 480;
        const height = typeof node.style?.height === "number" ? node.style.height : 640;
        updateSwimlaneBounds(swimlaneId, {
          x: node.position.x,
          y: node.position.y,
          width,
          height,
        });
        return;
      }
      updateNodePosition(node.id, node.position);
    },
    [updateMacroPosition, updateNodePosition, updateSwimlaneBounds],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, _node, nodesSnapshot) => {
      const architectureUpdates = nodesSnapshot
        .filter(
          (item) =>
            !item.id.startsWith("macro:") && !item.id.startsWith("swimlane:"),
        )
        .map((item) => ({
          id: item.id,
          position: item.position,
        }));
      if (architectureUpdates.length > 0) {
        updateNodePositions(architectureUpdates);
        assignNodesToSwimlanes(architectureUpdates.map((item) => item.id));
      }
    },
    [assignNodesToSwimlanes, updateNodePositions],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (
        meta &&
        (event.key.toLowerCase() === "y" ||
          (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateNodes(
          useSelectionStore
            .getState()
            .selectedNodeIds.filter((id) => !id.startsWith("macro:")),
        );
        return;
      }
      if (event.key === "Escape") {
        usePendingDeleteStore.getState().cancelDelete();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selection = useSelectionStore.getState();
        const nodeIds = selection.selectedNodeIds.filter(
          (id) => !id.startsWith("macro:") && !id.startsWith("swimlane:"),
        );
        const edgeIds = selection.selectedEdgeIds.filter(
          (id) => !id.startsWith("portal-bus-"),
        );
        if (edgeIds.length > 0) {
          // Edge selection always deletes connections only — never endpoint nodes.
          event.preventDefault();
          usePendingDeleteStore.getState().requestDelete([], edgeIds);
          return;
        }
        if (nodeIds.length) {
          event.preventDefault();
          usePendingDeleteStore.getState().requestDelete(nodeIds, []);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicateNodes, redo, undo]);

  useEffect(() => {
    if (graph.nodes.length === 0 && graph.macroBlocks.length === 0) {
      void fitView({ padding: 0.2 });
    }
  }, [fitView, graph.macroBlocks.length, graph.nodes.length]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={architectureNodeTypes}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onSelectionChange={onSelectionChange}
        onEdgeClick={onEdgeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onMove={(_event, viewport) => setLod(lodFromZoom(viewport.zoom))}
        onMoveEnd={(_event, viewport) =>
          setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })
        }
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        edgesFocusable
        elementsSelectable
        selectionOnDrag
        panOnScroll
        zoomOnScroll
        minZoom={0.1}
        maxZoom={2}
        onlyRenderVisibleElements
        defaultViewport={graph.viewport}
        defaultEdgeOptions={{ interactionWidth: 28 }}
        proOptions={{ hideAttribution: true }}
        aria-label="Architecture canvas"
      >
        <Background gap={16} size={1} color="#d6d3d1" />
        <MiniMap pannable zoomable />
        <Controls showInteractive />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 rounded border border-[var(--athanor-mist)] bg-white/90 px-2 py-1 text-[11px] text-[var(--athanor-slate)] shadow-sm">
        {lodLabel(lod)} · zoom {(graph.viewport.zoom * 100).toFixed(0)}%
      </div>

      {connectionError && (
        <div
          role="alert"
          className="absolute bottom-4 left-1/2 z-10 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <p>{connectionError}</p>
            <button
              type="button"
              className="shrink-0 text-xs underline"
              onClick={() => clearConnectionError()}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArchitectureCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
