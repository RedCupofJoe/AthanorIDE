/**
 * Deployment swimlane bounds, inheritance, and cross-environment edge checks.
 */
import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
} from "@athanor/contracts";

export type DeploymentKind =
  | "LOCAL_WORKSTATION"
  | "ON_PREMISES"
  | "OPENSHIFT"
  | "KUBERNETES"
  | "AWS_GPU"
  | "GCP_CLOUD_RUN"
  | "AZURE_CONTAINER_APPS"
  | "EDGE_DEVICE"
  | "RASPBERRY_PI"
  | "AIR_GAPPED_ENVIRONMENT";

export type SwimlaneRecord = ArchitectureGraph["deploymentEnvironments"][number];

export const SWIMLANE_NODE_PREFIX = "swimlane:" as const;

export function swimlaneFlowId(id: string): string {
  return `${SWIMLANE_NODE_PREFIX}${id}`;
}

export function parseSwimlaneFlowId(flowId: string): string | null {
  return flowId.startsWith(SWIMLANE_NODE_PREFIX)
    ? flowId.slice(SWIMLANE_NODE_PREFIX.length)
    : null;
}

export function swimlaneBounds(lane: SwimlaneRecord): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: lane.bounds?.x ?? 40,
    y: lane.bounds?.y ?? 40,
    width: lane.bounds?.width ?? 480,
    height: lane.bounds?.height ?? 640,
  };
}

export function pointInSwimlane(
  point: { x: number; y: number },
  lane: SwimlaneRecord,
): boolean {
  const bounds = swimlaneBounds(lane);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/** Prefer the smallest containing swimlane when lanes overlap. */
export function findContainingSwimlane(
  point: { x: number; y: number },
  lanes: SwimlaneRecord[],
): SwimlaneRecord | undefined {
  const matches = lanes.filter((lane) => pointInSwimlane(point, lane));
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => {
    const areaA = swimlaneBounds(a).width * swimlaneBounds(a).height;
    const areaB = swimlaneBounds(b).width * swimlaneBounds(b).height;
    return areaA - areaB;
  })[0];
}

export function effectiveDeploymentTarget(
  node: ArchitectureNode,
): string | undefined {
  return node.deploymentTarget;
}

export function isCrossEnvironmentEdge(
  edge: ArchitectureEdge,
  nodesById: Map<string, ArchitectureNode>,
): boolean {
  const source = nodesById.get(edge.sourceNodeId);
  const target = nodesById.get(edge.targetNodeId);
  if (!source || !target) return false;
  const left = source.deploymentTarget ?? "";
  const right = target.deploymentTarget ?? "";
  if (!left || !right) return false;
  return left !== right;
}

export function crossEnvironmentEdgeComplete(
  edge: ArchitectureEdge,
): boolean {
  const metadata = edge.metadata ?? {};
  const transport = metadata.transport;
  const authentication = metadata.authentication;
  const network = metadata.networkPolicy ?? metadata.network;
  return (
    typeof transport === "string" &&
    transport.trim().length > 0 &&
    typeof authentication === "string" &&
    authentication.trim().length > 0 &&
    typeof network === "string" &&
    network.trim().length > 0
  );
}

export function defaultSwimlaneBounds(index: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: 40 + index * 520,
    y: 40,
    width: 480,
    height: 640,
  };
}

export const SWIMLANE_KINDS: DeploymentKind[] = [
  "LOCAL_WORKSTATION",
  "ON_PREMISES",
  "OPENSHIFT",
  "KUBERNETES",
  "AWS_GPU",
  "GCP_CLOUD_RUN",
  "AZURE_CONTAINER_APPS",
  "EDGE_DEVICE",
  "RASPBERRY_PI",
  "AIR_GAPPED_ENVIRONMENT",
];
