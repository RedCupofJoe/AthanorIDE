import { describe, expect, it } from "vitest";

import { ExportResponseSchema } from "./export";

describe("export response schema", () => {
  it("accepts a minimal export payload", () => {
    const parsed = ExportResponseSchema.parse({
      projectSlug: "demo",
      files: { "README.md": "# demo\n" },
      manifest: [{ path: "README.md", bytes: 7, sha256: "abc" }],
      durationMs: 1.5,
      fileCount: 1,
      validationIssues: [],
      archiveBase64: "UEsD",
    });
    expect(parsed.projectSlug).toBe("demo");
  });
});
