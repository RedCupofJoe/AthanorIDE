"use client";

import { useRef, useState } from "react";
import { parseSchemaImport, type ImportedTool } from "@/lib/schema-import";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";

export function SchemaImportPanel({ onClose }: { onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const [items, setItems] = useState<ImportedTool[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parse = (content: string, name?: string) => {
    try { setItems(parseSchemaImport(content, name)); setError(""); }
    catch (reason) { setItems([]); setError(reason instanceof Error ? reason.message : "Could not parse schema."); }
  };
  const add = (tool: ImportedTool) => {
    const schemaOnly = tool.sourceKind !== "openapi";
    const type = schemaOnly ? "multi_agent.tool_definition" : "agent.tool";
    const id = useProjectStore.getState().addNode(type, { x: 100 + Math.random() * 100, y: 100 + Math.random() * 100 });
    useProjectStore.getState().updateNodeConfiguration(id, {
      toolName: tool.name,
      description: tool.description,
      ...(schemaOnly ? {} : { endpoint: tool.endpoint, method: tool.method }),
      inputSchema: JSON.stringify(tool.inputSchema, null, 2),
      importedFrom: { kind: tool.sourceKind, version: tool.sourceVersion ?? "unknown" },
    });
    useSelectionStore.getState().focusNode(id);
  };
  const inputClass = "w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5 text-sm";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-5" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Import tool schemas" className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-lg border bg-[var(--athanor-paper)] p-5 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Import API and tool schemas</h2><button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Close</button></div>
      <p className="my-2 text-sm text-[var(--athanor-slate)]">Paste or upload OpenAPI JSON, a JSON Schema, or an MCP tools/list result. Athanor reads schemas only; it does not connect, install packages, or call a model. Review each generated block and configure its runtime before use.</p>
      <textarea aria-label="API or tool schema JSON" className={`${inputClass} font-mono`} rows={8} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder='{"openapi":"3.1.0","paths":{...}}' />
      <div className="my-2 flex gap-2"><button type="button" onClick={() => parse(raw)} className="rounded border px-3 py-1.5 text-sm">Review schemas</button><button type="button" onClick={() => fileRef.current?.click()} className="rounded border px-3 py-1.5 text-sm">Upload JSON</button><input ref={fileRef} type="file" accept=".json,application/json" className="hidden" aria-label="Upload schema file" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { if (file.size > 2_000_000) setError("Schema file exceeds 2 MB."); else { const text = await file.text(); setRaw(text); parse(text, file.name); } } event.target.value = ""; }} /></div>
      {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">{items.map((item, index) => <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 rounded border bg-white p-3"><div><strong className="text-sm">{item.name}</strong><p className="text-xs text-[var(--athanor-slate)]">{item.method} {item.endpoint || "Schema only; no endpoint will be called"} · {item.sourceKind} {item.sourceVersion ?? ""}</p><p className="mt-1 text-xs">{item.description}</p></div><button type="button" onClick={() => add(item)} className="shrink-0 rounded border border-[var(--athanor-ember)] px-3 py-1 text-xs text-[var(--athanor-ember)]">Add block</button></li>)}</ul>
    </section>
  </div>;
}
