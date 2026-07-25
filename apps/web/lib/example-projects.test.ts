import { describe, expect, it } from "vitest";

import { EXAMPLE_PROJECTS, buildExampleProject } from "./example-projects";

describe("example projects", () => {
  it("exposes RAG, vision fine-tuning, and text transform starters", () => {
    expect(EXAMPLE_PROJECTS.map((item) => item.id)).toEqual([
      "rag-pipeline",
      "vision-finetune",
      "text-transform",
    ]);
  });

  it("builds graphs with nodes, edges, and unique project ids", () => {
    const rag = buildExampleProject("rag-pipeline");
    const vision = buildExampleProject("vision-finetune");
    expect(rag).not.toBeNull();
    expect(vision).not.toBeNull();
    expect(rag!.nodes.length).toBeGreaterThan(3);
    expect(rag!.edges.length).toBeGreaterThan(0);
    expect(vision!.nodes.some((node) => node.type.startsWith("vision."))).toBe(true);
    expect(vision!.nodes.some((node) => node.type.startsWith("fine_tuning."))).toBe(true);
    expect(rag!.project.id).not.toBe(vision!.project.id);
  });

  it("returns null for unknown example ids", () => {
    expect(buildExampleProject("missing")).toBeNull();
  });
});
