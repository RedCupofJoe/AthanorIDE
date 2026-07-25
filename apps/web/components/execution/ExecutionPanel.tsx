"use client";

/**
 * Bottom panel summarizing the latest Run: steps, payloads, and failures.
 */
import { useExecutionStore, selectPayloadPreview } from "@/store/execution-store";
import { useSelectionStore } from "@/store/selection-store";
import { cn } from "@/lib/cn";

export function ExecutionPanel() {
  const {
    status,
    runStatus,
    steps,
    finalOutputs,
    durationMs,
    errorMessage,
    selectedStepNodeId,
    selectStep,
  } = useExecutionStore();
  const focusNode = useSelectionStore((state) => state.focusNode);

  return (
    <section
      className="border-t border-[var(--athanor-mist)] bg-white/90 px-4 py-3"
      aria-live="polite"
      aria-label="Execution debug"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Execution</h2>
        <p className="text-xs text-[var(--athanor-slate)]">
          {status === "idle" && "Not run yet"}
          {status === "running" && "Running…"}
          {status === "done" &&
            `${runStatus ?? "done"}${durationMs != null ? ` · ${durationMs.toFixed(1)} ms` : ""}`}
          {status === "error" && (errorMessage ?? "Execution failed")}
        </p>
      </div>

      {status === "idle" && (
        <p className="text-sm text-[var(--athanor-slate)]">
          Click Run to inspect payloads flowing between nodes. Compiled transforms use the Podman
          sandbox; secrets stay redacted.
        </p>
      )}

      {status === "done" && steps.length === 0 && (
        <p className="text-sm text-[var(--athanor-slate)]">
          Execution refused because the graph has validation errors. Fix issues, then Run again.
        </p>
      )}

      {finalOutputs.length > 0 && (
        <div className="mb-3 rounded border border-[var(--athanor-mist)] bg-[var(--athanor-paper)] px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--athanor-slate)]">
            Final output
          </p>
          {finalOutputs.map((item) => (
            <pre
              key={String(item.nodeId)}
              className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-xs"
            >
              {String(item.value ?? "")}
            </pre>
          ))}
        </div>
      )}

      {steps.length > 0 && (
        <ul className="max-h-40 space-y-2 overflow-auto">
          {steps.map((step) => {
            const preview = selectPayloadPreview(steps, step.nodeId);
            return (
              <li key={step.nodeId}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded border px-3 py-2 text-left text-sm",
                    step.status === "error"
                      ? "border-red-200 bg-red-50"
                      : step.status === "skipped"
                        ? "border-amber-200 bg-amber-50"
                        : selectedStepNodeId === step.nodeId
                          ? "border-[var(--athanor-ember)] bg-orange-50"
                          : "border-[var(--athanor-mist)] bg-white",
                  )}
                  onClick={() => {
                    selectStep(step.nodeId);
                    focusNode(step.nodeId);
                  }}
                >
                  <span className="font-medium uppercase tracking-wide text-xs">
                    {step.status} · {step.nodeName}
                  </span>
                  {step.message && (
                    <span className="mt-1 block text-xs text-[var(--athanor-slate)]">
                      {step.message}
                    </span>
                  )}
                  {preview != null && preview !== "" && (
                    <span className="mt-1 block truncate font-mono text-[11px] text-[var(--athanor-ink)]">
                      {preview}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
