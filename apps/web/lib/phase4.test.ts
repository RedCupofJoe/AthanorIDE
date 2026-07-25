import { describe, expect, it } from "vitest";

import { lodFromZoom } from "./lod";
import { computeMacroExternalPorts, buildCollapsedMacro } from "./macros";
import {
  groupPortalsByBus,
  portalContractType,
  syncPortalBusesFromNodes,
  withSyncedPortalPorts,
} from "./portals";
import {
  crossEnvironmentEdgeComplete,
  findContainingSwimlane,
  isCrossEnvironmentEdge,
  pointInSwimlane,
} from "./swimlanes";
import type { ArchitectureEdge, ArchitectureNode } from "@athanor/contracts";
import { createNodeFromDefinition } from "@athanor/node-definitions";

describe("lodFromZoom", () => {
  it("maps zoom bands to macro/mid/micro", () => {
    expect(lodFromZoom(0.2)).toBe("macro");
    expect(lodFromZoom(0.5)).toBe("mid");
    expect(lodFromZoom(1.2)).toBe("micro");
  });
});

describe("macros", () => {
  it("exposes external ports when collapsing a boundary", () => {
    const a = createNodeFromDefinition("foundation.text_input", { x: 0, y: 0 });
    const b = createNodeFromDefinition("foundation.python_transform", { x: 200, y: 0 });
    const c = createNodeFromDefinition("foundation.output_viewer", { x: 400, y: 0 });
    const edges: ArchitectureEdge[] = [
      {
        id: "e1",
        sourceNodeId: a.id,
        sourcePortId: a.outputs[0]!.id,
        targetNodeId: b.id,
        targetPortId: b.inputs[0]!.id,
      },
      {
        id: "e2",
        sourceNodeId: b.id,
        sourcePortId: b.outputs[0]!.id,
        targetNodeId: c.id,
        targetPortId: c.inputs[0]!.id,
      },
    ];

    const ports = computeMacroExternalPorts([b.id], [a, b, c], edges);
    expect(ports.inputs).toHaveLength(1);
    expect(ports.outputs).toHaveLength(1);

    const macro = buildCollapsedMacro([a.id, b.id], [a, b, c], edges, "Group");
    expect(macro.nodeIds).toHaveLength(2);
    expect(macro.collapsed).toBe(true);
    expect(macro.outputs).toHaveLength(1);
  });
});

describe("portals", () => {
  it("syncs bus registry and port contracts", () => {
    let input = createNodeFromDefinition("foundation.portal_input", { x: 0, y: 0 });
    let output = createNodeFromDefinition("foundation.portal_output", { x: 100, y: 0 });
    input = withSyncedPortalPorts({
      ...input,
      configuration: {
        ...input.configuration,
        busId: "bus-a",
        contractType: "PROMPT",
      },
    });
    output = withSyncedPortalPorts({
      ...output,
      configuration: {
        ...output.configuration,
        busId: "bus-a",
        contractType: "PROMPT",
      },
    });

    expect(portalContractType(input)).toBe("PROMPT");
    expect(input.outputs[0]?.contractType).toBe("PROMPT");
    expect(groupPortalsByBus([input, output]).get("bus-a")).toHaveLength(2);
    expect(syncPortalBusesFromNodes([input, output])).toHaveLength(1);
  });
});

describe("swimlanes", () => {
  it("detects containment and incomplete cross-env edges", () => {
    const lane = {
      id: "lane-1",
      kind: "LOCAL_WORKSTATION" as const,
      name: "Local",
      bounds: { x: 0, y: 0, width: 200, height: 200 },
    };
    expect(pointInSwimlane({ x: 50, y: 50 }, lane)).toBe(true);
    expect(findContainingSwimlane({ x: 50, y: 50 }, [lane])?.id).toBe("lane-1");

    const nodes = new Map<string, ArchitectureNode>([
      [
        "a",
        {
          ...createNodeFromDefinition("foundation.text_input", { x: 0, y: 0 }),
          id: "a",
          deploymentTarget: "lane-1",
        },
      ],
      [
        "b",
        {
          ...createNodeFromDefinition("foundation.output_viewer", { x: 0, y: 0 }),
          id: "b",
          deploymentTarget: "lane-2",
        },
      ],
    ]);
    const edge: ArchitectureEdge = {
      id: "cross",
      sourceNodeId: "a",
      sourcePortId: "out",
      targetNodeId: "b",
      targetPortId: "in",
    };
    expect(isCrossEnvironmentEdge(edge, nodes)).toBe(true);
    expect(crossEnvironmentEdgeComplete(edge)).toBe(false);
    expect(
      crossEnvironmentEdgeComplete({
        ...edge,
        metadata: {
          transport: "mtls",
          authentication: "oidc",
          networkPolicy: "deny-by-default",
        },
      }),
    ).toBe(true);
  });
});
