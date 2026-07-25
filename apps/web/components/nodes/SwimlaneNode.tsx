"use client";

/**
 * Deployment environment swimlane container on the canvas.
 */
import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

import { cn } from "@/lib/cn";
import type { LodLevel } from "@/lib/lod";

export type SwimlaneFlowNodeData = {
  name: string;
  kind: string;
  lod: LodLevel;
  nodeCount: number;
};

function SwimlaneNodeComponent({ data, selected }: NodeProps) {
  const { name, kind, lod, nodeCount } = data as SwimlaneFlowNodeData;

  return (
    <div
      className={cn(
        "h-full w-full rounded-lg border-2 border-dashed bg-[color-mix(in_oklab,var(--athanor-mist)_35%,transparent)]",
        selected ? "border-[var(--athanor-ember)]" : "border-[var(--athanor-ink)]/25",
      )}
      aria-label={`${name} deployment swimlane`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--athanor-ink)]">
            {name}
          </p>
          {lod !== "macro" && (
            <p className="text-[10px] text-[var(--athanor-slate)]">
              {kind.replaceAll("_", " ")} · {nodeCount} node
              {nodeCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {lod === "macro" && (
          <p className="text-[10px] text-[var(--athanor-slate)]">{nodeCount} nodes</p>
        )}
      </div>
    </div>
  );
}

export const SwimlaneNode = memo(SwimlaneNodeComponent);
