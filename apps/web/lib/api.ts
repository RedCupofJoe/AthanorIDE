/**
 * Shared API base URL and fetch helpers for the web app.
 */
import { z } from "zod";

const HealthPayloadSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  schemaVersion: z.string(),
});

export type HealthPayload = z.infer<typeof HealthPayloadSchema>;

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthPayload> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/health`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  const json: unknown = await response.json();
  return HealthPayloadSchema.parse(json);
}
