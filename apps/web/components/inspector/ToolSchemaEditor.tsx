"use client";
import { useState } from "react";

type Property = { type?: string; description?: string; [key: string]: unknown };
type Schema = { type?: string; properties?: Record<string, Property>; required?: string[]; [key: string]: unknown };

/** A small field builder preserves advanced schemas via the JSON editor. */
export function ToolSchemaEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draftName, setDraftName] = useState("");
  let schema: Schema | null = null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) schema = parsed as Schema;
  } catch { /* Keep malformed text editable. */ }
  const properties = schema?.properties;
  const simple = schema?.type === "object" && (schema.required === undefined || (Array.isArray(schema.required) && schema.required.every(n => typeof n === "string"))) && (!properties || (typeof properties === "object" && !Array.isArray(properties) && Object.values(properties).every(p => p && typeof p === "object" && !Array.isArray(p))));
  const update = (next: Schema) => onChange(JSON.stringify(next, null, 2));
  const inputClass = "w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1 text-xs";
  return <div className="space-y-2 rounded border border-[var(--athanor-mist)] p-2">
    {simple && schema && <>
      {Object.entries(properties ?? {}).map(([name, property]) => <div key={name} className="space-y-1 border-b border-[var(--athanor-mist)] pb-2">
        <div className="flex items-center justify-between"><span className="font-medium text-xs">{name}</span>
          <button type="button" className="text-xs text-red-700" onClick={() => { const next = { ...properties }; delete next[name]; update({ ...schema, properties: next, required: (schema?.required ?? []).filter(n => n !== name) }); }}>Remove</button></div>
        <select aria-label={`${name} type`} className={inputClass} value={property.type ?? "string"} onChange={e => update({ ...schema, properties: { ...properties, [name]: { ...property, type: e.target.value } } })}>
          {["string", "number", "integer", "boolean", "object", "array"].map(t => <option key={t}>{t}</option>)}
        </select>
        <input aria-label={`${name} description`} placeholder="Describe this argument" className={inputClass} value={property.description ?? ""} onChange={e => update({ ...schema, properties: { ...properties, [name]: { ...property, description: e.target.value } } })} />
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={(schema.required ?? []).includes(name)} onChange={e => update({ ...schema, required: e.target.checked ? [...new Set([...(schema?.required ?? []), name])] : (schema?.required ?? []).filter(n => n !== name) })} />Required</label>
      </div>)}
      <div className="flex gap-2"><input aria-label="New argument name" placeholder="Argument name" className={inputClass} value={draftName} onChange={e => setDraftName(e.target.value)} />
        <button type="button" className="text-xs underline disabled:opacity-40" disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(draftName) || Object.hasOwn(properties ?? {}, draftName) || ["__proto__", "constructor", "prototype"].includes(draftName)} onClick={() => { update({ ...schema, properties: { ...properties, [draftName]: { type: "string" } } }); setDraftName(""); }}>Add</button></div>
    </>}
    {!schema && <p role="alert" className="text-xs text-red-700">Invalid JSON. Correct the schema below.</p>}
    <details open={!simple}><summary className="cursor-pointer text-xs">JSON Schema · advanced</summary>
      <textarea aria-label="Tool input JSON Schema" rows={7} className={`${inputClass} mt-2 font-mono`} value={value} onChange={e => onChange(e.target.value)} />
    </details>
  </div>;
}
