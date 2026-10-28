/**
 * Assistant draft application and the write-only vault token status.
 * The token value is never read back into the page.
 */
import {
  newId,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type WorkflowTask,
  type WorkflowTransition,
} from "@athanor/contracts";
import { createNodeFromDefinition, getNodeDefinition } from "@athanor/node-definitions";
import { z } from "zod";

import { getApiBaseUrl } from "@/lib/api";

export const ASSISTANT_TOKEN_NAME = "ATHANOR_ASSISTANT_TOKEN";

const EngineeringTaskPlanSchema = z.object({
  taskId: z.string(), name: z.string(), approach: z.string(),
  inputContract: z.string(), outputContract: z.string(),
  acceptanceChecks: z.array(z.string()), connectedTools: z.array(z.string()),
  setupRequirements: z.array(z.string()),
});
export type EngineeringTaskPlan = z.infer<typeof EngineeringTaskPlanSchema>;

export function engineeringPlans(graph: ArchitectureGraph): EngineeringTaskPlan[] {
  return graph.nodes.flatMap((node) => {
    const result = EngineeringTaskPlanSchema.safeParse(node.metadata?.assistantEngineering);
    return result.success ? [result.data] : [];
  });
}

export type DraftNode = {
  ref: string;
  taskId: string;
  type: string;
  name: string;
  configuration: Record<string, unknown>;
  instructionMode?: "inherit" | "override";
  engineeringReport?: EngineeringTaskPlan;
};

export type DraftEdge = {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
};

export type ArchitectureDraft = {
  nodes: DraftNode[];
  edges: DraftEdge[];
  summary: string;
  taskPlans?: EngineeringTaskPlan[];
  workflowTransitions?: WorkflowTransition[];
};

export function briefsReady(tasks: readonly WorkflowTask[]): boolean {
  return tasks.length > 0 && tasks.every((task) => task.role.trim() && task.expectedTasks.trim());
}

export function assistantTokenStatus(stored: boolean, useToken = true): string {
  if (!useToken) return "No API token will be sent. The local vault is not required.";
  return stored
    ? "A token is stored in the local vault. Enter a new token only to replace it."
    : "No assistant token is stored. Unlock the local vault, then save a token.";
}

export function emptyTaskIds(graph: ArchitectureGraph): string[] {
  const occupied = new Set(
    graph.nodes.map((node) => node.workflowTaskId).filter((id): id is string => Boolean(id)),
  );
  return graph.workflow.tasks.filter((task) => !occupied.has(task.id)).map((task) => task.id);
}

function portId(node: ArchitectureNode, direction: "inputs" | "outputs", name: string): string | undefined {
  return node[direction].find((port) => port.name === name)?.id;
}

export function applyDraft(
  graph: ArchitectureGraph,
  draft: ArchitectureDraft,
  targetTaskIds?: readonly string[],
): { graph: ArchitectureGraph; added: number } {
  const openTasks = new Set(targetTaskIds ?? emptyTaskIds(graph));
  const accepted = draft.nodes.filter((node) => openTasks.has(node.taskId) && getNodeDefinition(node.type));
  if (accepted.length === 0) return { graph, added: 0 };
  for (const taskId of openTasks) {
    if (!accepted.some((node) => node.taskId === taskId &&
      (node.type === "agent.sandboxed" || node.type.startsWith("harness.")))) {
      throw new Error("The draft is missing an agent stage. No components were changed.");
    }
  }
  const replacedIds = new Set(graph.nodes
    .filter((node) => node.workflowTaskId && openTasks.has(node.workflowTaskId))
    .map((node) => node.id));
  if (graph.macroBlocks.some((macro) => macro.nodeIds.some((id) => replacedIds.has(id)))) {
    throw new Error("Expand macros inside the selected tasks before rebuilding their components.");
  }

  const counts = new Map<string, number>();
  const created = new Map<string, ArchitectureNode>();
  const nodes = graph.nodes.filter((node) => !replacedIds.has(node.id));
  for (const spec of accepted) {
    const task = graph.workflow.tasks.find((item) => item.id === spec.taskId);
    const index = counts.get(spec.taskId) ?? 0;
    const executable = spec.type === "agent.sandboxed" || spec.type.startsWith("harness.");
    if (!executable) counts.set(spec.taskId, index + 1);
    const origin = task?.engineeringBounds ?? { x: 80, y: 80 };
    const node = createNodeFromDefinition(
      spec.type,
      { x: origin.x + (executable ? 440 : 48), y: origin.y + (executable ? 160 : 48 + index * 180) },
      { name: spec.name, configuration: spec.configuration },
    );
    node.workflowTaskId = spec.taskId;
    if (spec.type === "agent.sandboxed" || spec.type.startsWith("harness.")) {
      node.instructionMode = spec.instructionMode ?? "inherit";
    }
    if (spec.engineeringReport) {
      node.metadata = { ...node.metadata, assistantEngineering: spec.engineeringReport };
    }
    created.set(spec.ref, node);
    nodes.push(node);
  }

  const edges: ArchitectureEdge[] = graph.edges.filter((edge) =>
    !replacedIds.has(edge.sourceNodeId) && !replacedIds.has(edge.targetNodeId));
  for (const spec of draft.edges) {
    const source = created.get(spec.source);
    const target = created.get(spec.target);
    if (!source || !target) continue;
    const sourcePortId = portId(source, "outputs", spec.sourcePort);
    const targetPortId = portId(target, "inputs", spec.targetPort);
    if (!sourcePortId || !targetPortId) continue;
    edges.push({
      id: newId(),
      sourceNodeId: source.id,
      sourcePortId,
      targetNodeId: target.id,
      targetPortId,
    });
  }

  const tasks = graph.workflow.tasks.map((task) => {
    if (!openTasks.has(task.id)) return task;
    const members = [...created.values()].filter((node) => node.workflowTaskId === task.id);
    const executable = members.find(
      (node) => node.type === "agent.sandboxed" || node.type.startsWith("harness."),
    );
    if (!executable) return task;
    const input = portId(executable, "inputs", "task");
    const output = portId(executable, "outputs", "result");
    return {
      ...task,
      engineeringBounds: {
        ...task.engineeringBounds,
        width: Math.max(task.engineeringBounds.width, 900),
        height: Math.max(task.engineeringBounds.height, (counts.get(task.id) ?? 0) * 180 + 100),
      },
      ...(input ? { inputBinding: { nodeId: executable.id, portId: input } } : {}),
      ...(output ? { outputBinding: { nodeId: executable.id, portId: output } } : {}),
    };
  });

  return {
    added: created.size,
    graph: {
      ...graph,
      nodes,
      edges,
      workflow: {
        ...graph.workflow, tasks,
        transitions: graph.workflow.transitions.length === 0 && draft.workflowTransitions
          ? draft.workflowTransitions : graph.workflow.transitions,
      },
    },
  };
}

async function assistantFetch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Assistant request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string; message?: string };
      message = payload.detail ?? payload.message ?? message;
    } catch {
      // The status line is enough when the body is not JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function requestDraft(
  endpoint: string,
  model: string,
  graph: ArchitectureGraph,
  useToken = true,
  targetTaskIds: readonly string[] = emptyTaskIds(graph),
): Promise<ArchitectureDraft> {
  return assistantFetch<ArchitectureDraft>("/api/v1/assistant/draft", {
    endpoint,
    model,
    useToken,
    targetTaskIds,
    workflow: {
      tasks: graph.workflow.tasks
        .map((task) => ({
          id: task.id,
          name: task.name,
          role: task.role,
          expectedTasks: task.expectedTasks,
          constraints: task.constraints,
        })),
      transitions: graph.workflow.transitions,
      input: graph.workflow.input,
      availableTools: graph.nodes.filter(node => node.type === "agent.tool" || node.type === "mcp.client")
        .map(node => ({ name: node.name, type: node.type, configuration: node.configuration })),
    },
  });
}

export function requestAnswer(
  endpoint: string,
  model: string,
  question: string,
  passages: { label: string; text: string }[],
  useToken = true,
): Promise<{ answer: string }> {
  return assistantFetch("/api/v1/assistant/ask", { endpoint, model, question, passages, useToken });
}
