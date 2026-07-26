"use client";

/**
 * Local vault panel: store secret values for local runs (API-encrypted).
 * Graphs keep secret names only; values never enter project-store.
 */
import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, Shield, Trash2, X } from "lucide-react";

import {
  collectLocalSecretNames,
  deleteVaultEntry,
  fetchVaultCoverage,
  fetchVaultStatus,
  initVault,
  listVaultEntries,
  lockVault,
  materializeVaultEnv,
  putVaultEntry,
  unlockVault,
  type VaultCoverage,
  type VaultEntryMeta,
  type VaultStatus,
} from "@/lib/vault";
import { useProjectStore } from "@/store/project-store";

type LocalVaultPanelProps = {
  open: boolean;
  onClose: () => void;
  initialSecretName?: string;
};

export function LocalVaultPanel({
  open,
  onClose,
  initialSecretName = "",
}: LocalVaultPanelProps) {
  const graph = useProjectStore((state) => state.graph);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntryMeta[]>([]);
  const [coverage, setCoverage] = useState<VaultCoverage | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [secretName, setSecretName] = useState(initialSecretName);
  const [secretValue, setSecretValue] = useState("");
  const [materializePath, setMaterializePath] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await fetchVaultStatus();
    setStatus(next);
    if (next.unlocked) {
      setEntries(await listVaultEntries());
      setCoverage(await fetchVaultCoverage(graph));
    } else {
      setEntries([]);
      setCoverage(null);
    }
  }, [graph]);

  useEffect(() => {
    if (!open) return;
    setSecretName(initialSecretName);
    setError(null);
    setMessage(null);
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load vault status");
    });
  }, [open, initialSecretName, refresh]);

  if (!open) return null;

  const graphNames = collectLocalSecretNames(graph);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Vault operation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="flex h-full flex-col gap-3 overflow-auto bg-white/90 p-4"
      aria-label="Local secrets vault"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" aria-hidden />
            Local vault
          </h2>
          <p className="mt-1 text-xs text-[var(--athanor-slate)]">
            Store secret <strong className="font-medium">values</strong> encrypted on this machine
            for local runs. Graphs keep secret <strong className="font-medium">names</strong> only.
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-[var(--athanor-slate)] hover:bg-[var(--athanor-mist)]"
          onClick={onClose}
          aria-label="Close local vault"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {status && (
        <p className="text-xs text-[var(--athanor-slate)]">
          {status.exists ? (status.unlocked ? "Unlocked" : "Locked") : "Not initialized"}
          {status.unlocked && status.entryCount != null ? ` · ${status.entryCount} secret(s)` : ""}
        </p>
      )}

      {!status?.exists && (
        <div className="space-y-2 rounded border border-[var(--athanor-mist)] p-3">
          <p className="text-xs text-[var(--athanor-slate)]">
            Create a passphrase-protected vault (min 8 characters). There is no recovery if lost.
          </p>
          <input
            type="password"
            autoComplete="new-password"
            className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || passphrase.length < 8}
            className="inline-flex w-full items-center justify-center gap-1 rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            onClick={() =>
              void run(async () => {
                await initVault(passphrase);
                setPassphrase("");
                setMessage("Vault created and unlocked.");
              })
            }
          >
            <LockOpen className="h-3.5 w-3.5" />
            Initialize vault
          </button>
        </div>
      )}

      {status?.exists && !status.unlocked && (
        <div className="space-y-2 rounded border border-[var(--athanor-mist)] p-3">
          <input
            type="password"
            autoComplete="current-password"
            className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || !passphrase}
            className="inline-flex w-full items-center justify-center gap-1 rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            onClick={() =>
              void run(async () => {
                await unlockVault(passphrase);
                setPassphrase("");
                setMessage("Vault unlocked.");
              })
            }
          >
            <LockOpen className="h-3.5 w-3.5" />
            Unlock
          </button>
        </div>
      )}

      {status?.unlocked && (
        <>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1 rounded border border-[var(--athanor-mist)] px-3 py-1.5 text-sm"
            onClick={() =>
              void run(async () => {
                await lockVault();
                setMessage("Vault locked.");
              })
            }
          >
            <Lock className="h-3.5 w-3.5" />
            Lock vault
          </button>

          <div className="space-y-2 rounded border border-[var(--athanor-mist)] p-3">
            <p className="text-xs font-medium">Add / update secret</p>
            <input
              className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
              placeholder="Secret name (e.g. HF_TOKEN)"
              value={secretName}
              onChange={(event) => setSecretName(event.target.value)}
              list="vault-graph-secret-names"
            />
            <datalist id="vault-graph-secret-names">
              {graphNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
              placeholder="Secret value"
              value={secretValue}
              onChange={(event) => setSecretValue(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !secretName.trim() || !secretValue}
              className="inline-flex w-full items-center justify-center rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
              onClick={() =>
                void run(async () => {
                  await putVaultEntry(secretName.trim(), secretValue);
                  setSecretValue("");
                  setMessage(`Saved ${secretName.trim()} (value not shown).`);
                })
              }
            >
              Save to vault
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Vault entries</p>
            {entries.length === 0 && (
              <p className="text-xs text-[var(--athanor-slate)]">No secrets stored yet.</p>
            )}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
              >
                <span>
                  {entry.name}
                  {!entry.hasValue && (
                    <span className="ml-1 text-xs text-[var(--athanor-slate)]">(empty)</span>
                  )}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-[var(--athanor-slate)] hover:text-red-700"
                  aria-label={`Delete ${entry.name}`}
                  onClick={() =>
                    void run(async () => {
                      await deleteVaultEntry(entry.name);
                      setMessage(`Removed ${entry.name}.`);
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {coverage && (
            <div className="space-y-1 rounded border border-[var(--athanor-mist)] p-3 text-xs">
              <p className="font-medium">Graph coverage</p>
              {coverage.requested.length === 0 ? (
                <p className="text-[var(--athanor-slate)]">
                  No secret names referenced in this project yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {coverage.requested.map((name) => {
                    const ok = coverage.present.includes(name);
                    return (
                      <li key={name} className="flex justify-between gap-2">
                        <span>{name}</span>
                        <span className={ok ? "text-emerald-700" : "text-amber-700"}>
                          {ok ? "present" : "missing"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="mt-auto space-y-2 border-t border-[var(--athanor-mist)] pt-3">
            <p className="text-xs font-medium">Materialize .env for local apps</p>
            <p className="text-xs text-[var(--athanor-slate)]">
              Absolute path on the API host (this machine). Writes a local `.env` — never included
              in export ZIPs.
            </p>
            <input
              className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
              placeholder="/path/to/exported-project/.env"
              value={materializePath}
              onChange={(event) => setMaterializePath(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !materializePath.trim()}
              className="inline-flex w-full items-center justify-center rounded border border-[var(--athanor-mist)] px-3 py-1.5 text-sm disabled:opacity-40"
              onClick={() =>
                void run(async () => {
                  const result = await materializeVaultEnv(materializePath.trim(), graph);
                  setMessage(
                    `Wrote ${result.writtenCount} secret(s) to ${result.path}` +
                      (result.missing.length
                        ? ` (missing: ${result.missing.join(", ")})`
                        : ""),
                  );
                })
              }
            >
              Write .env
            </button>
          </div>
        </>
      )}

      {message && <p className="text-xs text-emerald-800">{message}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </aside>
  );
}
