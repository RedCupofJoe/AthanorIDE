import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PROJECT_INDEX_KEY,
  createProject,
  deleteProject,
  listProjectSummaries,
  loadProjectGraph,
  renameProject,
  saveProjectGraph,
  migrateSandboxRuntimePorts,
} from "./project-library";

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

describe("project library", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window;
    // @ts-expect-error test cleanup
    delete globalThis.localStorage;
  });

  it("creates, lists, renames, and deletes projects", async () => {
    const a = await createProject("Alpha");
    const b = await createProject("Beta");
    expect(listProjectSummaries().map((item) => item.name)).toEqual(["Beta", "Alpha"]);

    await renameProject(a.project.id, "Alpha Renamed");
    expect((await loadProjectGraph(a.project.id))?.project.name).toBe("Alpha Renamed");
    expect(listProjectSummaries().find((item) => item.id === a.project.id)?.name).toBe(
      "Alpha Renamed",
    );

    await deleteProject(b.project.id);
    expect(listProjectSummaries().map((item) => item.id)).toEqual([a.project.id]);
  });

  it("persists project bodies across reads", async () => {
    const created = await createProject("Persisted");
    await saveProjectGraph({
      ...created,
      project: { ...created.project, name: "Persisted" },
    });
    const reloaded = await loadProjectGraph(created.project.id);
    expect(reloaded?.project.name).toBe("Persisted");
    expect(window.localStorage.getItem(PROJECT_INDEX_KEY)).toContain(created.project.id);
  });

  it("starts a fresh agent library without migrating legacy projects", async () => {
    window.localStorage.setItem("athanoride.projects.index.v1", JSON.stringify({ version: 1, activeId: "legacy", entries: [{ id: "legacy", name: "Old architecture" }] }));
    window.localStorage.setItem("athanoride.project.v1", "legacy content");
    expect(listProjectSummaries()).toEqual([]);
    await expect(loadProjectGraph("legacy")).resolves.toBeNull();
  });

  it("migrates only sandbox runtime ports and preserves policy ports", () => {
    const oldGraph = {
      nodes: [
        { type: "sandbox.podman", inputs: [{ name: "policy", contractType: "SANDBOX_POLICY" }], outputs: [{ name: "sandbox", contractType: "SANDBOX_POLICY" }] },
        { type: "sandbox.policy", inputs: [], outputs: [{ name: "policy", contractType: "SANDBOX_POLICY" }] },
        { type: "agent.sandboxed", inputs: [{ name: "sandbox", contractType: "SANDBOX_POLICY" }], outputs: [] },
      ],
    };
    const migrated = migrateSandboxRuntimePorts(oldGraph) as typeof oldGraph;
    expect(migrated.nodes[0]?.inputs[0]?.contractType).toBe("SANDBOX_POLICY");
    expect(migrated.nodes[0]?.outputs[0]?.contractType).toBe("SANDBOX_RUNTIME");
    expect(migrated.nodes[1]?.outputs[0]?.contractType).toBe("SANDBOX_POLICY");
    expect(migrated.nodes[2]?.inputs[0]?.contractType).toBe("SANDBOX_RUNTIME");
  });
});
