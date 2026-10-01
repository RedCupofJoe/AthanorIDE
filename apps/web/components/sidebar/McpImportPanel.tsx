"use client";
import { useRef, useState } from "react";
import { OFFICIAL_MCP_REGISTRY, parseMcpImport, searchMcpRegistry, type McpCandidate } from "@/lib/mcp-import";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const search = async (next?: string) => {
    setLoading(true); setError(""); setStatus("");
    try { const page = await searchMcpRegistry(registry, query, next); setItems(page.items); setCursor(page.nextCursor); setStatus(page.items.length ? `${page.items.length} server variants` : "No supported servers on this page."); }
    catch (e) { setError(`${e instanceof Error ? e.message : "Could not reach registry."} If this registry blocks browser access, paste or upload its server.json below.`); }
    finally { setLoading(false); }
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
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); void search(); }}>
        <label className="block text-xs">Registry URL<input aria-label="Registry URL" className={inputClass} value={registry} onChange={e => { setRegistry(e.target.value); setCursor(undefined); }} /></label>
        <div className="flex gap-2"><input aria-label="Search MCP servers" className={inputClass} value={query} onChange={e => { setQuery(e.target.value); setCursor(undefined); }} placeholder="Search servers by name…" /><button disabled={loading} className="rounded bg-[var(--athanor-ember)] px-4 text-sm text-white disabled:opacity-50">{loading ? "Searching…" : "Search"}</button></div>
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
        <p className="my-2 text-sm">{item.description}</p><p className="break-all font-mono text-xs">{String(item.template.node.configuration.endpoint || item.template.node.configuration.packageSpec || item.template.node.configuration.command)}</p>
        <ul className="mt-2 list-inside list-disc text-xs text-[var(--athanor-slate)]">{item.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      </li>)}</ul>
      {cursor && <button type="button" disabled={loading} className="mt-3 rounded border px-3 py-1 text-sm" onClick={() => void search(cursor)}>Next page</button>}
      <p className="mt-3 text-xs text-[var(--athanor-slate)]">Import reads metadata only. Configure allowed tools and environment names in the inspector. Export to build and run in a sandbox.</p>
    </section>
  </div>;
}
