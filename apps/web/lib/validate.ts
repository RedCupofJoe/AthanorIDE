/**
 * Client for POST /api/v1/projects/validate.
 */
import { z } from "zod";

import { getApiBaseUrl } from "./api";
import type { ArchitectureGraph } from "@athanor/contracts";

export const ValidationIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  code: z.string(),
  message: z.string(),
  nodeId: z.string().nullable().optional(),
  edgeId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  transitionId: z.string().nullable().optional(),
  portId: z.string().nullable().optional(),
  fieldPath: z.string().nullable().optional(),
  suggestedAction: z.string().nullable().optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

const ValidateResponseSchema = z.object({
  valid: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  durationMs: z.number(),
});

export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;

export async function validateProject(
  graph: ArchitectureGraph,
  signal?: AbortSignal,
  profile: "design" | "deployment" = "deployment",
): Promise<ValidateResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/projects/validate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ graph, profile }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Validation request failed with status ${response.status}`);
  }

  return ValidateResponseSchema.parse(await response.json());
}

let validationRequest = 0;

/** Ignore stale responses if the project changed while validation was running. */
export async function validateCurrentProject(
  profile: "design" | "deployment" = "deployment",
): Promise<void> {
  const { useProjectStore } = await import("@/store/project-store");
  const { useValidationStore } = await import("@/store/validation-store");
  const request = ++validationRequest;
  const graph = useProjectStore.getState().graph;
  useValidationStore.getState().setRunning();
  try {
    const result = await validateProject(graph, undefined, profile);
    if (
      request === validationRequest &&
      useProjectStore.getState().graph === graph
    )
      useValidationStore
        .getState()
        .setResult(result.valid, result.issues, result.durationMs);
  } catch (error) {
    if (
      request === validationRequest &&
      useProjectStore.getState().graph === graph
    )
      useValidationStore
        .getState()
        .setError(error instanceof Error ? error.message : "Validation failed");
  } finally {
    if (
      request === validationRequest &&
      useProjectStore.getState().graph !== graph &&
      useValidationStore.getState().status === "running"
    )
      useValidationStore.getState().clear();
  }
}
