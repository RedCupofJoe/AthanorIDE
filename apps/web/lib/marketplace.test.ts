import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadMarketplaceSnapshot, marketplaceSnapshotIsStale, REFRESH_INTERVAL_MS,
  saveMarketplaceSnapshot, type MarketplaceSnapshot,
} from "./marketplace";

const snapshot: MarketplaceSnapshot = {
  schemaVersion: 1, refreshedAt: "2026-10-10T12:00:00.000Z", source: "test",
  entries: [], unavailableTopics: [],
};

function installMemoryStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
}

describe("marketplace snapshot freshness", () => {
  beforeEach(installMemoryStorage);
  afterEach(() => {
    // @ts-expect-error remove test global
    delete globalThis.window;
    // @ts-expect-error remove test global
    delete globalThis.localStorage;
  });

  it("considers snapshots current until the 24-hour default interval expires", () => {
    const refreshed = Date.parse(snapshot.refreshedAt);
    expect(marketplaceSnapshotIsStale(snapshot, refreshed + REFRESH_INTERVAL_MS - 1)).toBe(false);
    expect(marketplaceSnapshotIsStale(snapshot, refreshed + REFRESH_INTERVAL_MS)).toBe(true);
  });

  it("treats missing or invalid timestamps as stale", () => {
    expect(marketplaceSnapshotIsStale(null)).toBe(true);
    expect(marketplaceSnapshotIsStale({ ...snapshot, refreshedAt: "invalid" })).toBe(true);
  });

  it("keeps a stable local snapshot available when IndexedDB is unavailable", async () => {
    await saveMarketplaceSnapshot(snapshot);
    await expect(loadMarketplaceSnapshot()).resolves.toEqual(snapshot);
  });
});
