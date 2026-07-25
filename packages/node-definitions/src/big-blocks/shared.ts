/**
 * Shared configuration field builders for Big Blocks.
 *
 * Every Big Block ships opinionated open-source defaults, optional cloud
 * endpoint/URI + secret-name references (never embedded tokens), and a
 * bottom custom template for full overrides while staying local-first.
 */
import type { ConfigFieldDefinition } from "../types.js";

/** Standard bottom-of-form customization fields shared by all Big Blocks. */
export function bigBlockTemplateFields(
  defaultTemplate: string,
): ConfigFieldDefinition[] {
  return [
    {
      key: "useCustomTemplate",
      label: "Use custom template",
      description:
        "When enabled, the custom template below overrides the opinionated defaults.",
      type: "boolean",
      required: true,
      defaultValue: false,
      advanced: true,
    },
    {
      key: "customTemplate",
      label: "Custom template",
      description:
        "Full YAML/JSON (or declarative) override for this Big Block. Local-first: keep secrets out of this field — reference secret names instead.",
      type: "text",
      required: false,
      defaultValue: defaultTemplate,
      advanced: true,
      recommendedDefaultExplanation:
        "Edit freely for power users; leave unused when relying on the preset stack.",
    },
  ];
}

/** Local-first deployment + optional cloud URI / secret-name binding. */
export function bigBlockCloudFields(
  options?: Partial<{
    defaultMode: string;
    defaultProvider: string;
    defaultUri: string;
  }>,
): ConfigFieldDefinition[] {
  return [
    {
      key: "deploymentMode",
      label: "Deployment mode",
      description: "Prefer local runtimes; cloud is opt-in via URI + secret name.",
      type: "select",
      required: true,
      defaultValue: options?.defaultMode ?? "local",
      options: ["local", "hybrid", "cloud"],
    },
    {
      key: "cloudProvider",
      label: "Cloud / provider target",
      description: "Optional hyperscaler or managed endpoint family.",
      type: "select",
      required: true,
      defaultValue: options?.defaultProvider ?? "none",
      options: ["none", "aws", "azure", "gcp", "openai-compatible", "custom"],
    },
    {
      key: "endpointUri",
      label: "Endpoint URI",
      description:
        "Local or cloud base URL (e.g. http://127.0.0.1:8080 or https://…). Leave empty for pure local defaults.",
      type: "string",
      required: false,
      defaultValue: options?.defaultUri ?? "",
    },
    {
      key: "tokenSecretName",
      label: "Token secret name",
      description:
        "Name of a secret to resolve at runtime (env/vault). Never paste the token value here.",
      type: "string",
      required: false,
      defaultValue: "",
    },
  ];
}

export function openSourceStackField(
  options: readonly string[],
  defaultValue: string,
  label = "Open-source stack",
  description = "Opinionated default among the three most common open-source options.",
): ConfigFieldDefinition {
  return {
    key: "openSourceStack",
    label,
    description,
    type: "select",
    required: true,
    defaultValue,
    options,
  };
}

export function defaultBigBlockTemplate(kind: string, stack: string): string {
  return [
    `# AthanorIDE Big Block custom template — ${kind}`,
    `# Local-first. Do not embed API tokens; use tokenSecretName / Secret Reference nodes.`,
    `kind: ${kind}`,
    `stack: ${stack}`,
    `deploymentMode: local`,
    `components: []`,
    `overrides: {}`,
    ``,
  ].join("\n");
}
