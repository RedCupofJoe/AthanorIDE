"use client";
import { useState } from "react";
import {
  taskInstructions,
  type ArchitectureGraph,
  type WorkflowTask,
} from "@athanor/contracts";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";
import { useUiPreferencesStore } from "@/store/ui-preferences-store";
import {
  disconnectedCandidates,
  optionalPortCandidates,
  pruneOptionalPorts,
  restoreOptionalPorts,
  parseTaskFlowId,
  taskFlowId,
  isExecutable,
} from "@/lib/workflow";
import { validateCurrentProject } from "@/lib/validate";
import { BriefField } from "./TaskNode";
import { parseTransitionFlowId } from "./WorkflowCanvas";
const field = "mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm";
const button = "rounded border px-3 py-1.5 text-xs hover:bg-slate-50";

export function PruneControls({
  nodeId,
  taskId,
}: {
  nodeId?: string;
  taskId?: string;
}) {
  const graph = useProjectStore((s) => s.graph);
  const [preview, setPreview] = useState<{
    graph: ArchitectureGraph;
    names: string[];
  } | null>(null);
  const names = nodeId
    ? optionalPortCandidates(graph, nodeId).map(
        (p) => `${p.direction}: ${p.name} (${p.id})`,
      )
    : disconnectedCandidates(graph, taskId!).map((n) => `${n.name} (${n.id})`);
  return (
    <div className="space-y-2 border-t pt-3">
      <button
        className={button}
        disabled={!names.length}
        onClick={() => setPreview({ graph, names })}
      >
        {nodeId ? "Prune unused ports" : "Prune disconnected components"} (
        {names.length})
      </button>
      {nodeId && (
        <button
          className={button}
          disabled={!graph.nodes.find((n) => n.id === nodeId)?.prunedPorts}
          onClick={() => {
            useProjectStore
              .getState()
              .mutateGraph((g) => restoreOptionalPorts(g, nodeId));
            void validateCurrentProject();
          }}
        >
          Restore optional ports
        </button>
      )}
      {preview && (
        <section
          role="dialog"
          aria-label="Pruning preview"
          className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs"
        >
          <p className="font-semibold">Remove these items</p>
          <ul className="list-inside list-disc">
            {preview.names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {preview.graph !== graph && (
            <p>Project changed. Open a fresh preview before pruning.</p>
          )}
          <button
            className={button}
            disabled={preview.graph !== graph}
            onClick={() => {
              useProjectStore.getState().mutateGraph((g) =>
                nodeId
                  ? pruneOptionalPorts(g, nodeId)
                  : {
                      ...g,
                      nodes: g.nodes.filter(
                        (n) =>
                          !disconnectedCandidates(g, taskId!).some(
                            (c) => c.id === n.id,
                          ),
                      ),
                    },
              );
              setPreview(null);
              void validateCurrentProject();
            }}
          >
            Apply pruning
          </button>{" "}
          <button className={button} onClick={() => setPreview(null)}>
            Cancel
          </button>
          <p>
            Required ports, task boundaries, and linked components are
            preserved. Undo restores removals.
          </p>
        </section>
      )}
    </div>
  );
}
function Boundaries({ task }: { task: WorkflowTask }) {
  const graph = useProjectStore((s) => s.graph);
  const members = graph.nodes.filter((n) => n.workflowTaskId === task.id);
  return (
    <div className="space-y-2">
      {(["inputBinding", "outputBinding"] as const).map((key) => (
        <label className="block text-xs font-medium" key={key}>
          {key === "inputBinding"
            ? "Workflow input boundary"
            : "Task result boundary"}
          <select
            className={field}
            value={task[key] ? JSON.stringify(task[key]) : ""}
            onChange={(e) =>
              useProjectStore.getState().updateTask(task.id, {
                [key]: e.target.value ? JSON.parse(e.target.value) : undefined,
              })
            }
          >
            <option value="">Choose a string port…</option>
            {members.flatMap((n) =>
              n[key === "inputBinding" ? "inputs" : "outputs"]
                .filter((p) => p.contractType === "STRING")
                .map((p) => (
                  <option
                    key={`${n.id}:${p.id}`}
                    value={JSON.stringify({ nodeId: n.id, portId: p.id })}
                  >
                    {n.name} · {p.name}
                  </option>
                )),
            )}
          </select>
        </label>
      ))}
      <p className="text-xs text-slate-500">
        The workflow supplies the input boundary. Remove any component wire into
        that port.
      </p>
    </div>
  );
}
export function WorkflowInspector() {
  const graph = useProjectStore((s) => s.graph);
  const { updateTask, cloneTask, removeTask, mutateGraph } = useProjectStore();
  const selected = useSelectionStore();
  const role = useUiPreferencesStore((s) => s.workspaceRole);
  const taskId = parseTaskFlowId(selected.selectedNodeIds[0] ?? "");
  const task = graph.workflow.tasks.find((t) => t.id === taskId);
  const edgeId = parseTransitionFlowId(selected.selectedEdgeIds[0] ?? "");
  const edge = graph.workflow.transitions.find((e) => e.id === edgeId);
  if (edge)
    return (
      <aside aria-label="Workflow connection" className="space-y-3 p-4">
        <h2 className="font-semibold">Workflow connection</h2>
        <p className="text-xs">
          {graph.workflow.tasks.find((t) => t.id === edge.sourceTaskId)?.name ??
            "Start"}{" "}
          → {graph.workflow.tasks.find((t) => t.id === edge.targetTaskId)?.name}
        </p>
        <label className="block text-xs">
          Path type
          <select
            className={field}
            value={edge.kind}
            onChange={(e) =>
              mutateGraph((g) => ({
                ...g,
                workflow: {
                  ...g.workflow,
                  transitions: g.workflow.transitions.map((t) =>
                    t.id === edge.id
                      ? {
                          ...t,
                          kind: e.target.value as "normal" | "recovery",
                          stage:
                            e.target.value === "recovery"
                              ? (g.workflow.transitions.find(
                                  (n) =>
                                    n.kind === "normal" &&
                                    n.targetTaskId === edge.sourceTaskId,
                                )?.stage ?? 1)
                              : t.stage,
                        }
                      : t,
                  ),
                },
              }))
            }
          >
            <option value="normal">Normal stage</option>
            <option value="recovery" disabled={edge.sourceTaskId === null}>
              Failure recovery (A)
            </option>
          </select>
        </label>
        <label className="block text-xs">
          {edge.kind === "recovery" ? "Failed task stage" : "Stage number"}
          <input
            className={field}
            type="number"
            min={1}
            value={edge.stage}
            onChange={(e) => {
              const stage = Number(e.target.value);
              if (Number.isInteger(stage) && stage > 0)
                mutateGraph((g) => ({
                  ...g,
                  workflow: {
                    ...g.workflow,
                    transitions: g.workflow.transitions.map((t) =>
                      t.id === edge.id ? { ...t, stage } : t,
                    ),
                  },
                }));
            }}
          />
        </label>
        {edge.kind === "recovery" && (
          <BriefField
            label="Recovery behavior"
            value={edge.recoveryDescription}
            onSave={(recoveryDescription) =>
              mutateGraph((g) => ({
                ...g,
                workflow: {
                  ...g.workflow,
                  transitions: g.workflow.transitions.map((t) =>
                    t.id === edge.id ? { ...t, recoveryDescription } : t,
                  ),
                },
              }))
            }
          />
        )}
        <p className="text-xs text-slate-500">
          Equal numbers run in parallel. Recovery replaces the failed task’s
          result and resumes its normal path.
        </p>
        <button
          className={button}
          onClick={() => {
            mutateGraph((g) => ({
              ...g,
              workflow: {
                ...g.workflow,
                transitions: g.workflow.transitions.filter(
                  (t) => t.id !== edge.id,
                ),
              },
            }));
            selected.clearSelection();
          }}
        >
          Delete connection
        </button>
      </aside>
    );
  if (task)
    return (
      <aside aria-label="Workflow task" className="space-y-3 p-4">
        <h2 className="font-semibold">Task brief</h2>
        <label className="block text-xs">
          Task name
          <input
            className={field}
            value={task.name}
            onChange={(e) =>
              updateTask(task.id, { name: e.target.value || "Untitled task" })
            }
          />
        </label>
        <label className="flex items-center gap-3 text-xs">
          Color
          <input
            aria-label="Task color"
            type="color"
            value={task.color}
            onChange={(e) => updateTask(task.id, { color: e.target.value })}
          />
        </label>
        {role !== "sme" && (
          <>
            <p className="whitespace-pre-wrap text-xs text-slate-600">
              {taskInstructions(task)}
            </p>
            <Boundaries task={task} />
          </>
        )}
        <div className="flex gap-2">
          <button className={button} onClick={() => cloneTask(task.id)}>
            Clone brief
          </button>
          <button
            className={button}
            onClick={() => {
              removeTask(task.id);
              selected.clearSelection();
            }}
          >
            Delete task
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Deleting a task unassigns its components.
        </p>
        {role === "security" && <PruneControls key={task.id} taskId={task.id} />}
      </aside>
    );
  return (
    <aside aria-label="Workflow overview" className="space-y-3 p-4">
      <h2 className="font-semibold">Workflow overview</h2>
      <p className="text-xs text-slate-600">
        Draw task boxes, define their briefs, and connect Start to stage 1.
        Select a connection to edit its stage or recovery path.
      </p>
      <BriefField
        label="Workflow input"
        value={graph.workflow.input}
        onSave={(input) =>
          mutateGraph((g) => ({ ...g, workflow: { ...g.workflow, input } }))
        }
      />
      <label className="block text-xs">
        Maximum parallel tasks
        <input
          type="number"
          min={1}
          max={32}
          className={field}
          value={graph.workflow.maxParallelTasks}
          onChange={(e) => {
            const maxParallelTasks = Number(e.target.value);
            if (
              Number.isInteger(maxParallelTasks) &&
              maxParallelTasks >= 1 &&
              maxParallelTasks <= 32
            )
              mutateGraph((g) => ({
                ...g,
                workflow: { ...g.workflow, maxParallelTasks },
              }));
          }}
        />
      </label>
      <p className="text-xs font-medium">
        Planned stages · no endpoints are called
      </p>
      <ul className="space-y-2">
        {graph.workflow.tasks.map((t) => {
          const paths = graph.workflow.transitions.filter(
            (e) => e.targetTaskId === t.id,
          );
          return (
            <li key={t.id}>
              <button
                className="text-left text-sm underline decoration-slate-300"
                onClick={() => selected.focusNode(taskFlowId(t.id))}
              >
                <span style={{ color: t.color }}>●</span> {t.name} ·{" "}
                {[
                  ...new Set(
                    paths.map(
                      (e) => `${e.kind === "recovery" ? "A" : ""}${e.stage}`,
                    ),
                  ),
                ].join(", ") || "Unconnected"}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
export function ComponentWorkflowControls() {
  const graph = useProjectStore((s) => s.graph);
  const ids = useSelectionStore((s) => s.selectedNodeIds);
  const role = useUiPreferencesStore((s) => s.workspaceRole);
  const nodes = graph.nodes.filter((n) => ids.includes(n.id));
  if (!nodes.length) return null;
  const node = nodes.length === 1 ? nodes[0] : undefined;
  const task = graph.workflow.tasks.find((t) => t.id === node?.workflowTaskId);
  return (
    <section
      aria-label="Task membership and instructions"
      className="space-y-3 border-b p-4"
    >
      <label className="block text-xs font-semibold">
        Task group
        <select
          className={field}
          value={
            nodes.every((n) => n.workflowTaskId === nodes[0]?.workflowTaskId)
              ? (nodes[0]?.workflowTaskId ?? "")
              : "mixed"
          }
          onChange={(e) =>
            useProjectStore.getState().assignTask(
              nodes.map((n) => n.id),
              e.target.value || undefined,
            )
          }
        >
          <option value="">Shared / unassigned</option>
          <option value="mixed" disabled>
            Multiple groups
          </option>
          {graph.workflow.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {node && task && isExecutable(node.type) && (
        <>
          <p
            className={`text-xs font-medium ${node.instructionMode === "override" ? "text-amber-800" : "text-emerald-800"}`}
          >
            {node.instructionMode === "override"
              ? "Instruction override · AgentOpSec review"
              : "Instructions inherited from SME"}
          </p>
          <button
            className={button}
            onClick={() =>
              useProjectStore.getState().mutateGraph((g) => ({
                ...g,
                nodes: g.nodes.map((n) =>
                  n.id === node.id
                    ? {
                        ...n,
                        instructionMode:
                          n.instructionMode === "override"
                            ? "inherit"
                            : "override",
                        configuration: {
                          ...n.configuration,
                          instructions:
                            n.instructionMode === "override"
                              ? n.configuration.instructions
                              : taskInstructions(task),
                        },
                      }
                    : n,
                ),
              }))
            }
          >
            {node.instructionMode === "override"
              ? "Restore SME instructions"
              : "Override instructions"}
          </button>
          <details open={role === "security"}>
            <summary className="cursor-pointer text-xs">
              SME brief and effective instructions
            </summary>
            <h3 className="mt-2 text-xs font-semibold">SME brief</h3>
            <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
              {taskInstructions(task)}
            </pre>
            <h3 className="mt-2 text-xs font-semibold">
              Effective instructions
            </h3>
            <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
              {node.instructionMode === "override"
                ? String(node.configuration.instructions ?? "")
                : taskInstructions(task)}
            </pre>
          </details>
        </>
      )}
      {node && role === "security" && <PruneControls key={node.id} nodeId={node.id} />}
    </section>
  );
}
