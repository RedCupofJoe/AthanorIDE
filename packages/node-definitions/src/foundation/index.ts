/** Foundation canvas nodes: text/JSON IO, transforms, HTTP, portals, env/secrets. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const textInputDefinition: NodeDefinition = {
  type: "foundation.text_input",
  displayName: "Text Input",
  description:
    "Text Input is a pipeline source that emits a static STRING you author in the inspector. Place it at the start of a flow and connect its output to transforms, prompts, HTTP bodies, viewers, or any node that accepts text. Use it to prototype with sample copy, fixtures, and regression strings without depending on files or APIs.",
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
    "Best used when you need a controlled, replayable text seed for Validate/Run or for documenting expected inputs in an export. Prefer JSON Input when the payload must stay structured, and Environment Variable or Secret Reference when values should come from the runtime instead of the graph.",
};

export const jsonInputDefinition: NodeDefinition = {
  type: "foundation.json_input",
  displayName: "JSON Input",
  description:
    "JSON Input provides a static JSON document serialized as a STRING for downstream nodes. Author the document in the inspector, then wire the output into transforms, HTTP bodies, agents, or validators that expect structured text. It keeps sample schemas and fixtures visible on the canvas so architects can reason about payload shape early.",
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
    "Choose JSON Input when the starting payload is structured (API bodies, tool args, config snippets) rather than free prose. Keep samples small and schema-valid; for large datasets use Dataset Loader or external files referenced by Environment Variable instead of embedding bulk data in the graph.",
};

export const promptTemplateDefinition: NodeDefinition = {
  type: "foundation.prompt_template",
  displayName: "Prompt Template",
  description:
    "Prompt Template renders a PROMPT from a template string and an optional STRING variables input. Put placeholders such as {{input}} in the template, connect upstream text when substitution is needed, and feed the PROMPT output into agents, vision models, or other prompt-aware nodes. It makes prompt structure explicit and reviewable on the canvas.",
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
    "Best used whenever prompts should be versioned with the architecture rather than buried in application code. Prefer it over ad-hoc string concatenation in Python Transformation when the primary goal is LLM prompting; use Python Transformation when you need arbitrary text munging beyond template substitution.",
};

export const pythonTransformDefinition: NodeDefinition = {
  type: "foundation.python_transform",
  displayName: "Python Transformation",
  description:
    "Python Transformation takes STRING in and STRING out, driven by a natural-language instruction you compile through the sandboxed NL compiler. Connect text sources upstream, describe the desired reshape (normalize, extract, rewrite), compile in the inspector, then Validate/Run or export the generated project. It is the main node for deterministic text processing in foundation pipelines.",
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
    "Use it when you need reusable, testable text transforms with an audit trail from instruction to compiled code. Compile before production export; uncompiled graphs still document intent but should not ship. Prefer Prompt Template for LLM prompts and HTTP Request for remote calls rather than encoding those concerns in transform instructions.",
};

export const httpRequestDefinition: NodeDefinition = {
  type: "foundation.http_request",
  displayName: "HTTP Request",
  description:
    "HTTP Request models an outbound HTTP(S) call with optional STRING body and STRING response. Configure URL, method, and timeout in the inspector, optionally connect a body, and use the response downstream. Export emits a typed client stub so the generated project can perform the call outside the IDE.",
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
    "Best used to declare integration boundaries with external APIs in the architecture. IDE Run skips live HTTP by default for safety—treat this as lineage and export scaffolding. Pair with Environment Variable or Secret Reference for base URLs and credentials rather than hard-coding secrets in the URL field.",
};

export const outputViewerDefinition: NodeDefinition = {
  type: "foundation.output_viewer",
  displayName: "Output Viewer",
  description:
    "Output Viewer is a terminal sink that accepts STRING and displays the connected payload for inspection. Place it at the end of Validate/Run paths so architects can see what a pipeline produces without adding another transform. It has no configuration and no outputs—its job is observation.",
  category: "foundation",
  version: "1.0.0",
  icon: "eye",
  exportKind: "pipeline_sink",
  inputs: [portTemplate("text", "input", "STRING")],
  outputs: [],
  configurationFields: [],
  documentation:
    "Use it whenever you need a clear readout of intermediate or final text during design. Prefer it over leaving dangling outputs unconnected. For production exports it remains a documentation sink; logging and UI presentation in deployed apps should use dedicated sinks or application code.",
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
    "Portal Input re-enters data onto the canvas from a logical bus without a drawn edge. Configure a shared busId, contract type, and scope, then connect its output where the stream should continue. Pair it with one or more Portal Outputs that publish on the same bus so distant regions of a large graph stay readable.",
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
    "Best used in large architectures, macros, or cross-swimlane designs where long edges would clutter the canvas. Keep busId and contractType identical across the pair; mismatch fails validation. Prefer ordinary edges for short, local connections so portals stay reserved for structural hops.",
};

export const portalOutputDefinition: NodeDefinition = {
  type: "foundation.portal_output",
  displayName: "Portal Output",
  description:
    "Portal Output publishes an upstream payload onto a portal bus for matching Portal Inputs elsewhere. Connect a compatible input, set the same busId and contract as the receiving Portal Input, and use scope to limit visibility to project, macro, or deployment. It removes the need for long crossing edges between distant canvas regions.",
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
    "Use Portal Output when a stream must leave a subgraph or swimlane cleanly—auth results, shared events, or macro exits are common cases. Validate that every output bus has at least one consumer. For simple linear pipelines, a direct edge is clearer than a portal hop.",
};

export const environmentVariableDefinition: NodeDefinition = {
  type: "foundation.environment_variable",
  displayName: "Environment Variable",
  description:
    "Environment Variable declares a named process env binding that resolves at runtime to a STRING. Configure the variable name and a non-secret example value for .env.example, then connect the output wherever configuration should be injected. It documents deployment-time knobs without baking host-specific values into application code.",
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
    "Best used for non-secret configuration such as regions, feature flags, and public endpoints. Never put credentials in exampleValue—use Secret Reference (and the local vault for values). IDE Run may read the host environment for this node; exports only emit the example into .env.example.",
};

export const secretReferenceDefinition: NodeDefinition = {
  type: "foundation.secret_reference",
  displayName: "Secret Reference",
  description:
    "Secret Reference points at a credential by name and provider without embedding the secret value in the graph. Set secretName and provider (env, file, vault, or cloud secret manager), then wire the output to nodes that need a credential handle. Export records only the name and provider as lineage comments.",
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
    "Use it for every API token, password, or key the architecture depends on. Prefer provider vault with the Athanor local vault for local runs, and materialize .env for compose. IDE Run always redacts values; validation rejects embedded credential keys. Pair with infrastructure pull-token names when the same secret is shared across the project.",
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
