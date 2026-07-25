/**
 * Client for POST /api/v1/projects/execute (safe IDE payload inspection).
 */
import { z } from "zod";

import type { ArchitectureGraph } from "@athanor/contracts";

import { getApiBaseUrl } from "./api";

const ExecutionStepSchema = z.object({
  nodeId: z.string(),
  nodeName: z.string(),
  nodeType: z.string(),
  status: z.enum(["ok", "skipped", "error"]),
  inputs: z.record(z.string()).default({}),
  outputs: z.record(z.string()).default({}),
  message: z.string().nullable().optional(),
  durationMs: z.number(),
});

const EdgePayloadSchema = z.object({
  edgeId: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  value: z.string(),
  contractType: z.string(),
});

const ExecuteResponseSchema = z.object({
  status: z.enum(["success", "partial", "failed"]),
  durationMs: z.number(),
  steps: z.array(ExecutionStepSchema),
  edgePayloads: z.array(EdgePayloadSchema).default([]),
  finalOutputs: z.array(z.record(z.unknown())).default([]),
  validationIssueCount: z.number().default(0),
});

export type ExecuteResponse = z.infer<typeof ExecuteResponseSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export type EdgePayload = z.infer<typeof EdgePayloadSchema>;

export async function executeProject(
  graph: ArchitectureGraph,
  options?: { overrideText?: string },
  signal?: AbortSignal,
): Promise<ExecuteResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/projects/execute`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      graph,
      overrideText: options?.overrideText,
    }),
    signal,
  });

  if (!response.ok) {
    let message = `Execution failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof (body as { message: unknown }).message === "string"
      ) {
        message = (body as { message: string }).message;
      }
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  return ExecuteResponseSchema.parse(await response.json());
}
