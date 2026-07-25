"use client";

/**
 * Port row with contract badge, hover tooltip, and live compatibility highlighting.
 */
import { Handle, Position } from "@xyflow/react";
import {
  CONTRACT_TYPE_LABELS,
  areContractsCompatible,
  type ContractType,
  type NodePort,
} from "@athanor/contracts";

import { cn } from "@/lib/cn";
import {
  useConnectionDraftStore,
  type ConnectionDraft,
} from "@/store/connection-draft-store";

function portTitle(port: NodePort, direction: "input" | "output"): string {
  const label = CONTRACT_TYPE_LABELS[port.contractType];
  const req = port.required ? "Required" : "Optional";
  if (direction === "input") {
    return `Input “${port.name}” · ${label} · ${req}. Accepts ${label} or Any.`;
  }
  return `Output “${port.name}” · ${label} · ${req}. Connect to matching ${label} or Any inputs.`;
}

function compatibilityForPort(
  draft: ConnectionDraft | null,
  nodeId: string,
  port: NodePort,
  direction: "input" | "output",
): "neutral" | "compatible" | "incompatible" | "origin" {
  if (!draft) return "neutral";
  if (draft.nodeId === nodeId && draft.handleId === port.id) return "origin";

  // Dragging from an output → only inputs can be targets
  if (draft.handleType === "source") {
    if (direction !== "input") return "incompatible";
    return areContractsCompatible(draft.contractType, port.contractType)
      ? "compatible"
      : "incompatible";
  }

  // Dragging from an input → only outputs can be sources
  if (direction !== "output") return "incompatible";
  return areContractsCompatible(port.contractType, draft.contractType)
    ? "compatible"
    : "incompatible";
}

type PortRowProps = {
  nodeId: string;
  port: NodePort;
  direction: "input" | "output";
  compact?: boolean;
};

export function PortRow({ nodeId, port, direction, compact = false }: PortRowProps) {
  const draft = useConnectionDraftStore((state) => state.draft);
  const match = compatibilityForPort(draft, nodeId, port, direction);
  const label = CONTRACT_TYPE_LABELS[port.contractType];
  const isInput = direction === "input";

  return (
    <div
      className={cn(
        "group/port relative flex items-center gap-2 text-xs",
        isInput ? "justify-start" : "justify-end",
        match === "incompatible" && draft ? "opacity-35" : null,
        match === "compatible" && "rounded bg-emerald-50/80 ring-1 ring-emerald-300/70",
        match === "origin" && "rounded bg-orange-50/80 ring-1 ring-orange-300/70",
      )}
      title={portTitle(port, direction)}
    >
      {isInput && (
        <Handle
          id={port.id}
          type="target"
          position={Position.Left}
          className={cn(
            "!size-3 !border-2 !border-white !bg-[var(--athanor-ember)] transition-transform",
            "group-hover/port:!scale-125",
            match === "compatible" && "!bg-emerald-600 !scale-125",
            match === "incompatible" && draft && "!bg-stone-400",
          )}
          aria-label={portTitle(port, direction)}
        />
      )}

      <span className={cn("font-medium", isInput ? "pl-1" : "pr-1")}>{port.name}</span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          isInput
            ? "bg-orange-100 text-[var(--athanor-ember)]"
            : "bg-stone-200 text-[var(--athanor-ink)]",
        )}
      >
        {label}
      </span>
      {!compact && port.required === false && (
        <span className="text-[10px] text-[var(--athanor-slate)]">opt</span>
      )}

      {!isInput && (
        <Handle
          id={port.id}
          type="source"
          position={Position.Right}
          className={cn(
            "!size-3 !border-2 !border-white !bg-[var(--athanor-ink)] transition-transform",
            "group-hover/port:!scale-125",
            match === "compatible" && "!bg-emerald-600 !scale-125",
            match === "incompatible" && draft && "!bg-stone-400",
          )}
          aria-label={portTitle(port, direction)}
        />
      )}

      <div
        className={cn(
          "pointer-events-none absolute z-20 hidden max-w-[220px] rounded-md border border-[var(--athanor-mist)] bg-white px-2 py-1.5 text-[10px] leading-snug text-[var(--athanor-slate)] shadow-md",
          "group-hover/port:block",
          isInput ? "left-0 top-full mt-1" : "right-0 top-full mt-1",
        )}
        role="tooltip"
      >
        <p className="font-semibold text-[var(--athanor-ink)]">
          {isInput ? "Input" : "Output"} · {label}
        </p>
        <p className="mt-0.5">
          {isInput
            ? `Connect a ${label} (or Any) output here.`
            : `Connect this ${label} output to a matching input.`}
        </p>
        {port.required ? (
          <p className="mt-0.5 text-[var(--athanor-ember)]">Required</p>
        ) : (
          <p className="mt-0.5">Optional</p>
        )}
        {match === "compatible" && (
          <p className="mt-0.5 font-medium text-emerald-700">Compatible with current drag</p>
        )}
        {match === "incompatible" && draft && (
          <p className="mt-0.5 font-medium text-red-700">Not compatible with current drag</p>
        )}
      </div>
    </div>
  );
}

export function contractBadgeLabel(type: ContractType): string {
  return CONTRACT_TYPE_LABELS[type];
}
