import { describe, expect, it } from "vitest";
import { areContractsCompatible } from "@athanor/contracts";
import { getNodeDefinition } from "./index.js";

describe("sandbox connection contracts", () => {
  it("separates policy configuration from the runtime handle", () => {
    expect(getNodeDefinition("sandbox.policy")?.outputs[0]?.contractType).toBe("SANDBOX_POLICY");
    expect(getNodeDefinition("sandbox.podman")?.inputs[0]?.contractType).toBe("SANDBOX_POLICY");
    expect(getNodeDefinition("sandbox.podman")?.outputs[0]?.contractType).toBe("SANDBOX_RUNTIME");
    expect(getNodeDefinition("big_blocks.agentic_harness")?.inputs.find(port => port.name === "sandbox"))
      .toMatchObject({ contractType: "SANDBOX_RUNTIME", required: false, multiple: false });
    expect(getNodeDefinition("agent.sandboxed")?.inputs.find(port => port.name === "sandbox")?.contractType)
      .toBe("SANDBOX_RUNTIME");
    expect(getNodeDefinition("mcp.server")?.inputs.find(port => port.name === "sandbox")?.contractType)
      .toBe("SANDBOX_RUNTIME");
  });

  it("allows runtime-to-runtime links and rejects policy-to-runtime shortcuts", () => {
    expect(areContractsCompatible("SANDBOX_RUNTIME", "SANDBOX_RUNTIME")).toBe(true);
    expect(areContractsCompatible("SANDBOX_POLICY", "SANDBOX_RUNTIME")).toBe(false);
  });
});
