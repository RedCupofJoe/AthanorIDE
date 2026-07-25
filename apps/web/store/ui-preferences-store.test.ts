import { beforeEach, describe, expect, it } from "vitest";

import { useUiPreferencesStore } from "@/store/ui-preferences-store";

describe("ui preferences store", () => {
  beforeEach(() => {
    useUiPreferencesStore.setState({ paletteCompact: false });
  });

  it("toggles compact palette mode", () => {
    expect(useUiPreferencesStore.getState().paletteCompact).toBe(false);
    useUiPreferencesStore.getState().togglePaletteCompact();
    expect(useUiPreferencesStore.getState().paletteCompact).toBe(true);
    useUiPreferencesStore.getState().setPaletteCompact(false);
    expect(useUiPreferencesStore.getState().paletteCompact).toBe(false);
  });
});
