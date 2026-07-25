"use client";

/**
 * Bottom panel listing Validate issues with focus navigation.
 */
import { useValidationStore } from "@/store/validation-store";
import { useSelectionStore } from "@/store/selection-store";
import { cn } from "@/lib/cn";

export function ValidationPanel() {
  const { issues, valid, status, errorMessage, durationMs } = useValidationStore();
  const focusNode = useSelectionStore((state) => state.focusNode);
  const focusEdge = useSelectionStore((state) => state.focusEdge);

  return (
    <section
      className="border-t border-[var(--athanor-mist)] bg-white/90 px-4 py-3"
      aria-live="polite"
      aria-label="Validation results"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Validation</h2>
        <p className="text-xs text-[var(--athanor-slate)]">
          {status === "idle" && "Not validated yet"}
          {status === "running" && "Validating…"}
          {status === "done" &&
            (valid
              ? `Valid${durationMs != null ? ` · ${durationMs.toFixed(1)} ms` : ""}`
              : `${issues.filter((i) => i.severity === "error").length} error(s)`)}
          {status === "error" && (errorMessage ?? "Validation failed")}
        </p>
      </div>

      {issues.length === 0 ? (
        <p className="text-sm text-[var(--athanor-slate)]">
          {status === "done" && valid
            ? "No issues. Architecture checks passed."
            : "Run Validate to check configuration, contracts, portals, and deployment boundaries."}
        </p>
      ) : (
        <ul className="max-h-36 space-y-2 overflow-auto">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded border px-3 py-2 text-left text-sm",
                  issue.severity === "error"
                    ? "border-red-200 bg-red-50"
                    : issue.severity === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-[var(--athanor-mist)] bg-white",
                )}
                onClick={() => {
                  if (issue.nodeId) focusNode(issue.nodeId);
                  else if (issue.edgeId) focusEdge(issue.edgeId);
                }}
                disabled={!issue.nodeId && !issue.edgeId}
              >
                <span className="font-medium uppercase tracking-wide text-xs">
                  {issue.severity} · {issue.code}
                </span>
                <span className="mt-1 block">{issue.message}</span>
                {issue.suggestedAction && (
                  <span className="mt-1 block text-xs text-[var(--athanor-slate)]">
                    Suggested: {issue.suggestedAction}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
