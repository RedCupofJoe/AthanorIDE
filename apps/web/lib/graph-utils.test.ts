import { describe, expect, it } from "vitest";

import { evaluateConnection } from "./graph-utils";
import type { ArchitectureEdge, ArchitectureNode } from "@athanor/contracts";

function sampleNodes(): ArchitectureNode[] {
  return [
    {
      id: "a",
      type: "foundation.text_input",
      version: "1.0.0",
      name: "A",
      position: { x: 0, y: 0 },
      configuration: { value: "hi" },
      inputs: [],
      outputs: [
        {
          id: "out-text",
          name: "text",
          direction: "output",
          contractType: "STRING",
          required: true,
          multiple: false,
        },
      ],
    },
    {
      id: "b",
      type: "foundation.python_transform",
      version: "1.0.0",
      name: "B",
      position: { x: 200, y: 0 },
      configuration: { instruction: "upper" },
      inputs: [
        {
          id: "in-text",
          name: "text",
          direction: "input",
          contractType: "STRING",
          required: true,
          multiple: false,
        },
      ],
      outputs: [
        {
          id: "out-text",
          name: "text",
          direction: "output",
          contractType: "STRING",
          required: true,
          multiple: false,
        },
      ],
    },
  ];
}

describe("evaluateConnection", () => {
  it("accepts compatible STRING to STRING", () => {
    const decision = evaluateConnection({
      nodes: sampleNodes(),
      edges: [],
      sourceNodeId: "a",
      sourcePortId: "out-text",
      targetNodeId: "b",
      targetPortId: "in-text",
    });
    expect(decision.ok).toBe(true);
  });

  it("rejects a second connection to a single input", () => {
    const edges: ArchitectureEdge[] = [
      {
        id: "e1",
        sourceNodeId: "a",
        sourcePortId: "out-text",
        targetNodeId: "b",
        targetPortId: "in-text",
      },
    ];
    const decision = evaluateConnection({
      nodes: sampleNodes(),
      edges,
      sourceNodeId: "a",
      sourcePortId: "out-text",
      targetNodeId: "b",
      targetPortId: "in-text",
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/already connected/i);
    }
  });
});
