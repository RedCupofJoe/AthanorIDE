import { IDBFactory } from "fake-indexeddb";
import { createEmptyGraph } from "@athanor/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PROJECT_INDEX_KEY,
  createProject,
  deleteProject,
  listProjectSummaries,
  loadProjectGraph,
  renameProject,
  saveProjectGraph,
  resetOldProjectIndex,
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
    // @ts-expect-error test cleanup
    delete globalThis.indexedDB;
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

  it("resets old project keys once without removing new projects or unrelated data", async () => {
    localStorage.setItem("athanoride.agents.projects.index.v1", "old index");
    localStorage.setItem("athanoride.agents.project.old.v1", "old project");
    localStorage.setItem("athanor.ui-preferences", "preferences");
    localStorage.setItem("athanor.block-templates.v1", "templates");
    resetOldProjectIndex();
    expect(localStorage.getItem("athanoride.agents.project.old.v1")).toBeNull();
    const graph = await createProject("New project");
    resetOldProjectIndex();
    expect((await loadProjectGraph(graph.project.id))?.project.name).toBe("New project");
    expect(localStorage.getItem("athanor.ui-preferences")).toBe("preferences");
    expect(localStorage.getItem("athanor.block-templates.v1")).toBe("templates");
  });
  it("upgrades IndexedDB once, replacing old project bodies but preserving new ones", async () => {
    const factory = new IDBFactory();
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: factory });
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("athanoride-project-library", 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("projects", { keyPath: "project.id" }).put({ project: { id: "old" }, schemaVersion: "1.0.0" }); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    expect(await loadProjectGraph("old")).toBeNull();
    const graph = createEmptyGraph("Version two");
    await saveProjectGraph(graph);
    expect((await loadProjectGraph(graph.project.id))?.project.name).toBe("Version two");
    expect((await loadProjectGraph(graph.project.id))?.schemaVersion).toBe("2.0.0");
  });

});
