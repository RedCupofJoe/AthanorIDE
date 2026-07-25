import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LEGACY_STORAGE_KEY,
  PROJECT_INDEX_KEY,
  createProject,
  deleteProject,
  listProjectSummaries,
  loadProjectGraph,
  migrateLegacyProjectIfNeeded,
  renameProject,
  saveProjectGraph,
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

  it("creates, lists, renames, and deletes projects", () => {
    const a = createProject("Alpha");
    const b = createProject("Beta");
    expect(listProjectSummaries().map((item) => item.name)).toEqual(["Beta", "Alpha"]);

    renameProject(a.project.id, "Alpha Renamed");
    expect(loadProjectGraph(a.project.id)?.project.name).toBe("Alpha Renamed");
    expect(listProjectSummaries().find((item) => item.id === a.project.id)?.name).toBe(
      "Alpha Renamed",
    );

    deleteProject(b.project.id);
    expect(listProjectSummaries().map((item) => item.id)).toEqual([a.project.id]);
  });

  it("persists project bodies across reads", () => {
    const created = createProject("Persisted");
    saveProjectGraph({
      ...created,
      project: { ...created.project, name: "Persisted" },
    });
    const reloaded = loadProjectGraph(created.project.id);
    expect(reloaded?.project.name).toBe("Persisted");
    expect(window.localStorage.getItem(PROJECT_INDEX_KEY)).toContain(created.project.id);
  });

  it("migrates the legacy single-project key", () => {
    const legacy = {
      schemaVersion: "1.0.0",
      project: {
        id: "legacy-1",
        name: "Legacy",
        createdAt: "2026-07-24T14:00:00.000Z",
        updatedAt: "2026-07-24T14:00:00.000Z",
      },
      nodes: [],
      edges: [],
      contracts: [],
      deploymentEnvironments: [],
      macroBlocks: [],
      portalBuses: [],
      validationResults: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    migrateLegacyProjectIfNeeded();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(loadProjectGraph("legacy-1")?.project.name).toBe("Legacy");
    expect(listProjectSummaries()[0]?.id).toBe("legacy-1");
  });
});
