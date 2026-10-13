import { describe, expect, it } from "vitest";
import { portTitle } from "./PortRow";
import type { NodePort } from "@athanor/contracts";

const port = (contractType: NodePort["contractType"]): NodePort => ({
  id: "test-port",
  name: "payload",
  direction: "input",
  contractType,
  required: true,
  multiple: false,
});

describe("port connection guidance", () => {
  it("does not imply that a typed input accepts an ANY output", () => {
    expect(portTitle(port("STRING"), "input")).toContain("Any output cannot connect");
  });

  it("explains that ANY is an input-side wildcard", () => {
    expect(portTitle(port("ANY"), "input")).toContain("Accepts outputs of any contract type");
    expect(portTitle(port("ANY"), "output")).toContain("only to Any inputs");
  });
});
