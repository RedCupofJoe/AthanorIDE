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
): Promise<ValidateResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/projects/validate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ graph }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Validation request failed with status ${response.status}`);
  }

  return ValidateResponseSchema.parse(await response.json());
}
