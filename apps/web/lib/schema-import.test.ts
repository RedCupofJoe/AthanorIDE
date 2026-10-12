import { describe, expect, it } from "vitest";
import { parseSchemaImport } from "./schema-import";

describe("schema import", () => {
  it("builds HTTP tools from OpenAPI operations without executing the specification", () => {
    const spec = {
      openapi: "3.1.0",
      servers: [{ url: "https://service.example/api" }],
      paths: {
        "/search": {
          post: {
            operationId: "search",
            summary: "Search",
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { query: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    };
    const result = parseSchemaImport(JSON.stringify(spec));
    expect(result[0]).toMatchObject({ name: "search", endpoint: "https://service.example/api/search", method: "POST", sourceKind: "openapi" });
    expect(result[0]?.inputSchema).toMatchObject({ properties: { body: { type: "object" } } });
  });

  it("imports MCP tool definitions and JSON Schemas", () => {
    expect(parseSchemaImport(JSON.stringify({ tools: [{ name: "forecast", inputSchema: { type: "object" } }] }))[0]?.name).toBe("forecast");
    expect(parseSchemaImport(JSON.stringify({ type: "object", properties: { city: { type: "string" } } }), "weather.json")[0]?.name).toBe("weather");
  });

  it("resolves local OpenAPI schema and parameter references without network access", () => {
    const spec = {
      openapi: "3.1.0",
      paths: { "/items": { post: {
        operationId: "createItem",
        parameters: [{ $ref: "#/components/parameters/tenant" }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } } },
      } } },
      components: {
        parameters: { tenant: { name: "tenant", in: "header", required: true, schema: { type: "string" } } },
        schemas: { Item: { type: "object", properties: { label: { type: "string" } }, required: ["label"] } },
      },
    };
    const imported = parseSchemaImport(JSON.stringify(spec))[0];
    expect(imported?.inputSchema).toMatchObject({
      properties: { tenant: { type: "string" }, body: { properties: { label: { type: "string" } } } },
      required: ["tenant"],
    });
  });

  it("rejects unresolved and recursive schema references", () => {
    expect(() => parseSchemaImport(JSON.stringify({ $ref: "#/missing" }))).toThrow("Unresolved schema reference");
    expect(() => parseSchemaImport(JSON.stringify({ $defs: { Loop: { $ref: "#/$defs/Loop" } }, $ref: "#/$defs/Loop" }))).toThrow("Recursive schema reference");
  });

  it("rejects invalid roots and remote references", () => {
    expect(() => parseSchemaImport("[]")).toThrow("root must be a JSON object");
    expect(() => parseSchemaImport(JSON.stringify({ $ref: "https://example.org/schema.json" }))).toThrow("Remote or unsupported $ref");
  });
});
