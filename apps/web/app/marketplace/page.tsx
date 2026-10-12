"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadMarketplaceSnapshot, MARKETPLACE_TOPICS, marketplaceSnapshotIsStale,
  refreshMarketplace, type MarketplaceSnapshot,
} from "@/lib/marketplace";

export default function MarketplacePage() {
  const [snapshot, setSnapshot] = useState<MarketplaceSnapshot | null>(null);
  const [topic, setTopic] = useState<string>(MARKETPLACE_TOPICS[0].id);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading your local marketplace snapshot…");
  const refresh = async (savedSnapshot: MarketplaceSnapshot | null = snapshot) => {
    setBusy(true);
    try {
      const result = await refreshMarketplace();
      setSnapshot(result);
      setMessage(`Updated ${new Date(result.refreshedAt).toLocaleString()}.`);
    } catch {
      setMessage(savedSnapshot ? "Offline or marketplace service unavailable. Showing the saved snapshot." : "Marketplace is unavailable. Start the Athanor API to refresh the catalog.");
    } finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void loadMarketplaceSnapshot().then(async (saved) => {
      if (!active) return;
      setSnapshot(saved);
      if (marketplaceSnapshotIsStale(saved)) await refresh(saved);
      else setMessage(`Saved snapshot from ${new Date(saved!.refreshedAt).toLocaleString()}. Next update check in 24 hours.`);
    });
    return () => { active = false; };
    // Refresh is intentionally run once at page launch, not on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entries = useMemo(() => (snapshot?.entries ?? []).filter((entry) => entry.topic === topic
    && `${entry.name} ${entry.description}`.toLowerCase().includes(query.toLowerCase())), [snapshot, topic, query]);
  const topicLabel = MARKETPLACE_TOPICS.find((item) => item.id === topic)?.label ?? topic;

  return <main className="min-h-screen px-4 py-6 sm:px-8">
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
      <div><Link href="/" className="text-sm text-[var(--athanor-ember)] hover:underline">← Projects</Link><h1 className="mt-2 text-2xl font-semibold">Open-source marketplace</h1><p className="mt-1 text-sm text-[var(--athanor-slate)]">Browse public npm packages and exact-version OSV advisories. Listings are not security endorsements.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded bg-[var(--athanor-ink)] px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Refreshing…" : "Refresh now"}</button>
    </header>
    <div className="mx-auto mt-5 max-w-7xl rounded border bg-white/80 p-3 text-xs text-[var(--athanor-slate)]" role="status">{message} Ranking uses 90-day downloads (40%), confidence-adjusted ratings (30%), and CVE risk (30%). Missing sources are excluded and remaining weights are normalized. npm does not publish consumer ratings here, so ratings are shown as unavailable. A clean advisory query applies only to the listed version and check time.</div>
    <div className="mx-auto mt-5 grid max-w-7xl gap-5 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Marketplace topics" className="space-y-1 rounded border bg-white/70 p-2">
        {MARKETPLACE_TOPICS.map((item) => {
          const count = snapshot?.entries.filter((entry) => entry.topic === item.id).length ?? 0;
          return <button key={item.id} type="button" aria-pressed={topic === item.id} onClick={() => setTopic(item.id)} className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${topic === item.id ? "bg-orange-50 font-semibold text-[var(--athanor-ember)]" : "hover:bg-stone-50"}`}><span>{item.label}</span><span className="ml-2 text-xs">{count}</span></button>;
        })}
      </nav>
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{topicLabel}</h2><input aria-label="Search marketplace" placeholder="Filter packages…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full max-w-sm rounded border bg-white px-3 py-2 text-sm" /></div>
        {snapshot?.unavailableTopics.includes(topic) && <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">This topic could not be refreshed. Any saved entries remain available.</p>}
        {entries.length === 0 ? <p className="rounded border bg-white/70 p-6 text-sm text-[var(--athanor-slate)]">{snapshot ? "No cached packages match this topic. Refresh with an internet connection to load public registry results." : "No marketplace snapshot yet. Start the API and refresh to load public registry results."}</p> : <ul className="space-y-3">{entries.map((entry) => <li key={`${entry.topic}-${entry.id}`} className="rounded border bg-white/90 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold"><a href={entry.registryUrl} target="_blank" rel="noreferrer" className="hover:underline">{entry.name}</a></h3><p className="mt-1 text-xs text-[var(--athanor-slate)]">npm · {entry.version} · License: {entry.license ?? "not reported"}</p><p className="mt-1 text-sm">{entry.description || "No description supplied by registry."}</p></div><div className="text-right text-xs"><p>90-day downloads: {entry.downloads90d?.toLocaleString() ?? "unavailable"}</p><p>Rating: {entry.rating ?? "not published"}</p><p>Risk-adjusted rank: {entry.score === null ? "unavailable" : `${Math.round(entry.score * 100)}/100`}</p><p>Metrics used: {entry.scoreCompleteness.join(", ") || "none"}</p></div></div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs"><a href={entry.repositoryUrl ?? entry.registryUrl} target="_blank" rel="noreferrer" className="text-[var(--athanor-ember)] hover:underline">Source / registry</a><span>Checked {new Date(entry.checkedAt).toLocaleString()}</span><span>{entry.securityStatus === "checked" ? "OSV checked for this version" : "CVE status unavailable"}</span></div>
          {entry.advisories.length > 0 && <ul className="mt-3 space-y-2">{entry.advisories.map((advisory) => <li key={advisory.id} className="rounded border border-red-200 bg-red-50 p-3 text-xs"><a href={advisory.url} target="_blank" rel="noreferrer" className="font-semibold text-red-800 hover:underline">{advisory.aliases[0] ?? advisory.id}</a>{advisory.severity && <span className="ml-2 uppercase">{advisory.severity}</span>}<p className="mt-1">{advisory.summary || "Advisory summary not available."}</p><p className="mt-1">Affected range: {advisory.affectedRange ?? "see advisory"} · Fixed: {advisory.fixedVersions.join(", ") || "not listed"}</p></li>)}</ul>}
        </li>)}</ul>}
      </section>
    </div>
  </main>;
}
