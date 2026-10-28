"use client";
import { memo, useEffect, useState } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { WorkflowTask } from "@athanor/contracts";
import { useProjectStore } from "@/store/project-store";

type TaskData = { task: WorkflowTask; engineering?: boolean; count?: number };
export function BriefField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <textarea
        className="nodrag nowheel mt-1 block w-full resize-y rounded border bg-white p-2 text-sm font-normal text-slate-900"
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
      />
    </label>
  );
}
export const TaskNode = memo(function TaskNode({ data, selected }: NodeProps) {
  const { task, engineering, count } = data as TaskData;
  const update = useProjectStore((s) => s.updateTask);
  return (
    <div
      className={`h-full w-full rounded-xl border-2 ${engineering ? "bg-slate-50/30" : "bg-white shadow-sm"}`}
      style={{ borderColor: task.color }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={180}
        color={task.color}
        onResizeEnd={(_, bounds) =>
          update(task.id, {
            [engineering ? "engineeringBounds" : "bounds"]: bounds,
          })
        }
      />
      <div
        className="task-drag-handle cursor-grab rounded-t-lg px-3 py-2 text-sm font-semibold text-white"
        style={{ background: task.color }}
      >
        {task.name}
        {engineering && (
          <span className="ml-2 font-normal">· {count} components</span>
        )}
      </div>
      {!engineering && (
        <>
          <Handle
            id="in"
            type="target"
            position={Position.Left}
            style={{ width: 14, height: 14 }}
          />
          <Handle
            id="out"
            type="source"
            position={Position.Right}
            style={{ width: 14, height: 14 }}
          />
          <div
            className="nowheel space-y-2 overflow-auto p-3"
            style={{ maxHeight: "calc(100% - 38px)" }}
          >
            <BriefField
              label="Role"
              value={task.role}
              onSave={(role) => update(task.id, { role })}
            />
            <BriefField
              label="Expected tasks"
              value={task.expectedTasks}
              onSave={(expectedTasks) => update(task.id, { expectedTasks })}
            />
            <BriefField
              label="Functional constraints"
              value={task.constraints}
              onSave={(constraints) => update(task.id, { constraints })}
            />
          </div>
        </>
      )}
    </div>
  );
});
export function StartNode() {
  return (
    <div className="rounded-full bg-slate-900 px-5 py-3 font-semibold text-white">
      Start
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        style={{ width: 14, height: 14 }}
      />
    </div>
  );
}

export function EndNode() {
  return (
    <div className="rounded-full border-4 border-emerald-800 bg-emerald-700 px-5 py-3 font-semibold text-white" title="Workflow completes after all normal branches finish. Recovery results resume their original branch.">
      End
      <Handle id="in" type="target" position={Position.Left} isConnectable={false} style={{ width: 14, height: 14 }} />
    </div>
  );
}
