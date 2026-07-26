/**
 * Client helpers for the Athanor local secrets vault API.
 * Never persist secret values in the graph or localStorage.
 */
import type { ArchitectureGraph } from "@athanor/contracts";

import { getApiBaseUrl } from "@/lib/api";

export type VaultStatus = {
  exists: boolean;
  unlocked: boolean;
  entryCount: number | null;
  unlockedUntil: number | null;
};

export type VaultEntryMeta = {
  id: string;
  name: string;
  updatedAt: string;
  hasValue: boolean;
};

export type VaultCoverage = {
  unlocked: boolean;
  requested: string[];
  present: string[];
  missing: string[];
};

export type VaultMaterializeResult = {
  path: string;
  writtenCount: number;
  writtenNames: string[];
  missing: string[];
};

async function vaultFetch<T>(
  path: string,
  init?: RequestInit & { parseJson?: boolean },
): Promise<T> {
  const { parseJson = true, ...rest } = init ?? {};
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Vault request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; detail?: string };
      message = body.message ?? body.detail ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (!parseJson || response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function collectLocalSecretNames(graph: ArchitectureGraph): string[] {
  const names = new Set<string>();
  for (const slot of graph.infrastructureTokens ?? []) {
    const name = slot.secretName?.trim();
    if (name) names.add(name);
  }
  for (const node of graph.nodes) {
    const config = node.configuration;
    if (node.type === "foundation.secret_reference") {
      const name = typeof config.secretName === "string" ? config.secretName.trim() : "";
      if (name) names.add(name);
    }
    for (const key of ["tokenSecretName", "primarySecretName", "vectorSecretName"] as const) {
      const raw = config[key];
      if (typeof raw === "string" && raw.trim()) names.add(raw.trim());
    }
  }
  return [...names].sort();
}

export async function fetchVaultStatus(): Promise<VaultStatus> {
  return vaultFetch<VaultStatus>("/api/v1/vault/status");
}

export async function initVault(passphrase: string): Promise<VaultStatus> {
  return vaultFetch<VaultStatus>("/api/v1/vault/init", {
    method: "POST",
    body: JSON.stringify({ passphrase }),
  });
}

export async function unlockVault(passphrase: string): Promise<VaultStatus> {
  return vaultFetch<VaultStatus>("/api/v1/vault/unlock", {
    method: "POST",
    body: JSON.stringify({ passphrase }),
  });
}

export async function lockVault(): Promise<VaultStatus> {
  return vaultFetch<VaultStatus>("/api/v1/vault/lock", { method: "POST" });
}

export async function listVaultEntries(): Promise<VaultEntryMeta[]> {
  const body = await vaultFetch<{ items: VaultEntryMeta[] }>("/api/v1/vault/entries");
  return body.items;
}

export async function putVaultEntry(
  name: string,
  value: string,
  notes?: string,
): Promise<VaultEntryMeta> {
  return vaultFetch<VaultEntryMeta>(`/api/v1/vault/entries/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ value, notes: notes ?? null }),
  });
}

export async function deleteVaultEntry(name: string): Promise<void> {
  await vaultFetch<void>(`/api/v1/vault/entries/${encodeURIComponent(name)}`, {
    method: "DELETE",
    parseJson: false,
  });
}

export async function fetchVaultCoverage(graph: ArchitectureGraph): Promise<VaultCoverage> {
  return vaultFetch<VaultCoverage>("/api/v1/vault/coverage", {
    method: "POST",
    body: JSON.stringify({ graph }),
  });
}

export async function materializeVaultEnv(
  path: string,
  graph: ArchitectureGraph,
): Promise<VaultMaterializeResult> {
  return vaultFetch<VaultMaterializeResult>("/api/v1/vault/materialize-env", {
    method: "POST",
    body: JSON.stringify({ path, graph }),
  });
}
