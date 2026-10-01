"use client";

/**
 * Confirm/cancel banner for deletes requested from the canvas or inspector.
 */
import { usePendingDeleteStore } from "@/store/pending-delete-store";
import { useProjectStore } from "@/store/project-store";

export function DeleteConfirmationPanel() {
  const pending = usePendingDeleteStore((state) => state.pending);
  const cancelDelete = usePendingDeleteStore((state) => state.cancelDelete);
  const confirmDelete = usePendingDeleteStore((state) => state.confirmDelete);
  const nodes = useProjectStore((state) => state.graph.nodes);
  const edges = useProjectStore((state) => state.graph.edges);

  if (!pending) return null;

  const nodeNames = pending.nodeIds.map((id) => {
    const node = nodes.find((item) => item.id === id);
    return node?.name ?? id;
  });
  const edgeCount = edges.filter(edge => pending.edgeIds.includes(edge.id) || pending.nodeIds.includes(edge.sourceNodeId) || pending.nodeIds.includes(edge.targetNodeId)).length;

  return (
    <section
      className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3"
      aria-label="Confirm delete"
      role="alertdialog"
      aria-modal="false"
    >
      <h2 className="text-sm font-semibold text-red-900">Confirm delete</h2>
      <p className="mt-1 text-xs leading-relaxed text-red-800">
        {nodeNames.length > 0 && (
          <>
            Remove{" "}
            <span className="font-medium">
              {nodeNames.length === 1
                ? `“${nodeNames[0]}”`
                : `${nodeNames.length} nodes`}
            </span>
            {nodeNames.length > 1 && (
              <span className="mt-1 block truncate text-[11px] text-red-700">
                {nodeNames.slice(0, 4).join(", ")}
                {nodeNames.length > 4 ? ` +${nodeNames.length - 4} more` : ""}
              </span>
            )}
          </>
        )}
        {edgeCount > 0 && (
          <>
            {nodeNames.length > 0 ? " and " : "Remove "}
            <span className="font-medium">
              {edgeCount} connection{edgeCount === 1 ? "" : "s"}
            </span>
          </>
        )}
        . You can restore this with Undo (Ctrl/Cmd+Z).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          autoFocus
          onClick={confirmDelete}
        >
          Delete
        </button>
        <button
          type="button"
          className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100"
          onClick={cancelDelete}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
