"use client";

/**
 * React Flow canvas: nodes/edges rendering, connect validation, keyboard shortcuts.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Background,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  type FinalConnectionState,
  useReactFlow,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { parseTaskFlowId, taskFlowId, securityCategories } from "@/lib/workflow";
import { architectureNodeTypes } from "@/components/nodes/nodeTypes";
import type { ArchitectureFlowNodeData } from "@/components/nodes/FoundationNode";
import type { MacroFlowNodeData } from "@/components/nodes/MacroBlockNode";
import type { SwimlaneFlowNodeData } from "@/components/nodes/SwimlaneNode";
import { lodFromZoom, lodLabel, type LodLevel } from "@/lib/lod";
import {
  macroFlowId,
  macroPosition,
  parseMacroFlowId,
  macroPortBindings,
} from "@/lib/macros";
import { groupPortalsByBus } from "@/lib/portals";
import {
  isCrossEnvironmentEdge,
  parseSwimlaneFlowId,
  swimlaneBounds,
  swimlaneFlowId,
} from "@/lib/swimlanes";
import { evaluateConnection } from "@/lib/graph-utils";
import { CONTRACT_TYPE_LABELS } from "@athanor/contracts";
import { useConnectionDraftStore } from "@/store/connection-draft-store";
import { usePendingDeleteStore } from "@/store/pending-delete-store";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";
import { useValidationStore } from "@/store/validation-store";
import { useExecutionStore } from "@/store/execution-store";
import { useUiPreferencesStore } from "@/store/ui-preferences-store";

function rejectedConnectionReason(
  state: FinalConnectionState,
  excludedEdgeId?: string,
): string | null {
  if (state.toPosition === null) return null;
  if (!state.toHandle || !state.toNode || !state.fromHandle || !state.fromNode) {
    return "That connection was not accepted. Connect an output to a compatible input; the port labels show the supported data types.";
  }
  const fromIsSource = state.fromHandle.type === "source";
  const decision = evaluateConnection({
    nodes: useProjectStore.getState().graph.nodes,
    edges: useProjectStore.getState().graph.edges.filter(edge => edge.id !== excludedEdgeId),
    sourceNodeId: fromIsSource ? state.fromNode.id : state.toNode.id,
    sourcePortId: fromIsSource ? state.fromHandle.id ?? "" : state.toHandle.id ?? "",
    targetNodeId: fromIsSource ? state.toNode.id : state.fromNode.id,
    targetPortId: fromIsSource ? state.toHandle.id ?? "" : state.fromHandle.id ?? "",
  });
  return decision.ok ? null : decision.reason;
}

function CanvasInner() {
  const graph = useProjectStore((state) => state.graph);
  const securityView = useUiPreferencesStore(s => s.workspaceRole === "security");
  const moveTaskGroup = useProjectStore(s => s.moveTaskGroup);
  const connectPorts = useProjectStore((state) => state.connectPorts);
  const updateNodePositions = useProjectStore((state) => state.updateNodePositions);
  const reconnectPorts = useProjectStore((state) => state.reconnectPorts);
  const reconnectingEdge = useRef<string | null>(null);
  const beginGesture = useProjectStore((state) => state.beginGesture);
  const setViewport = useProjectStore((state) => state.setViewport);
  const duplicateNodes = useProjectStore((state) => state.duplicateNodes);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const connectionError = useProjectStore((state) => state.connectionError);
  const setConnectionError = useProjectStore((state) => state.setConnectionError);
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
  const nodesInitialized = useNodesInitialized();
  const initialFit = useRef(false);
  const [lod, setLod] = useState<LodLevel>(() => lodFromZoom(graph.viewport.zoom));
  const lowResourceMode = useUiPreferencesStore((state) => state.lowResourceMode);

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

  const nodeIndexes = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const countByDeployment = new Map<string, number>();
    for (const node of graph.nodes) {
      if (node.deploymentTarget) {
        countByDeployment.set(node.deploymentTarget, (countByDeployment.get(node.deploymentTarget) ?? 0) + 1);
      }
    }
    const executionByNode = new Map(executionSteps.map((step) => [step.nodeId, step]));
    const payloadByNode = new Map<string, string>();
    for (const step of executionSteps) {
      const payload = step.nodeType === "foundation.output_viewer"
        ? Object.values(step.inputs)[0] ?? null
        : Object.values(step.outputs)[0] ?? step.message ?? null;
      if (payload !== null) payloadByNode.set(step.nodeId, payload);
    }
    return { byId, countByDeployment, executionByNode, payloadByNode };
  }, [executionSteps, graph.nodes]);

  const collapsedMacroIndexes = useMemo(() => {
    const hiddenByMacro = new Map<string, string>();
    const byId = new Map(graph.macroBlocks.map((macro) => [macro.id, macro]));
    const handleByNodePort = new Map<string, { macroId: string; handleId: string }>();
    for (const macro of graph.macroBlocks) {
      if (!macro.collapsed) continue;
      for (const id of macro.nodeIds) hiddenByMacro.set(id, macro.id);
      for (const [handleId, binding] of Object.entries(macroPortBindings(macro))) {
        const direction = handleId.startsWith("macro-in-") ? "target" : "source";
        handleByNodePort.set(`${binding.nodeId}\0${binding.portId}\0${direction}`, { macroId: macro.id, handleId });
      }
    }
    return { hiddenByMacro, byId, handleByNodePort };
  }, [graph.macroBlocks]);

  const payloadByEdge = useMemo(
    () => new Map(edgePayloads.map((payload) => [payload.edgeId, payload])),
    [edgePayloads],
  );

  const nodes: Node[] = useMemo(() => {
    const swimlaneNodes: Node[] = graph.deploymentEnvironments.map((lane) => {
      const bounds = swimlaneBounds(lane);
      const nodeCount = nodeIndexes.countByDeployment.get(lane.id) ?? 0;
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
      .filter((node) => !collapsedMacroIndexes.hiddenByMacro.has(node.id))
      .map((node) => {
        const step = nodeIndexes.executionByNode.get(node.id);
        return {
          id: node.id,
          type: "architecture",
          position: node.position,
          selected: selectedNodeIds.includes(node.id),
          zIndex: 1,
          data: {
            architectureNode: node,
            securityTags: securityView ? [...securityCategories(node), ...(issues.some(i => i.nodeId === node.id && i.code === "SECURITY_EMBEDDED_CREDENTIAL") ? ["Possible embedded credential"] : []), ...(issues.some(i => i.nodeId === node.id && i.code === "SECURITY_DISCONNECTED_COMPONENT") ? ["Disconnected component"] : [])] : [],
            lod,
            health: healthByNode.get(node.id) ?? "unknown",
            deploymentLabel: node.deploymentTarget
              ? laneNameById.get(node.deploymentTarget)
              : undefined,
            payloadPreview: nodeIndexes.payloadByNode.get(node.id),
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

    const groups: Node[] = graph.workflow.tasks.map(task => ({ id: taskFlowId(task.id), type: "workflowTask", position: { x: task.engineeringBounds.x, y: task.engineeringBounds.y }, style: { width: task.engineeringBounds.width, height: task.engineeringBounds.height }, zIndex: -1, selected: selectedNodeIds.includes(taskFlowId(task.id)), data: { task, engineering: true, count: graph.nodes.filter(n => n.workflowTaskId === task.id).length }, dragHandle: ".task-drag-handle" }));
    return [...swimlaneNodes, ...groups, ...architectureNodes, ...macroNodes];
  }, [
    expandMacro,
    graph.deploymentEnvironments,
    graph.macroBlocks,
    graph.nodes,
    graph.workflow.tasks,
    securityView,
    issues,
    healthByNode,
    laneNameById,
    lod,
    selectedNodeIds,
    nodeIndexes,
    collapsedMacroIndexes,
  ]);

  const edges: Edge[] = useMemo(() => {
    const result: Edge[] = [];

    for (const edge of graph.edges) {
      const sourceMacro = collapsedMacroIndexes.hiddenByMacro.get(edge.sourceNodeId);
      const targetMacro = collapsedMacroIndexes.hiddenByMacro.get(edge.targetNodeId);
      const sourceHidden = Boolean(sourceMacro);
      const targetHidden = Boolean(targetMacro);
      if (sourceMacro && sourceMacro === targetMacro) continue;

      let source = edge.sourceNodeId;
      let target = edge.targetNodeId;
      let sourceHandle = edge.sourcePortId;
      let targetHandle = edge.targetPortId;

      if (sourceHidden) {
        const resolved = collapsedMacroIndexes.handleByNodePort.get(`${edge.sourceNodeId}\0${edge.sourcePortId}\0source`);
        if (!resolved) continue;
        source = macroFlowId(resolved.macroId);
        sourceHandle = resolved.handleId;
      }
      if (targetHidden) {
        const resolved = collapsedMacroIndexes.handleByNodePort.get(`${edge.targetNodeId}\0${edge.targetPortId}\0target`);
        if (!resolved) continue;
        target = macroFlowId(resolved.macroId);
        targetHandle = resolved.handleId;
      }

      const cross = isCrossEnvironmentEdge(edge, nodeIndexes.byId);
      const payload = payloadByEdge.get(edge.id);
      const isSelected =
        selectedEdgeIds.includes(edge.id) || focusEdgeId === edge.id;
      const sourceNode = nodeIndexes.byId.get(edge.sourceNodeId);
      const sourcePort = sourceNode?.outputs.find(
        (port) => port.id === edge.sourcePortId,
      );
      const contractLabel = sourcePort
        ? CONTRACT_TYPE_LABELS[sourcePort.contractType]
        : "Unresolved contract";
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
        label: lod === "macro"
          ? undefined
          : [contractLabel, cross ? "cross-env" : undefined, payloadLabel]
            .filter(Boolean)
            .join(" · "),
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
          if (collapsedMacroIndexes.hiddenByMacro.has(output.id)) continue;
          for (const input of inputs) {
            if (collapsedMacroIndexes.hiddenByMacro.has(input.id)) continue;
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
  }, [focusEdgeId, graph.edges, graph.nodes, lod, selectedEdgeIds, collapsedMacroIndexes, nodeIndexes, payloadByEdge]);

  // Transient drag/selection state stays in React Flow. Commit graph positions once at drop.
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(edges);
  useEffect(() => { setFlowNodes(nodes); }, [nodes, setFlowNodes]);
  useEffect(() => { setFlowEdges(edges); }, [edges, setFlowEdges]);

  useEffect(() => {
    setLod(lodFromZoom(graph.viewport.zoom));
  }, [graph.viewport.zoom]);

  useEffect(() => {
    if (!focusNodeId) return;
    const graph = useProjectStore.getState().graph;
    const task = graph.workflow.tasks.find(t => t.id === parseTaskFlowId(focusNodeId));
    if (task) { void setCenter(task.engineeringBounds.x + task.engineeringBounds.width / 2, task.engineeringBounds.y + task.engineeringBounds.height / 2, { zoom: 0.65, duration: 250 }); return; }
    const node = graph.nodes.find((item) => item.id === focusNodeId);
    if (!node) return;
    const macroId = collapsedMacroIndexes.hiddenByMacro.get(node.id);
    if (macroId) {
      const macro = collapsedMacroIndexes.byId.get(macroId);
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
  }, [collapsedMacroIndexes, focusNodeId, getZoom, setCenter]);

  useEffect(() => {
    if (!focusEdgeId) return;
    const graph = useProjectStore.getState().graph;
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
  }, [focusEdgeId, getZoom, setCenter]);

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
        edges: useProjectStore.getState().graph.edges.filter(edge => edge.id !== reconnectingEdge.current),
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

  const onConnectEnd = useCallback((_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    const reason = rejectedConnectionReason(state, reconnectingEdge.current ?? undefined);
    if (reason) setConnectionError(reason);
    useConnectionDraftStore.getState().clearDraft();
  }, [setConnectionError]);

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

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, _node, nodesSnapshot) => {
      const movedGroups = new Set(nodesSnapshot.map(n => parseTaskFlowId(n.id)).filter(Boolean));
      for (const item of nodesSnapshot) {
        const taskId = parseTaskFlowId(item.id);
        if (taskId) moveTaskGroup(taskId, item.position.x, item.position.y);
        const macroId = parseMacroFlowId(item.id);
        if (macroId) updateMacroPosition(macroId, item.position);
        const laneId = parseSwimlaneFlowId(item.id);
        if (laneId) updateSwimlaneBounds(laneId, { x: item.position.x, y: item.position.y, width: Number(item.style?.width ?? 480), height: Number(item.style?.height ?? 640) });
      }
      const architectureUpdates = nodesSnapshot
        .filter(
          (item) =>
            !item.id.startsWith("macro:") && !item.id.startsWith("swimlane:") && !parseTaskFlowId(item.id) && !movedGroups.has(graph.nodes.find(n => n.id === item.id)?.workflowTaskId ?? null),
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
    [assignNodesToSwimlanes, updateNodePositions, updateMacroPosition, updateSwimlaneBounds, moveTaskGroup, graph.nodes],
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
        useConnectionDraftStore.getState().clearDraft();
        useSelectionStore.getState().clearSelection();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selection = useSelectionStore.getState();
        const nodeIds = [...new Set(selection.selectedNodeIds.flatMap(id => {
          const macroId = parseMacroFlowId(id);
          if (macroId) return useProjectStore.getState().graph.macroBlocks.find(m => m.id === macroId)?.nodeIds ?? [];
          return id.startsWith("swimlane:") ? [] : [id];
        }))];
        const edgeIds = selection.selectedEdgeIds.filter(
          (id) => !id.startsWith("portal-bus-"),
        );
        if (edgeIds.length > 0 && nodeIds.length === 0) {
          // Edge selection always deletes connections only — never endpoint nodes.
          event.preventDefault();
          usePendingDeleteStore.getState().requestDelete([], edgeIds);
          return;
        }
        if (nodeIds.length) {
          event.preventDefault();
          usePendingDeleteStore.getState().requestDelete(nodeIds, edgeIds);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicateNodes, redo, undo]);

  useEffect(() => {
    if (!nodesInitialized || initialFit.current) return;
    initialFit.current = true;
    if (graph.viewport.x === 0 && graph.viewport.y === 0 && graph.viewport.zoom === 1) {
      void fitView({ padding: 0.16, maxZoom: 1 });
    }
  }, [nodesInitialized, fitView, graph.viewport]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onReconnectStart={(_event, edge) => { reconnectingEdge.current = edge.id; }}
        onReconnect={(edge, connection) => {
          if (connection.sourceHandle && connection.targetHandle) reconnectPorts(edge.id, { sourceNodeId: connection.source, sourcePortId: connection.sourceHandle, targetNodeId: connection.target, targetPortId: connection.targetHandle });
        }}
        onReconnectEnd={(_event, edge, _handleType, state) => {
          const reason = rejectedConnectionReason(state, edge.id);
          if (reason) setConnectionError(reason);
          reconnectingEdge.current = null;
          useConnectionDraftStore.getState().clearDraft();
        }}
        edgesReconnectable
        reconnectRadius={18}
        connectionRadius={24}
        nodeTypes={architectureNodeTypes}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onSelectionChange={onSelectionChange}
        onNodeClick={(event, node) => {
          if (node.id.startsWith("swimlane:")) return;
          setSelection(event.shiftKey ? [...new Set([...useSelectionStore.getState().selectedNodeIds, node.id])] : [node.id]);
        }}
        onEdgeClick={onEdgeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onMove={(_event, viewport) => setLod(lodFromZoom(viewport.zoom))}
        onMoveEnd={(_event, viewport) =>
          setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })
        }
        snapToGrid
        snapGrid={[16, 16]}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        edgesFocusable
        elementsSelectable
        selectionOnDrag
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        onlyRenderVisibleElements
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={graph.viewport}
        defaultEdgeOptions={{ interactionWidth: 28 }}
        proOptions={{ hideAttribution: true }}
        aria-label="Architecture canvas"
      >
        <Background gap={16} size={1} color="#d6d3d1" />
        {!lowResourceMode && <MiniMap pannable zoomable />}
        <Controls showInteractive />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 rounded border border-[var(--athanor-mist)] bg-white/90 px-2 py-1 text-[11px] text-[var(--athanor-slate)] shadow-sm">
        {lodLabel(lod)} · zoom {(graph.viewport.zoom * 100).toFixed(0)}%
      </div>
      <div className="pointer-events-none absolute right-3 top-3 rounded border border-[var(--athanor-mist)] bg-white/90 px-2 py-1 text-[11px] text-[var(--athanor-slate)] shadow-sm">
        Scroll to pan · Space + drag or middle mouse to pan · Controls to zoom
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
