"use client";

/**
 * Primary architecture node renderer (LOD-aware ports, health, payload preview).
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { type ArchitectureNode } from "@athanor/contracts";
import { getNodeDefinition } from "@athanor/node-definitions";
import {
  AudioLines,
  Bot,
  Braces,
  Clapperboard,
  Code2,
  Cpu,
  Database,
  Eye,
  Fingerprint,
  GitFork,
  Globe,
  HardDrive,
  Headphones,
  Image,
  Images,
  KeyRound,
  Layers,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquare,
  Mic,
  Network,
  Scan,
  ScanEye,
  ScrollText,
  Server,
  Shield,
  Sparkles,
  Type,
  Variable,
  Video,
  WandSparkles,
  Wrench,
  FileText,
  Cylinder,
  Boxes,
  BadgeCheck,
} from "lucide-react";

import { PortRow } from "@/components/nodes/PortRow";
import { cn } from "@/lib/cn";
import type { LodLevel } from "@/lib/lod";
import { isPortalNode, portalBusId } from "@/lib/portals";

export type ArchitectureFlowNodeData = {
  architectureNode: ArchitectureNode;
  lod: LodLevel;
  health: "ok" | "warning" | "error" | "unknown";
  deploymentLabel?: string;
  payloadPreview?: string | null;
  executionStatus?: "ok" | "skipped" | "error" | null;
};

const ICONS = {
  type: Type,
  "code-2": Code2,
  eye: Eye,
  "log-in": LogIn,
  "log-out": LogOut,
  braces: Braces,
  "message-square": MessageSquare,
  globe: Globe,
  variable: Variable,
  "key-round": KeyRound,
  database: Database,
  sparkles: Sparkles,
  image: Image,
  scan: Scan,
  "scan-eye": ScanEye,
  bot: Bot,
  wrench: Wrench,
  server: Server,
  shield: Shield,
  "scroll-text": ScrollText,
  fingerprint: Fingerprint,
  network: Network,
  "git-fork": GitFork,
  "wand-sparkles": WandSparkles,
  "hard-drive": HardDrive,
  "message-circle": MessageCircle,
  images: Images,
  cpu: Cpu,
  mic: Mic,
  "audio-lines": AudioLines,
  video: Video,
  headphones: Headphones,
  layers: Layers,
  clapperboard: Clapperboard,
  "file-text": FileText,
  cylinder: Cylinder,
  boxes: Boxes,
  "badge-check": BadgeCheck,
} as const;

function healthDot(health: ArchitectureFlowNodeData["health"]): string {
  switch (health) {
    case "error":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "ok":
      return "bg-emerald-500";
    default:
      return "bg-stone-300";
  }
}

function FoundationNodeComponent({ id, data, selected }: NodeProps) {
  const {
    architectureNode,
    lod,
    health,
    deploymentLabel,
    payloadPreview,
    executionStatus,
  } = data as ArchitectureFlowNodeData;
  const definition = getNodeDefinition(architectureNode.type);
  const iconKey = (definition?.icon ?? "type") as keyof typeof ICONS;
  const Icon = ICONS[iconKey] ?? Type;
  const busId = isPortalNode(architectureNode) ? portalBusId(architectureNode) : null;

  if (lod === "macro") {
    return (
      <article
        className={cn(
          "min-w-[140px] rounded-md border bg-white/90 px-3 py-2 shadow-sm",
          selected
            ? "border-[var(--athanor-ember)] ring-2 ring-orange-200"
            : "border-[var(--athanor-mist)]",
        )}
        aria-label={`${architectureNode.name} node`}
      >
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", healthDot(health))} aria-hidden />
          <Icon className="size-3.5 text-[var(--athanor-ember)]" aria-hidden />
          <h3 className="truncate text-xs font-semibold">{architectureNode.name}</h3>
        </div>
        {deploymentLabel && (
          <p className="mt-1 truncate text-[10px] uppercase tracking-wide text-[var(--athanor-slate)]">
            {deploymentLabel}
          </p>
        )}
        {architectureNode.inputs.map((port) => (
          <Handle
            key={port.id}
            id={port.id}
            type="target"
            position={Position.Left}
            className="!opacity-0"
          />
        ))}
        {architectureNode.outputs.map((port) => (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={Position.Right}
            className="!opacity-0"
          />
        ))}
        {architectureNode.type === "foundation.portal_output" && (
          <Handle
            id="bus-out"
            type="source"
            position={Position.Right}
            className="!opacity-0"
            isConnectable={false}
          />
        )}
        {architectureNode.type === "foundation.portal_input" && (
          <Handle
            id="bus-in"
            type="target"
            position={Position.Left}
            className="!opacity-0"
            isConnectable={false}
          />
        )}
      </article>
    );
  }

  return (
    <article
      className={cn(
        "min-w-[220px] rounded-lg border bg-white/95 shadow-sm",
        selected
          ? "border-[var(--athanor-ember)] ring-2 ring-orange-200"
          : "border-[var(--athanor-mist)]",
      )}
      aria-label={`${architectureNode.name} node`}
    >
      <header className="flex items-start gap-2 border-b border-[var(--athanor-mist)] px-3 py-2">
        <span className={cn("mt-1 size-2 shrink-0 rounded-full", healthDot(health))} aria-hidden />
        <Icon className="mt-0.5 size-4 text-[var(--athanor-ember)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--athanor-ink)]">
            {architectureNode.name}
          </h3>
          <p className="truncate text-xs text-[var(--athanor-slate)]">
            {definition?.displayName ?? architectureNode.type}
          </p>
          {deploymentLabel && (
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-[var(--athanor-slate)]">
              {deploymentLabel}
            </p>
          )}
          {busId && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--athanor-ember)]">
              bus:{busId}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-2 px-3 py-2">
        {architectureNode.inputs.map((port) => (
          <PortRow key={port.id} nodeId={id} port={port} direction="input" />
        ))}

        {architectureNode.outputs.map((port) => (
          <PortRow key={port.id} nodeId={id} port={port} direction="output" />
        ))}

        {architectureNode.inputs.length === 0 && architectureNode.outputs.length === 0 && (
          <p className="text-xs text-[var(--athanor-slate)]">No ports</p>
        )}

        {architectureNode.type === "foundation.portal_output" && (
          <Handle
            id="bus-out"
            type="source"
            position={Position.Right}
            className="!opacity-0"
            isConnectable={false}
          />
        )}
        {architectureNode.type === "foundation.portal_input" && (
          <Handle
            id="bus-in"
            type="target"
            position={Position.Left}
            className="!opacity-0"
            isConnectable={false}
          />
        )}

        {lod === "micro" && (
          <div className="border-t border-[var(--athanor-mist)] pt-2 text-[10px] text-[var(--athanor-slate)]">
            {Object.entries(architectureNode.configuration)
              .filter(
                ([key]) =>
                  !key.startsWith("compile") &&
                  key !== "compiledCode" &&
                  key !== "compiledSpec",
              )
              .slice(0, 3)
              .map(([key, value]) => (
                <p key={key} className="truncate">
                  <span className="font-medium">{key}:</span>{" "}
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </p>
              ))}
          </div>
        )}

        {payloadPreview != null && payloadPreview !== "" && (
          <div className="border-t border-[var(--athanor-mist)] px-0 pt-2 text-[10px]">
            <p className="font-semibold uppercase tracking-wide text-[var(--athanor-slate)]">
              Last payload{executionStatus ? ` · ${executionStatus}` : ""}
            </p>
            <p className="mt-0.5 truncate font-mono text-[var(--athanor-ink)]">{payloadPreview}</p>
          </div>
        )}
      </div>
    </article>
  );
}

function propsAreEqual(previous: NodeProps, next: NodeProps): boolean {
  const prevData = previous.data as ArchitectureFlowNodeData;
  const nextData = next.data as ArchitectureFlowNodeData;
  return (
    previous.id === next.id &&
    previous.selected === next.selected &&
    prevData.lod === nextData.lod &&
    prevData.health === nextData.health &&
    prevData.deploymentLabel === nextData.deploymentLabel &&
    prevData.payloadPreview === nextData.payloadPreview &&
    prevData.executionStatus === nextData.executionStatus &&
    prevData.architectureNode === nextData.architectureNode
  );
}

export const FoundationNode = memo(FoundationNodeComponent, propsAreEqual);
