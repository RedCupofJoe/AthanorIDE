import { describe, expect, it } from "vitest";

import { areContractsCompatible, contractCompatibilityReason } from "./compatibility.js";

describe("contract compatibility", () => {
  it("allows exact matches", () => {
    expect(areContractsCompatible("STRING", "STRING")).toBe(true);
    expect(areContractsCompatible("SANDBOX_RUNTIME", "SANDBOX_RUNTIME")).toBe(true);
    expect(areContractsCompatible("SANDBOX_POLICY", "SANDBOX_RUNTIME")).toBe(false);
  });

  it("allows ANY as an input sink but rejects unknown output into typed inputs", () => {
    expect(areContractsCompatible("IMAGE", "ANY")).toBe(true);
    expect(areContractsCompatible("ANY", "ANY")).toBe(true);
    expect(areContractsCompatible("ANY", "IMAGE")).toBe(false);
  });

  it("rejects incompatible types with a correction hint", () => {
    expect(areContractsCompatible("STRING", "IMAGE")).toBe(false);
    expect(contractCompatibilityReason("STRING", "IMAGE")).toMatch(/adapter node/i);
  });
});
