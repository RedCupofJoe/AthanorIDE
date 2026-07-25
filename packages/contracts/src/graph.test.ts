import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  ArchitectureGraphSchema,
  SCHEMA_VERSION,
  parseArchitectureGraph,
} from "./index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

describe("architecture graph contracts", () => {
  const schema = loadJson("schema/architecture-graph.v1.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  it("exports schema version 1.0.0", () => {
    expect(SCHEMA_VERSION).toBe("1.0.0");
  });

  it.each(["fixtures/empty-graph.v1.json", "fixtures/text-transform.v1.json"])(
    "accepts golden fixture %s via JSON Schema and Zod",
    (fixturePath) => {
      const document = loadJson(fixturePath);
      expect(validate(document)).toBe(true);
      const parsed = parseArchitectureGraph(document);
      expect(parsed.schemaVersion).toBe("1.0.0");
      expect(ArchitectureGraphSchema.safeParse(document).success).toBe(true);
    },
  );

  it("rejects an invalid schema version", () => {
    const document = loadJson("fixtures/empty-graph.v1.json") as {
      schemaVersion: string;
    };
    document.schemaVersion = "0.0.1";
    expect(validate(document)).toBe(false);
    expect(ArchitectureGraphSchema.safeParse(document).success).toBe(false);
  });
});
