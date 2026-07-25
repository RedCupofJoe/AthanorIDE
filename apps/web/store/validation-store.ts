/**
 * Holds the latest Validate API result for the validation panel.
 */
import { create } from "zustand";

import type { ValidationIssue } from "@/lib/validate";

interface ValidationStore {
  issues: ValidationIssue[];
  valid: boolean | null;
  durationMs: number | null;
  status: "idle" | "running" | "done" | "error";
  errorMessage: string | null;
  setRunning: () => void;
  setResult: (valid: boolean, issues: ValidationIssue[], durationMs: number) => void;
  setError: (message: string) => void;
  clear: () => void;
}

export const useValidationStore = create<ValidationStore>((set) => ({
  issues: [],
  valid: null,
  durationMs: null,
  status: "idle",
  errorMessage: null,
  setRunning: () =>
    set({ status: "running", errorMessage: null }),
  setResult: (valid, issues, durationMs) =>
    set({ valid, issues, durationMs, status: "done", errorMessage: null }),
  setError: (message) =>
    set({ status: "error", errorMessage: message, valid: null }),
  clear: () =>
    set({
      issues: [],
      valid: null,
      durationMs: null,
      status: "idle",
      errorMessage: null,
    }),
}));
