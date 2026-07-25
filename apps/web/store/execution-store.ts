/**
 * Holds the latest Run/execute API result and helpers for payload previews.
 */
import { create } from "zustand";

import type { EdgePayload, ExecutionStep } from "@/lib/execute";

type ExecutionStatus = "idle" | "running" | "done" | "error";

interface ExecutionStore {
  status: ExecutionStatus;
  runStatus: "success" | "partial" | "failed" | null;
  steps: ExecutionStep[];
  edgePayloads: EdgePayload[];
  finalOutputs: Array<Record<string, unknown>>;
  durationMs: number | null;
  errorMessage: string | null;
  selectedStepNodeId: string | null;
  setRunning: () => void;
  setResult: (result: {
    status: "success" | "partial" | "failed";
    steps: ExecutionStep[];
    edgePayloads: EdgePayload[];
    finalOutputs: Array<Record<string, unknown>>;
    durationMs: number;
  }) => void;
  setError: (message: string) => void;
  selectStep: (nodeId: string | null) => void;
  clear: () => void;
}

export const useExecutionStore = create<ExecutionStore>((set) => ({
  status: "idle",
  runStatus: null,
  steps: [],
  edgePayloads: [],
  finalOutputs: [],
  durationMs: null,
  errorMessage: null,
  selectedStepNodeId: null,
  setRunning: () =>
    set({
      status: "running",
      errorMessage: null,
      runStatus: null,
    }),
  setResult: (result) =>
    set({
      status: "done",
      runStatus: result.status,
      steps: result.steps,
      edgePayloads: result.edgePayloads,
      finalOutputs: result.finalOutputs,
      durationMs: result.durationMs,
      errorMessage: null,
    }),
  setError: (message) =>
    set({
      status: "error",
      errorMessage: message,
      runStatus: null,
    }),
  selectStep: (nodeId) => set({ selectedStepNodeId: nodeId }),
  clear: () =>
    set({
      status: "idle",
      runStatus: null,
      steps: [],
      edgePayloads: [],
      finalOutputs: [],
      durationMs: null,
      errorMessage: null,
      selectedStepNodeId: null,
    }),
}));

export function selectPayloadPreview(
  steps: ExecutionStep[],
  nodeId: string,
): string | null {
  const step = steps.find((item) => item.nodeId === nodeId);
  if (!step) return null;
  if (step.nodeType === "foundation.output_viewer") {
    const value = Object.values(step.inputs)[0];
    return value ?? null;
  }
  const value = Object.values(step.outputs)[0];
  return value ?? step.message ?? null;
}
