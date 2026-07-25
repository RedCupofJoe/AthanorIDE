"use client";

/**
 * Collapsed macro block node with external ports.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { type NodePort } from "@athanor/contracts";
import { Boxes } from "lucide-react";

import { PortRow } from "@/components/nodes/PortRow";
import { cn } from "@/lib/cn";
import type { LodLevel } from "@/lib/lod";

export type MacroFlowNodeData = {
  macroId: string;
  name: string;
  description?: string;
  nodeCount: number;
  inputs: NodePort[];
  outputs: NodePort[];
  lod: LodLevel;
  onExpand: (macroId: string) => void;
};

function MacroBlockNodeComponent({ id, data, selected }: NodeProps) {
  const { macroId, name, description, nodeCount, inputs, outputs, lod, onExpand } =
    data as MacroFlowNodeData;

  return (
    <article
      className={cn(
        "min-w-[200px] rounded-xl border-2 border-dashed bg-[var(--athanor-paper)]/95 shadow-sm",
        selected ? "border-[var(--athanor-ember)]" : "border-[var(--athanor-ink)]/40",
      )}
      aria-label={`${name} macro block`}
    >
      <header className="flex items-start gap-2 px-3 py-2">
        <Boxes className="mt-0.5 size-4 text-[var(--athanor-ember)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{name}</h3>
          <p className="text-xs text-[var(--athanor-slate)]">
            {nodeCount} node{nodeCount === 1 ? "" : "s"}
            {lod !== "macro" && description ? ` · ${description}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-[var(--athanor-mist)] px-2 py-0.5 text-[10px]"
          onClick={(event) => {
            event.stopPropagation();
            onExpand(macroId);
          }}
        >
          Expand
        </button>
      </header>

      {lod !== "macro" && (
        <div className="space-y-2 border-t border-[var(--athanor-mist)] px-3 py-2">
          {inputs.map((port) => (
            <PortRow key={port.id} nodeId={id} port={port} direction="input" />
          ))}
          {outputs.map((port) => (
            <PortRow key={port.id} nodeId={id} port={port} direction="output" />
          ))}
          {inputs.length === 0 && outputs.length === 0 && (
            <p className="text-xs text-[var(--athanor-slate)]">No external ports</p>
          )}
        </div>
      )}

      {lod === "macro" && (
        <>
          {inputs.map((port) => (
            <Handle
              key={port.id}
              id={port.id}
              type="target"
              position={Position.Left}
              className="!opacity-0"
            />
          ))}
          {outputs.map((port) => (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={Position.Right}
              className="!opacity-0"
            />
          ))}
        </>
      )}
    </article>
  );
}

export const MacroBlockNode = memo(MacroBlockNodeComponent);
