/**
 * Client for NL compiler generate/validate endpoints.
 */
import { z } from "zod";

import { getApiBaseUrl } from "./api";

const AuditSchema = z.object({
  provider: z.string(),
  maxAttempts: z.number(),
  attempts: z.array(
    z.object({
      attempt: z.number(),
      stage: z.string(),
      success: z.boolean(),
      message: z.string(),
      changed: z.boolean().optional(),
      details: z.record(z.unknown()).optional(),
    }),
  ),
  finalStatus: z.string(),
  warnings: z.array(z.string()).default([]),
});

const CompilerGenerateResponseSchema = z.object({
  status: z.string(),
  sourceCode: z.string(),
  testCode: z.string(),
  spec: z.record(z.unknown()),
  audit: AuditSchema,
  sandbox: z.object({
    status: z.string(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().nullable().optional(),
    durationMs: z.number().nullable().optional(),
    reason: z.string().nullable().optional(),
  }),
  ruffOutput: z.string().optional(),
  mypyOutput: z.string().optional(),
  durationMs: z.number(),
});

export type CompilerGenerateResponse = z.infer<typeof CompilerGenerateResponseSchema>;

export async function compileTransformation(params: {
  instruction: string;
  sampleInput?: string;
  provenance?: string[];
}): Promise<CompilerGenerateResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/compiler/generate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instruction: params.instruction,
      sampleInput: params.sampleInput ?? "Hello World",
      provenance: params.provenance ?? [],
    }),
  });

  if (!response.ok) {
    throw new Error(`Compile failed with status ${response.status}`);
  }

  return CompilerGenerateResponseSchema.parse(await response.json());
}
