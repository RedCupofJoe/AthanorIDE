"use client";

/**
 * Project-level infrastructure pull-token slots (secret names only).
 * Per-node tokenSecretName fields remain on individual nodes.
 */
import { useMemo, useState } from "react";
import {
  DEFAULT_INFRASTRUCTURE_TOKEN_KINDS,
  newId,
  type InfrastructureTokenKind,
  type InfrastructureTokenSlot,
} from "@athanor/contracts";
import { KeyRound, Plus, Trash2, X } from "lucide-react";

import { useProjectStore } from "@/store/project-store";

type InfrastructureTokensPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function InfrastructureTokensPanel({ open, onClose }: InfrastructureTokensPanelProps) {
  const tokens = useProjectStore((state) => state.graph.infrastructureTokens ?? []);
  const upsertInfrastructureToken = useProjectStore((state) => state.upsertInfrastructureToken);
  const removeInfrastructureToken = useProjectStore((state) => state.removeInfrastructureToken);
  const [addKind, setAddKind] = useState<string>("");
  const [customLabel, setCustomLabel] = useState("");

  const usedBuiltins = useMemo(
    () => new Set(tokens.filter((slot) => slot.kind !== "custom").map((slot) => slot.kind)),
    [tokens],
  );

  const addOptions = useMemo(() => {
    const builtins = DEFAULT_INFRASTRUCTURE_TOKEN_KINDS.filter(
      (item) => !usedBuiltins.has(item.kind),
    ).map((item) => ({ value: item.kind, label: item.label }));
    return [...builtins, { value: "custom", label: "Custom provider…" }];
  }, [usedBuiltins]);

  if (!open) return null;

  const updateSlot = (slot: InfrastructureTokenSlot, patch: Partial<InfrastructureTokenSlot>) => {
    upsertInfrastructureToken({ ...slot, ...patch });
  };

  const handleAdd = () => {
    if (!addKind) return;
    if (addKind === "custom") {
      const label = customLabel.trim() || "Custom registry";
      upsertInfrastructureToken({
        id: newId(),
        kind: "custom",
        label,
        secretName: "",
        provider: "env",
        recommendedEnvName: "",
      });
      setCustomLabel("");
      setAddKind("");
      return;
    }
    const preset = DEFAULT_INFRASTRUCTURE_TOKEN_KINDS.find((item) => item.kind === addKind);
    if (!preset) return;
    upsertInfrastructureToken({
      id: `infra-token-${preset.kind}`,
      kind: preset.kind as Exclude<InfrastructureTokenKind, "custom">,
      label: preset.label,
      secretName: "",
      provider: "env",
      recommendedEnvName: preset.recommendedEnvName,
    });
    setAddKind("");
  };

  return (
    <aside
      className="flex h-full flex-col gap-3 overflow-auto bg-white/90 p-4"
      aria-label="Infrastructure pull tokens"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" aria-hidden />
            Infra pull tokens
          </h2>
          <p className="mt-1 text-xs text-[var(--athanor-slate)]">
            Registry credentials for Hugging Face, Kaggle, Docker, and more. Store{" "}
            <strong className="font-medium">secret names only</strong> — never paste token values.
            Per-node tokens stay on each node&apos;s inspector.
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-[var(--athanor-slate)] hover:bg-[var(--athanor-mist)]"
          onClick={onClose}
          aria-label="Close infrastructure tokens"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {tokens.map((slot) => (
          <div
            key={slot.id}
            className="space-y-2 rounded border border-[var(--athanor-mist)] bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{slot.label}</span>
              {slot.kind === "custom" && (
                <button
                  type="button"
                  className="rounded p-1 text-[var(--athanor-slate)] hover:text-red-700"
                  onClick={() => removeInfrastructureToken(slot.id)}
                  aria-label={`Remove ${slot.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-[var(--athanor-slate)]">Secret name</span>
              <input
                className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
                value={slot.secretName}
                placeholder={slot.recommendedEnvName || "MY_REGISTRY_TOKEN"}
                onChange={(event) => updateSlot(slot, { secretName: event.target.value })}
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-[var(--athanor-slate)]">Provider</span>
              <select
                className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
                value={slot.provider}
                onChange={(event) =>
                  updateSlot(slot, {
                    provider: event.target.value as InfrastructureTokenSlot["provider"],
                  })
                }
              >
                <option value="env">env</option>
                <option value="file">file</option>
                <option value="vault">vault</option>
                <option value="cloud_secret_manager">cloud_secret_manager</option>
              </select>
            </label>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-2 border-t border-[var(--athanor-mist)] pt-3">
        <label className="block space-y-1 text-xs">
          <span className="font-medium">Add token slot</span>
          <select
            className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
            value={addKind}
            onChange={(event) => setAddKind(event.target.value)}
          >
            <option value="">Select provider…</option>
            {addOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {addKind === "custom" && (
          <input
            className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
            placeholder="Custom provider label"
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
          />
        )}
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
          disabled={!addKind || (addKind === "custom" && !customLabel.trim())}
          onClick={handleAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Add slot
        </button>
      </div>
    </aside>
  );
}
