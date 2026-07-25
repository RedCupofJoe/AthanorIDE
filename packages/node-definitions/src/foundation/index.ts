/** Foundation canvas nodes: text/JSON IO, transforms, HTTP, portals, env/secrets. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const textInputDefinition: NodeDefinition = {
  type: "foundation.text_input",
  displayName: "Text Input",
  description: "Provides a static text string to downstream nodes.",
  category: "foundation",
  version: "1.0.0",
  icon: "type",
  exportKind: "pipeline_text_source",
  inputs: [],
  outputs: [portTemplate("text", "output", "STRING")],
  configurationFields: [
    {
      key: "value",
      label: "Text value",
      description: "The string emitted on the text output port.",
      type: "text",
      required: true,
      defaultValue: "",
      recommendedDefaultExplanation: "Start with sample text you want to transform.",
    },
  ],
  documentation:
    "Use Text Input as the source of a pipeline. Connect its STRING output to nodes that accept text.",
};

export const jsonInputDefinition: NodeDefinition = {
  type: "foundation.json_input",
  displayName: "JSON Input",
  description: "Provides a static JSON document as a STRING payload for downstream nodes.",
  category: "foundation",
  version: "1.0.0",
  icon: "braces",
  exportKind: "pipeline_text_source",
  inputs: [],
  outputs: [portTemplate("json", "output", "STRING")],
  configurationFields: [
    {
      key: "json",
      label: "JSON document",
      description: "Valid JSON text emitted on the json output port.",
      type: "text",
      required: true,
      defaultValue: '{\n  "hello": "world"\n}',
      recommendedDefaultExplanation: "Keep samples small and schema-valid.",
    },
  ],
  documentation:
    "Use JSON Input when a pipeline should start from structured JSON serialized as text.",
};

export const promptTemplateDefinition: NodeDefinition = {
  type: "foundation.prompt_template",
  displayName: "Prompt Template",
  description: "Renders a prompt string from a template and optional variable input.",
  category: "foundation",
  version: "1.0.0",
  icon: "message-square",
  exportKind: "prompt_template",
  inputs: [portTemplate("variables", "input", "STRING", { required: false })],
  outputs: [portTemplate("prompt", "output", "PROMPT")],
  configurationFields: [
    {
      key: "template",
      label: "Prompt template",
      description: "Template text. Use {{input}} where the optional variables string should appear.",
      type: "text",
      required: true,
      defaultValue: "Summarize the following:\n{{input}}",
    },
  ],
  documentation:
    "Prompt Template produces a PROMPT contract. Connect STRING sources into variables when substitution is needed.",
};

export const pythonTransformDefinition: NodeDefinition = {
  type: "foundation.python_transform",
  displayName: "Python Transformation",
  description:
    "Transforms text using a natural-language instruction compiled through the sandboxed NL compiler.",
  category: "foundation",
  version: "1.0.0",
  icon: "code-2",
  exportKind: "pipeline_transform",
  inputs: [portTemplate("text", "input", "STRING")],
  outputs: [portTemplate("text", "output", "STRING")],
  configurationFields: [
    {
      key: "instruction",
      label: "Transformation instruction",
      description:
        "Describe the transformation in plain language. Example: uppercase the input and trim whitespace.",
      type: "text",
      required: true,
      defaultValue: "",
      recommendedDefaultExplanation:
        "Be specific about input assumptions and the desired output shape.",
    },
  ],
  documentation:
    "Stores the instruction for validation and export lineage. Compile through the sandboxed NL compiler before production export.",
};

export const httpRequestDefinition: NodeDefinition = {
  type: "foundation.http_request",
  displayName: "HTTP Request",
  description: "Calls an HTTP endpoint with an optional STRING body and returns the response text.",
  category: "foundation",
  version: "1.0.0",
  icon: "globe",
  exportKind: "http_client",
  inputs: [portTemplate("body", "input", "STRING", { required: false })],
  outputs: [portTemplate("response", "output", "STRING")],
  configurationFields: [
    {
      key: "url",
      label: "URL",
      description: "Absolute HTTP(S) URL to call.",
      type: "string",
      required: true,
      defaultValue: "https://httpbin.org/post",
    },
    {
      key: "method",
      label: "Method",
      description: "HTTP method.",
      type: "select",
      required: true,
      defaultValue: "POST",
      options: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    },
    {
      key: "timeoutSeconds",
      label: "Timeout (seconds)",
      description: "Request timeout used by the exported client stub.",
      type: "number",
      required: true,
      defaultValue: 30,
    },
  ],
  documentation:
    "HTTP Request exports a typed client stub. Runtime calls happen only in the generated project, never during IDE validation.",
};

export const outputViewerDefinition: NodeDefinition = {
  type: "foundation.output_viewer",
  displayName: "Output Viewer",
  description: "Terminal sink that displays the connected text payload.",
  category: "foundation",
  version: "1.0.0",
  icon: "eye",
  exportKind: "pipeline_sink",
  inputs: [portTemplate("text", "input", "STRING")],
  outputs: [],
  configurationFields: [],
  documentation:
    "Place Output Viewer at the end of a pipeline to inspect results.",
};

const PORTAL_CONTRACT_OPTIONS = [
  "STRING",
  "PROMPT",
  "JSON_SCHEMA",
  "STREAMING_PAYLOAD",
  "FILE_REFERENCE",
  "EVENT",
  "ANY",
] as const;

export const portalInputDefinition: NodeDefinition = {
  type: "foundation.portal_input",
  displayName: "Portal Input",
  description:
    "Receives data from a matching Portal Output via a shared bus id without a drawn edge.",
  category: "foundation",
  version: "1.0.0",
  icon: "log-in",
  exportKind: "portal",
  inputs: [],
  outputs: [portTemplate("text", "output", "STRING")],
  configurationFields: [
    {
      key: "busId",
      label: "Bus identifier",
      description: "Unique bus id shared with one or more Portal Output nodes.",
      type: "string",
      required: true,
      defaultValue: "bus-main",
      recommendedDefaultExplanation: "Use a short, stable id such as bus-auth or bus-events.",
    },
    {
      key: "displayName",
      label: "Display name",
      description: "Human-readable label for the bus endpoint.",
      type: "string",
      required: true,
      defaultValue: "Main bus",
    },
    {
      key: "contractType",
      label: "Contract type",
      description: "Typed contract carried on this portal bus.",
      type: "select",
      required: true,
      defaultValue: "STRING",
      options: PORTAL_CONTRACT_OPTIONS,
    },
    {
      key: "scope",
      label: "Scope",
      description: "Visibility of the portal bus.",
      type: "select",
      required: true,
      defaultValue: "project",
      options: ["project", "macro", "deployment"],
    },
  ],
  documentation:
    "Place Portal Input where a distant stream should re-enter the graph. Pair it with a Portal Output that uses the same busId and compatible contract.",
};

export const portalOutputDefinition: NodeDefinition = {
  type: "foundation.portal_output",
  displayName: "Portal Output",
  description:
    "Publishes data onto a portal bus so a matching Portal Input can consume it elsewhere.",
  category: "foundation",
  version: "1.0.0",
  icon: "log-out",
  exportKind: "portal",
  inputs: [portTemplate("text", "input", "STRING")],
  outputs: [],
  configurationFields: [
    {
      key: "busId",
      label: "Bus identifier",
      description: "Unique bus id shared with one or more Portal Input nodes.",
      type: "string",
      required: true,
      defaultValue: "bus-main",
    },
    {
      key: "displayName",
      label: "Display name",
      description: "Human-readable label for the bus endpoint.",
      type: "string",
      required: true,
      defaultValue: "Main bus",
    },
    {
      key: "contractType",
      label: "Contract type",
      description: "Typed contract carried on this portal bus.",
      type: "select",
      required: true,
      defaultValue: "STRING",
      options: PORTAL_CONTRACT_OPTIONS,
    },
    {
      key: "scope",
      label: "Scope",
      description: "Visibility of the portal bus.",
      type: "select",
      required: true,
      defaultValue: "project",
      options: ["project", "macro", "deployment"],
    },
  ],
  documentation:
    "Connect upstream nodes into Portal Output to hop across the canvas without long crossing edges.",
};

export const environmentVariableDefinition: NodeDefinition = {
  type: "foundation.environment_variable",
  displayName: "Environment Variable",
  description: "Reads a named environment variable at runtime (never stores secrets).",
  category: "foundation",
  version: "1.0.0",
  icon: "variable",
  exportKind: "env_binding",
  inputs: [],
  outputs: [portTemplate("value", "output", "STRING")],
  configurationFields: [
    {
      key: "name",
      label: "Variable name",
      description: "Environment variable name (e.g. APP_REGION).",
      type: "string",
      required: true,
      defaultValue: "APP_REGION",
    },
    {
      key: "exampleValue",
      label: "Example value",
      description: "Non-secret example written only to .env.example.",
      type: "string",
      required: false,
      defaultValue: "us-east-1",
    },
  ],
  documentation:
    "Environment Variable exports a binding into .env.example. Do not put credentials here — use Secret Reference.",
};

export const secretReferenceDefinition: NodeDefinition = {
  type: "foundation.secret_reference",
  displayName: "Secret Reference",
  description: "References a secret by name without embedding the secret value in the graph.",
  category: "foundation",
  version: "1.0.0",
  icon: "key-round",
  exportKind: "secret_reference",
  inputs: [],
  outputs: [portTemplate("secret", "output", "STRING")],
  configurationFields: [
    {
      key: "secretName",
      label: "Secret name",
      description: "Logical secret identifier injected at runtime.",
      type: "string",
      required: true,
      defaultValue: "api-token",
    },
    {
      key: "provider",
      label: "Provider",
      description: "Where the secret is expected to be resolved.",
      type: "select",
      required: true,
      defaultValue: "env",
      options: ["env", "file", "vault", "cloud_secret_manager"],
    },
  ],
  documentation:
    "Secret Reference never stores secret values in the architecture graph or exported .env files. Only the name and provider are exported as lineage comments.",
};

export const FOUNDATION_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  textInputDefinition,
  jsonInputDefinition,
  promptTemplateDefinition,
  pythonTransformDefinition,
  httpRequestDefinition,
  outputViewerDefinition,
  portalInputDefinition,
  portalOutputDefinition,
  environmentVariableDefinition,
  secretReferenceDefinition,
] as const;
