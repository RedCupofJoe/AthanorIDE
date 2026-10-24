import { describe, expect, it, vi } from "vitest";
import { createEmptyGraph, type ArchitectureGraph } from "@athanor/contracts";
import { loadProjectGraph } from "@/lib/project-library";
import { useProjectStore } from "./project-store";
import { useValidationStore } from "./validation-store";

vi.mock("@/lib/project-library", () => ({
  loadProjectGraph: vi.fn(),
  getActiveProjectId: () => null,
  setActiveProjectId: vi.fn(),
  listProjectSummaries: () => [],
  saveProjectGraph: vi.fn(),
}));

describe("project navigation", () => {
  it("does not let an earlier slow load replace the newly selected project", async () => {
    const old = createEmptyGraph("Previous project");
    const next = createEmptyGraph("Requested project");
    let finishOld!: (graph: ArchitectureGraph) => void;
    vi.mocked(loadProjectGraph)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(next);
    useValidationStore.getState().setResult(true, [], 1);
    const oldRequest = useProjectStore.getState().hydrate(old.project.id);
    expect(useValidationStore.getState().status).toBe("idle");
    expect(await useProjectStore.getState().hydrate(next.project.id)).toBe(
      true,
    );
    finishOld(old);
    expect(await oldRequest).toBe(false);
    expect(useProjectStore.getState().graph.project.id).toBe(next.project.id);
  });
});
