"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { newId } from "@athanor/contracts";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";
import { parseTaskFlowId, taskFlowId, workflowEndTasks } from "@/lib/workflow";
import { TaskNode, StartNode, EndNode } from "./TaskNode";
const nodeTypes = { workflowTask: TaskNode, workflowStart: StartNode, workflowEnd: EndNode };
export const transitionFlowId = (id: string) => `workflow-transition:${id}`;
export const parseTransitionFlowId = (id: string) =>
  id.startsWith("workflow-transition:") ? id.slice(20) : null;
function Inner() {
  const workflow = useProjectStore((s) => s.graph.workflow);
  const { addTask, mutateGraph, beginGesture } = useProjectStore();
  const selection = useSelectionStore();
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const [drawing, setDrawing] = useState(false);
  const [rect, setRect] = useState<{
    x: number;
    y: number;
    endX: number;
    endY: number;
  } | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const nodes = useMemo<Node[]>(
    () => [
      {
        id: "workflow-start",
        type: "workflowStart",
        position: { x: Math.min(40, ...workflow.tasks.map(t => t.bounds.x - 180)), y: 160 },
        data: {},
        draggable: false,
      },
      {
        id: "workflow-end", type: "workflowEnd", draggable: false, selectable: false,
        position: {
          x: Math.max(240, ...workflow.tasks.map(t => t.bounds.x + t.bounds.width + 120)),
          y: workflow.tasks.length ? Math.min(...workflow.tasks.map(t => t.bounds.y)) + 60 : 160,
        }, data: {},
      },
      ...workflow.tasks.map((task) => ({
        id: taskFlowId(task.id),
        type: "workflowTask",
        position: { x: task.bounds.x, y: task.bounds.y },
        style: { width: task.bounds.width, height: task.bounds.height },
        data: { task },
        selected: selection.selectedNodeIds.includes(taskFlowId(task.id)),
        dragHandle: ".task-drag-handle",
      })),
    ],
    [workflow.tasks, selection.selectedNodeIds],
  );
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  useEffect(() => setNodes(nodes), [nodes, setNodes]);
  useEffect(() => {
    const id = selection.focusNodeId && parseTaskFlowId(selection.focusNodeId);
    const task = workflow.tasks.find((t) => t.id === id);
    if (task)
      void setCenter(
        task.bounds.x + task.bounds.width / 2,
        task.bounds.y + task.bounds.height / 2,
        { zoom: 1, duration: 250 },
      );
  }, [selection.focusNodeId, workflow.tasks, setCenter]);
  const edges: Edge[] = workflow.transitions.map((t) => ({
    id: transitionFlowId(t.id),
    source: t.sourceTaskId ? taskFlowId(t.sourceTaskId) : "workflow-start",
    target: taskFlowId(t.targetTaskId),
    sourceHandle: "out",
    targetHandle: "in",
    label: `${t.kind === "recovery" ? "A" : ""}${t.stage}`,
    selected: selection.selectedEdgeIds.includes(transitionFlowId(t.id)),
    style: {
      stroke: t.kind === "recovery" ? "#b45309" : "#475569",
      strokeWidth: 2,
      strokeDasharray: t.kind === "recovery" ? "6 4" : undefined,
    },
    markerEnd: { type: MarkerType.ArrowClosed },
    interactionWidth: 24,
  }));
  edges.push(...workflowEndTasks(workflow).map(task => ({
    id: `workflow-end:${task.id}`, source: taskFlowId(task.id), target: "workflow-end",
    sourceHandle: "out", targetHandle: "in", label: "Complete", selectable: false,
    deletable: false, style: { stroke: "#047857", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed },
  })));
  const connect = (connection: Connection) => {
    const target = parseTaskFlowId(connection.target),
      source =
        connection.source === "workflow-start"
          ? null
          : parseTaskFlowId(connection.source);
    if (
      !target ||
      source === target ||
      (source === null && connection.source !== "workflow-start") ||
      workflow.transitions.some(
        (t) => t.sourceTaskId === source && t.targetTaskId === target,
      )
    )
      return;
    const stage =
      source === null
        ? 1
        : 1 +
          (workflow.transitions.find(
            (t) => t.kind === "normal" && t.targetTaskId === source,
          )?.stage ?? 1);
    const id = newId();
    mutateGraph((g) => ({
      ...g,
      workflow: {
        ...g.workflow,
        transitions: [
          ...g.workflow.transitions,
          {
            id,
            sourceTaskId: source,
            targetTaskId: target,
            kind: "normal",
            stage,
            recoveryDescription: "",
          },
        ],
      },
    }));
    selection.setSelection([], [transitionFlowId(id)]);
  };
  return (
    <div
      className="relative h-full min-h-0"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea,select")) return;
        const ids = selection.selectedNodeIds
          .map(parseTaskFlowId)
          .filter((id): id is string => Boolean(id));
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
          e.preventDefault();
          ids.forEach((id) => useProjectStore.getState().cloneTask(id));
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) useProjectStore.getState().redo();
          else useProjectStore.getState().undo();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          ids.forEach((id) => useProjectStore.getState().removeTask(id));
          const edgeIds = selection.selectedEdgeIds.map(parseTransitionFlowId);
          if (edgeIds.some(Boolean))
            mutateGraph((g) => ({
              ...g,
              workflow: {
                ...g.workflow,
                transitions: g.workflow.transitions.filter(
                  (t) => !edgeIds.includes(t.id),
                ),
              },
            }));
          selection.clearSelection();
        }
        if (e.key === "Escape") {
          setDrawing(false);
          setRect(null);
          selection.clearSelection();
        }
      }}
    >
      <div className="absolute left-3 top-3 z-20 flex gap-2 rounded-lg border bg-white p-2 shadow-sm">
        <button
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
          onClick={() => {
            const id = addTask();
            selection.focusNode(taskFlowId(id));
          }}
        >
          Add task
        </button>
        <button
          aria-pressed={drawing}
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => setDrawing(!drawing)}
        >
          {drawing ? "Cancel drawing" : "Draw task"}
        </button>
      </div>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={connect}
        defaultViewport={workflow.viewport}
        onMoveEnd={(_, viewport) =>
          mutateGraph(
            (g) => ({ ...g, workflow: { ...g.workflow, viewport } }),
            false,
          )
        }
        onNodeDragStart={beginGesture}
        onNodeDragStop={(_, node) => {
          const id = parseTaskFlowId(node.id);
          const task = workflow.tasks.find((t) => t.id === id);
          if (task)
            mutateGraph(
              (g) => ({
                ...g,
                workflow: {
                  ...g.workflow,
                  tasks: g.workflow.tasks.map((t) =>
                    t.id === id
                      ? { ...t, bounds: { ...t.bounds, ...node.position } }
                      : t,
                  ),
                },
              }),
              false,
            );
        }}
        onNodeClick={(_, node) => { if (node.id !== "workflow-end") selection.setSelection([node.id]); }}
        onEdgeClick={(_, edge) => { if (!edge.id.startsWith("workflow-end:")) selection.setSelection([], [edge.id]); }}
        onPaneClick={() => selection.clearSelection()}
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {drawing && (
        <div
          role="presentation"
          className="absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            origin.current = { x: e.clientX, y: e.clientY };
            const box = e.currentTarget.getBoundingClientRect();
            setRect({
              x: e.clientX - box.left,
              y: e.clientY - box.top,
              endX: e.clientX - box.left,
              endY: e.clientY - box.top,
            });
          }}
          onPointerMove={(e) => {
            if (!origin.current) return;
            const box = e.currentTarget.getBoundingClientRect();
            setRect(
              (r) =>
                r && {
                  ...r,
                  endX: e.clientX - box.left,
                  endY: e.clientY - box.top,
                },
            );
          }}
          onPointerUp={(e) => {
            if (!origin.current) return;
            const a = screenToFlowPosition(origin.current),
              b = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const id = addTask({
              x: Math.min(a.x, b.x),
              y: Math.min(a.y, b.y),
              width: Math.max(280, Math.abs(a.x - b.x)),
              height: Math.max(300, Math.abs(a.y - b.y)),
            });
            origin.current = null;
            setRect(null);
            setDrawing(false);
            selection.setSelection([taskFlowId(id)]);
          }}
        >
          {rect && (
            <div
              className="absolute rounded-xl border-2 border-blue-500 bg-blue-100/40"
              style={{
                left: Math.min(rect.x, rect.endX),
                top: Math.min(rect.y, rect.endY),
                width: Math.abs(rect.endX - rect.x),
                height: Math.abs(rect.endY - rect.y),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
