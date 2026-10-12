"use client";
import { useEffect, useRef, useState } from "react";
import { OFFICIAL_MCP_REGISTRY, parseMcpImport, searchMcpRegistry, type McpCandidate } from "@/lib/mcp-import";
import { candidateSearchText, cosineSimilarity, loadMcpCandidates, loadMcpVectors, saveMcpCandidates, saveMcpVectors, searchMcpCandidates } from "@/lib/mcp-registry-search";
import { embedMcpSearchTexts, loadSemanticModel, unloadSemanticModel } from "@/lib/mcp-semantic-search";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";

export function McpImportPanel({ onClose }: { onClose: () => void }) {
  const [registry, setRegistry] = useState(OFFICIAL_MCP_REGISTRY);
  const [query, setQuery] = useState("");
  const [raw, setRaw] = useState("");
  const [items, setItems] = useState<McpCandidate[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("keyword");
  const [cachedItems, setCachedItems] = useState<McpCandidate[]>([]);
  const [semanticModelLoaded, setSemanticModelLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    void loadMcpCandidates().then((saved) => {
      if (!active) return;
      setCachedItems(saved);
      setItems(saved);
      setStatus(saved.length ? `${saved.length} servers available in the local registry cache.` : "Search online to create a local registry cache. Keyword search works offline afterward.");
    });
    return () => { active = false; unloadSemanticModel(); };
  }, []);

  const search = async (next?: string) => {
    setLoading(true); setError(""); setStatus("");
    try {
      const page = await searchMcpRegistry(registry, query, next);
      await saveMcpCandidates(page.items);
      const saved = await loadMcpCandidates();
      setCachedItems(saved); setItems(page.items); setCursor(page.nextCursor);
      setStatus(page.items.length ? `${page.items.length} server variants fetched. ${saved.length} variants are now cached locally.` : "No supported servers on this page.");
    }
    catch (e) { setError(`${e instanceof Error ? e.message : "Could not reach registry."} If this registry blocks browser access, paste or upload its server.json below.`); }
    finally { setLoading(false); }
  };

  const searchCached = async () => {
    setError(""); setCursor(undefined);
    const saved = await loadMcpCandidates();
    setCachedItems(saved);
    if (searchMode === "keyword") {
      const matches = searchMcpCandidates(saved, query);
      setItems(matches); setStatus(`${matches.length} local keyword/topic matches${saved.length ? ` from ${saved.length} cached servers` : ""}.`);
      return;
    }
    if (!saved.length) { setItems([]); setStatus("No local servers are cached yet. Search online once to create a cache for offline semantic search."); return; }

    setLoading(true); setStatus("Starting local semantic search…");
    try {
      await loadSemanticModel(setStatus);
      setSemanticModelLoaded(true);
      const vectors = await loadMcpVectors(saved.map((candidate) => candidate.id));
      const missing = saved.filter((candidate) => !vectors.has(candidate.id));
      for (let start = 0; start < missing.length; start += 32) {
        const batch = missing.slice(start, start + 32);
        const generated = await embedMcpSearchTexts(batch.map(candidateSearchText), setStatus);
        batch.forEach((candidate, index) => {
          const vector = generated[index];
          if (vector) vectors.set(candidate.id, vector);
        });
      }
      await saveMcpVectors(vectors);
      const [queryVector] = await embedMcpSearchTexts([query || "MCP server tools and integrations"], setStatus);
      if (!queryVector) throw new Error("The local model did not return a query embedding.");
      const matches = saved.map((candidate) => ({ candidate, score: cosineSimilarity(queryVector, vectors.get(candidate.id) ?? []) }))
        .filter((item) => item.score >= 0.15)
        .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name))
        .slice(0, 40).map((item) => item.candidate);
      setItems(matches); setStatus(`${matches.length} semantic matches, ranked locally from ${saved.length} cached servers. Model and vectors are cached in this browser.`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Local semantic search failed."} CPU keyword search remains available.`);
    } finally { setLoading(false); }
  };
  const parse = (value: string) => {
    setError(""); setCursor(undefined);
    try { const next = parseMcpImport(value); setItems(next); setStatus(`${next.length} server variants ready to review`); }
    catch (e) { setError(e instanceof Error ? e.message : "Invalid manifest."); }
  };
  const inputClass = "w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5 text-sm";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, summary, select') ?? [])].filter(el => el.getClientRects().length > 0);
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      } }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Import MCP servers" className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-lg border border-[var(--athanor-mist)] bg-[var(--athanor-paper)] p-5 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Import MCP servers</h2><button autoFocus type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Close</button></div>
      <p className="my-2 text-sm text-[var(--athanor-slate)]">Discover servers in the official MCP Registry from the AAIF ecosystem, use a compatible registry, or import a server configuration. Listings are published by their providers.</p>
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); void searchCached(); }}>
        <label className="block text-xs">Registry URL<input aria-label="Registry URL" className={inputClass} value={registry} onChange={e => { setRegistry(e.target.value); setCursor(undefined); }} /></label>
        <label className="block text-xs">Search mode
          <select aria-label="MCP search mode" className={`${inputClass} mt-1`} value={searchMode} onChange={e => setSearchMode(e.target.value as "keyword" | "semantic")}>
            <option value="keyword">Keywords and topics · CPU only · offline</option>
            <option value="semantic">Semantic · local model · CPU</option>
          </select>
        </label>
        <div className="flex gap-2"><input aria-label="Search MCP servers" className={inputClass} value={query} onChange={e => { setQuery(e.target.value); setCursor(undefined); }} placeholder={searchMode === "keyword" ? "Search names, descriptions, or topic:database…" : "Describe what you want a server to do…"} /><button disabled={loading} className="rounded bg-[var(--athanor-ember)] px-4 text-sm text-white disabled:opacity-50">{loading ? "Searching…" : searchMode === "keyword" ? "Search local cache" : "Search semantically"}</button></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={loading} onClick={() => { setCursor(undefined); void search(); }} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50">{loading ? "Working…" : "Search registry online"}</button>
          {semanticModelLoaded && <button type="button" disabled={loading} onClick={() => { unloadSemanticModel(); setSemanticModelLoaded(false); setStatus("Semantic model released from memory. Cached files and vectors remain available locally."); }} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50">Release model from memory</button>}
          <span className="text-xs text-[var(--athanor-slate)]">{cachedItems.length} cached server variants · {searchMode === "semantic" ? "first use downloads about 24 MB; runs in a background CPU worker" : "local topic and keyword matching"}</span>
        </div>
      </form>
      <details className="my-3 rounded border p-3"><summary className="cursor-pointer text-sm">Import server.json or mcpServers configuration</summary>
        <textarea aria-label="MCP manifest JSON" className={`${inputClass} my-2 font-mono`} rows={5} value={raw} onChange={e => setRaw(e.target.value)} placeholder='{"mcpServers":{"my-tools":{"url":"https://example.com/mcp"}}}' />
        <div className="flex gap-2"><button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => parse(raw)}>Review JSON</button><button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => fileRef.current?.click()}>Upload JSON</button></div>
        <input ref={fileRef} aria-label="MCP manifest file" type="file" accept=".json,application/json" className="hidden" onChange={async e => { const file = e.target.files?.[0]; if (file) { if (file.size > 2_000_000) setError("Manifest exceeds 2 MB."); else try { parse(await file.text()); } catch { setError("Could not read the manifest."); } } e.target.value = ""; }} />
      </details>
      {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
      <p role="status" className="my-2 text-xs text-[var(--athanor-slate)]">{status}</p>
      <ul className="space-y-3">{items.map(item => <li key={item.id} className="rounded border bg-white p-3">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{item.name}</h3><p className="text-xs text-[var(--athanor-slate)]">{item.transport} · {String(item.template.node.metadata?.serverVersion || "custom")}</p></div><button type="button" className="shrink-0 rounded border border-[var(--athanor-ember)] px-3 py-1 text-xs text-[var(--athanor-ember)]" onClick={() => { const id = useProjectStore.getState().addTemplate(item.template); useSelectionStore.getState().focusNode(id); onClose(); }}>Add to canvas</button></div>
        <p className="my-2 text-sm">{item.description}</p><p className="mb-2 flex flex-wrap gap-1" aria-label="Server topics">{item.topics.map(topic => <span key={topic} className="rounded-full bg-[var(--athanor-paper)] px-2 py-0.5 text-[10px] text-[var(--athanor-slate)]">{topic}</span>)}</p><p className="break-all font-mono text-xs">{String(item.template.node.configuration.endpoint || item.template.node.configuration.packageSpec || item.template.node.configuration.command)}</p>
        <ul className="mt-2 list-inside list-disc text-xs text-[var(--athanor-slate)]">{item.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      </li>)}</ul>
      {cursor && <button type="button" disabled={loading} className="mt-3 rounded border px-3 py-1 text-sm" onClick={() => void search(cursor)}>Next online page</button>}
      <p className="mt-3 text-xs text-[var(--athanor-slate)]">Import reads metadata only. Configure allowed tools and environment names in the inspector. Export to build and run in a sandbox.</p>
    </section>
  </div>;
}
