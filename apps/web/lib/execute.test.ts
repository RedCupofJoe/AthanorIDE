import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("execute response shape", () => {
  it("accepts a minimal success payload", () => {
    const schema = z.object({
      status: z.enum(["success", "partial", "failed"]),
      durationMs: z.number(),
      steps: z.array(z.unknown()),
      edgePayloads: z.array(z.unknown()).default([]),
      finalOutputs: z.array(z.record(z.unknown())).default([]),
      validationIssueCount: z.number().default(0),
    });
    const parsed = schema.parse({
      status: "success",
      durationMs: 12.5,
      steps: [
        {
          nodeId: "n1",
          nodeName: "Text",
          nodeType: "foundation.text_input",
          status: "ok",
          inputs: {},
          outputs: { "out-text": "hi" },
          durationMs: 1,
        },
      ],
      edgePayloads: [],
      finalOutputs: [{ value: "hi" }],
      validationIssueCount: 0,
    });
    expect(parsed.status).toBe("success");
  });
});
