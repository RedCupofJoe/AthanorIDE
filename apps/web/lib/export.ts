/**
 * Client for POST /api/v1/projects/export and ZIP download helpers.
 */
import { z } from "zod";

import type { ArchitectureGraph } from "@athanor/contracts";

import { getApiBaseUrl } from "./api";
import { ValidationIssueSchema } from "./validate";

const ManifestEntrySchema = z.object({
  path: z.string(),
  bytes: z.number(),
  sha256: z.string(),
});

const ExportResponseSchema = z.object({
  projectSlug: z.string(),
  files: z.record(z.string()),
  manifest: z.array(ManifestEntrySchema),
  durationMs: z.number(),
  fileCount: z.number(),
  validationIssues: z.array(ValidationIssueSchema).default([]),
  archiveBase64: z.string(),
});

export { ExportResponseSchema };
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

export type ExportOptions = {
  exportFormat?: "code" | "helm" | "podman" | "docker" | "openshift" | "npm" | "makefile";
  projectSlug?: string;
  includeDockerCompat?: boolean;
  includeKubernetes?: boolean;
  includeOpenShift?: boolean;
  includeTerraform?: boolean;
  includeArgoCd?: boolean;
};

export async function exportProject(
  graph: ArchitectureGraph,
  options?: ExportOptions,
  signal?: AbortSignal,
): Promise<ExportResponse> {
  const exportConfiguration = graph.exportConfiguration;
  const response = await fetch(`${getApiBaseUrl()}/api/v1/projects/export`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      graph,
      projectSlug: options?.projectSlug,
      exportFormat: options?.exportFormat ?? "code",
      includeDockerCompat:
        options?.includeDockerCompat ?? exportConfiguration?.includeDockerCompat ?? false,
      includeKubernetes:
        options?.includeKubernetes ?? exportConfiguration?.includeKubernetes ?? false,
      includeOpenShift:
        options?.includeOpenShift ?? exportConfiguration?.includeOpenShift ?? false,
      includeTerraform:
        options?.includeTerraform ?? exportConfiguration?.includeTerraform ?? false,
      includeArgoCd:
        options?.includeArgoCd ?? exportConfiguration?.includeArgoCd ?? false,
    }),
    signal,
  });

  if (!response.ok) {
    let message = `Export failed with status ${response.status}`;
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
      // keep default message
    }
    throw new Error(message);
  }

  return ExportResponseSchema.parse(await response.json());
}

export function downloadExportZip(result: ExportResponse): void {
  const binary = atob(result.archiveBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.projectSlug}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
