/** Safe, model-free import of OpenAPI operations, JSON Schemas, and MCP tool schemas. */
export type ImportedTool = {
  name: string;
  description: string;
  endpoint: string;
  method: string;
  inputSchema: Record<string, unknown>;
  sourceKind: "openapi" | "json-schema" | "mcp-tools";
  sourceVersion?: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeName(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, 80).replace(/[^A-Za-z0-9_.-]+/g, "_");
}

function resolveLocalReferences(value: unknown, root: Record<string, unknown>, activeRefs = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveLocalReferences(item, root, activeRefs));
  const record = object(value);
  if (!record) return value;
  if (typeof record.$ref === "string") {
    const reference = record.$ref;
    if (!reference.startsWith("#/")) throw new Error("Remote or unsupported $ref schemas are not fetched. Use local document references.");
    if (activeRefs.has(reference)) throw new Error(`Recursive schema reference ${reference} is not supported for node forms.`);
    const target = reference.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce<unknown>((current, part) => object(current)?.[part], root);
    if (target === undefined) throw new Error(`Unresolved schema reference ${reference}.`);
    const resolved = resolveLocalReferences(target, root, new Set(activeRefs).add(reference));
    const siblings = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "$ref"));
    if (Object.keys(siblings).length === 0) return resolved;
    const resolvedObject = object(resolved);
    if (!resolvedObject) throw new Error(`Schema reference ${reference} has non-object siblings.`);
    const resolvedSiblings = object(resolveLocalReferences(siblings, root, activeRefs));
    return { ...resolvedObject, ...resolvedSiblings };
  }
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, resolveLocalReferences(child, root, activeRefs)]));
}

function validateSchema(value: unknown, root?: Record<string, unknown>): Record<string, unknown> {
  const schema = object(root ? resolveLocalReferences(value, root) : value);
  if (!schema || (schema.type !== undefined && typeof schema.type !== "string")) {
    throw new Error("Each imported tool needs a JSON Schema object.");
  }
  const serialized = JSON.stringify(schema);
  if (serialized.length > 256_000) throw new Error("An imported schema is larger than 256 KB.");
  return schema;
}

export function parseSchemaImport(raw: string, sourceName = "Imported schema"): ImportedTool[] {
  if (raw.length > 2_000_000) throw new Error("The schema file exceeds 2 MB.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("The import must be valid JSON or an OpenAPI JSON document."); }
  const root = object(parsed);
  if (!root) throw new Error("The import root must be a JSON object.");

  if (root.openapi || root.swagger) {
    const paths = object(root.paths);
    if (!paths) throw new Error("OpenAPI document has no paths object.");
    const serverList = Array.isArray(root.servers) ? root.servers : [];
    const server = object(serverList[0]);
    const baseUrl = typeof server?.url === "string" ? server.url.replace(/\/$/, "") : "";
    const items: ImportedTool[] = [];
    for (const [path, pathValue] of Object.entries(paths)) {
      const pathObject = object(resolveLocalReferences(pathValue, root));
      if (!pathObject) continue;
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        const operation = object(resolveLocalReferences(pathObject[method], root));
        if (!operation) continue;
        const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
        const requestBody = object(operation.requestBody);
        const content = object(requestBody?.content);
        const jsonContent = object(content?.["application/json"]);
        const bodySchema = jsonContent?.schema === undefined ? null : validateSchema(jsonContent.schema, root);
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const paramValue of parameters) {
          const param = object(resolveLocalReferences(paramValue, root));
          if (!param || typeof param.name !== "string") continue;
          const schema = validateSchema(param.schema ?? { type: "string" }, root);
          properties[param.name] = { ...schema, description: param.description ?? schema.description };
          if (param.required === true) required.push(param.name);
        }
        if (bodySchema) properties.body = bodySchema;
        const inputSchema = validateSchema({ type: "object", properties, required, additionalProperties: false }, root);
        const fallbackName = `${method}_${path.replace(/[^A-Za-z0-9]+/g, "_")}`;
        items.push({
          name: safeName(operation.operationId, fallbackName),
          description: typeof operation.summary === "string" ? operation.summary : `${method.toUpperCase()} ${path}`,
          endpoint: `${baseUrl}${path}`,
          method: method.toUpperCase(), inputSchema, sourceKind: "openapi",
          sourceVersion: typeof root.openapi === "string" ? root.openapi : String(root.swagger ?? ""),
        });
      }
    }
    if (!items.length) throw new Error("OpenAPI document contains no supported operations.");
    return items;
  }

  if (Array.isArray(root.tools)) {
    return root.tools.map((rawTool, index) => {
      const tool = object(rawTool);
      if (!tool || typeof tool.name !== "string") throw new Error(`MCP tool ${index + 1} has no name.`);
      return {
        name: safeName(tool.name, `tool_${index + 1}`),
        description: typeof tool.description === "string" ? tool.description : "Imported MCP tool schema",
        endpoint: "",
        method: "MCP",
        inputSchema: validateSchema(tool.inputSchema ?? { type: "object", properties: {} }, root),
        sourceKind: "mcp-tools",
        sourceVersion: typeof root.protocolVersion === "string" ? root.protocolVersion : undefined,
      };
    });
  }

  const schema = validateSchema(root, root);
  return [{ name: safeName(sourceName.replace(/\.[^.]+$/, ""), "imported_schema"),
    description: typeof root.description === "string" ? root.description : "Imported JSON Schema. Configure an endpoint before execution.",
    endpoint: "", method: "POST", inputSchema: schema, sourceKind: "json-schema",
    sourceVersion: typeof root.$schema === "string" ? root.$schema : undefined }];
}
