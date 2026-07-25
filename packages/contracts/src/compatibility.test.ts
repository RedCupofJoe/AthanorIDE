import { describe, expect, it } from "vitest";

import { areContractsCompatible, contractCompatibilityReason } from "./compatibility.js";

describe("contract compatibility", () => {
  it("allows exact matches", () => {
    expect(areContractsCompatible("STRING", "STRING")).toBe(true);
  });

  it("allows ANY on either side", () => {
    expect(areContractsCompatible("ANY", "IMAGE")).toBe(true);
    expect(areContractsCompatible("TENSOR", "ANY")).toBe(true);
  });

  it("rejects incompatible types with a correction hint", () => {
    expect(areContractsCompatible("STRING", "IMAGE")).toBe(false);
    expect(contractCompatibilityReason("STRING", "IMAGE")).toMatch(/adapter node/i);
  });
});
