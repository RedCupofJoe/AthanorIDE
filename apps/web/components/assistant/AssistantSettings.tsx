"use client";

/**
 * Endpoint preference and a write-only vault token. The stored token is never shown.
 */
import { useEffect, useState } from "react";

import { ASSISTANT_TOKEN_NAME, assistantTokenStatus } from "@/lib/assistant";
import { fetchVaultStatus, listVaultEntries, putVaultEntry } from "@/lib/vault";
import { useUiPreferencesStore } from "@/store/ui-preferences-store";

type AssistantSettingsProps = {
  onOpenVault: () => void;
};

export function AssistantSettings({ onOpenVault }: AssistantSettingsProps) {
  const endpoint = useUiPreferencesStore((state) => state.assistantEndpoint);
  const model = useUiPreferencesStore((state) => state.assistantModel);
  const setAssistantEndpoint = useUiPreferencesStore((state) => state.setAssistantEndpoint);
  const setAssistantModel = useUiPreferencesStore((state) => state.setAssistantModel);
  const [endpointDraft, setEndpointDraft] = useState(endpoint);
  const [modelDraft, setModelDraft] = useState(model);
  const [tokenDraft, setTokenDraft] = useState("");
  const [stored, setStored] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEndpointDraft(endpoint);
    setModelDraft(model);
  }, [endpoint, model]);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const status = await fetchVaultStatus();
        if (!status.unlocked) {
          if (current) setStored(false);
          return;
        }
        const entries = await listVaultEntries();
        if (current) setStored(entries.some((entry) => entry.name === ASSISTANT_TOKEN_NAME && entry.hasValue));
      } catch {
        if (current) setStored(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [message]);

  const save = async () => {
    setError(null);
    setMessage(null);
    setAssistantEndpoint(endpointDraft.trim());
    setAssistantModel(modelDraft.trim() || "assistant");
    if (!tokenDraft.trim()) {
      setMessage("Endpoint saved.");
      return;
    }
    try {
      const status = await fetchVaultStatus();
      if (!status.exists || !status.unlocked) {
        setError("Unlock the local vault before saving the token.");
        setTokenDraft("");
        return;
      }
      await putVaultEntry(ASSISTANT_TOKEN_NAME, tokenDraft.trim());
      setTokenDraft("");
      setStored(true);
      setMessage("Endpoint saved. The token is stored in the local vault.");
    } catch (err: unknown) {
      setTokenDraft("");
      setError(err instanceof Error ? err.message : "Could not store the token.");
    }
  };

  return (
    <form
      className="z-30 mt-1 w-full max-w-xs space-y-2 rounded border border-[var(--athanor-mist)] bg-white p-3 text-sm shadow"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="block space-y-1">
        <span className="font-medium">Chat completions endpoint</span>
        <input
          aria-label="Chat completions endpoint"
          className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1"
          value={endpointDraft}
          onChange={(event) => setEndpointDraft(event.target.value)}
          placeholder="https://models.example/v1/chat/completions"
          autoComplete="off"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Model ID</span>
        <input
          aria-label="Model ID"
          className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1"
          value={modelDraft}
          onChange={(event) => setModelDraft(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Token</span>
        <input
          aria-label="Assistant token"
          className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1"
          type="password"
          value={tokenDraft}
          onChange={(event) => setTokenDraft(event.target.value)}
          placeholder="Write-only"
          autoComplete="new-password"
        />
      </label>
      <p className="text-xs text-[var(--athanor-slate)]">{assistantTokenStatus(stored)}</p>
      {message && <p className="text-xs text-[var(--athanor-slate)]">{message}</p>}
      {error && (
        <p className="text-xs text-red-700">
          {error}{" "}
          <button type="button" className="underline" onClick={onOpenVault}>
            Open the local vault
          </button>
        </p>
      )}
      <button type="submit" className="rounded bg-[var(--athanor-ink)] px-2.5 py-1 text-white">
        Save
      </button>
    </form>
  );
}
