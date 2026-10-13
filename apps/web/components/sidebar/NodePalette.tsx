"use client";

/**
 * Left sidebar node library with two-click add, docs, and compact mode.
 */
import { useEffect, useRef, useState } from "react";
import { listNodeDefinitions, isAgentStudioType } from "@athanor/node-definitions";
import {
  AudioLines,
  Bot,
  Braces,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Code2,
  Cpu,
  Database,
  Eye,
  Fingerprint,
  GitFork,
  Globe,
  HardDrive,
  Headphones,
  Image,
  Images,
  KeyRound,
  Layers,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquare,
  Mic,
  Network,
  Scan,
  ScanEye,
  ScrollText,
  Server,
  Shield,
  Sparkles,
  Type,
  Variable,
  Video,
  WandSparkles,
  Wrench,
  BadgeCheck,
  FileText,
  Cylinder,
  Boxes,
} from "lucide-react";

import { McpImportPanel } from "./McpImportPanel";
import { SchemaImportPanel } from "./SchemaImportPanel";
import { useBlockTemplateStore } from "@/store/block-template-store";
import { serializeBlockTemplates } from "@/lib/block-templates";
import { cn } from "@/lib/cn";
import { useProjectStore } from "@/store/project-store";
import { useSelectionStore } from "@/store/selection-store";
import { useUiPreferencesStore } from "@/store/ui-preferences-store";

const ICONS = {
  type: Type,
  "code-2": Code2,
  eye: Eye,
  "log-in": LogIn,
  "log-out": LogOut,
  braces: Braces,
  "message-square": MessageSquare,
  globe: Globe,
  variable: Variable,
  "key-round": KeyRound,
  database: Database,
  sparkles: Sparkles,
  image: Image,
  scan: Scan,
  "scan-eye": ScanEye,
  bot: Bot,
  wrench: Wrench,
  server: Server,
  shield: Shield,
  "scroll-text": ScrollText,
  fingerprint: Fingerprint,
  "badge-check": BadgeCheck,
  network: Network,
  "git-fork": GitFork,
  "wand-sparkles": WandSparkles,
  "hard-drive": HardDrive,
  "message-circle": MessageCircle,
  images: Images,
  cpu: Cpu,
  mic: Mic,
  "audio-lines": AudioLines,
  video: Video,
  headphones: Headphones,
  layers: Layers,
  clapperboard: Clapperboard,
  "file-text": FileText,
  cylinder: Cylinder,
  boxes: Boxes,
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  agents: "Agents & API tools",
  harnesses: "Harnesses",
  sandboxes: "Sandboxes",
  mcp: "MCP servers",
  foundation: "Inputs & wiring",
  "fine-tuning": "Fine-tuning",
  vision: "Vision",
  "multi-agent": "Multi-agent",
  enterprise: "Enterprise",
  "big-blocks": "Big Blocks",
};

export function NodePalette() {
  const [importMcp, setImportMcp] = useState(false);
  const [query, setQuery] = useState("");
  const [importSchemas, setImportSchemas] = useState(false);
  const templateFile = useRef<HTMLInputElement>(null);
  const templates = useBlockTemplateStore(state => state.templates);
  const templateError = useBlockTemplateStore(state => state.error);
  const hydrateTemplates = useBlockTemplateStore(state => state.hydrate);
  const importTemplates = useBlockTemplateStore(state => state.importJson);
  const removeTemplate = useBlockTemplateStore(state => state.remove);
  const addTemplate = useProjectStore(state => state.addTemplate);
  useEffect(() => { hydrateTemplates(); }, [hydrateTemplates]);
  const addNode = useProjectStore((state) => state.addNode);
  const focusNode = useSelectionStore((state) => state.focusNode);
  const compact = useUiPreferencesStore((state) => state.paletteCompact);
  const toggleCompact = useUiPreferencesStore((state) => state.togglePaletteCompact);
  const [pendingType, setPendingType] = useState<string | null>(null);
  /** Types whose descriptions are expanded (max 3). Empty = all collapsed (default). */
  const [expandedDescriptions, setExpandedDescriptions] = useState<readonly string[]>(
    () => [],
  );
  const definitions = listNodeDefinitions().filter(definition =>
    isAgentStudioType(definition.type) &&
    `${definition.displayName} ${definition.description}`.toLowerCase().includes(query.toLowerCase()),
  );

  const alternativeCount = (category: "harnesses" | "sandboxes") =>
    listNodeDefinitions().filter(
      definition =>
        isAgentStudioType(definition.type) &&
        definition.category === category &&
        definition.type !== "sandbox.policy",
    ).length;

  const grouped = definitions.reduce<Record<string, Array<(typeof definitions)[number]>>>(
    (acc, definition) => {
      const list = acc[definition.category] ?? [];
      list.push(definition);
      acc[definition.category] = list;
      return acc;
    },
    {},
  );

  const placeNode = (type: string) => {
    const id = addNode(type, {
      x: 80 + Math.random() * 80,
      y: 80 + Math.random() * 120,
    });
    focusNode(id);
    setPendingType(null);
  };

  const onPaletteClick = (type: string) => {
    if (pendingType === type) {
      placeNode(type);
      return;
    }
    setPendingType(type);
  };

  const toggleDescription = (type: string) => {
    setExpandedDescriptions((prev) => {
      if (prev.includes(type)) {
        return prev.filter((item) => item !== type);
      }
      const next = [...prev, type];
      // Keep at most 3 open; drop the oldest expansion when adding a fourth.
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col gap-3 border-r border-[var(--athanor-mist)] bg-white/80 p-4",
        compact ? "w-56" : "w-80",
      )}
      aria-label="Node palette"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Agent block library</h2>
            <p className="mt-1 text-xs text-[var(--athanor-slate)]">
              {compact
                ? "Names only — for proficient users. Click twice to place."
                : "Descriptions collapsed by default. Expand with the chevron (max 3 open). Click twice to place."}
            </p>
          </div>
          <button
            type="button"
            className={cn(
              "shrink-0 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              compact
                ? "border-[var(--athanor-ember)] bg-orange-50 text-[var(--athanor-ember)]"
                : "border-[var(--athanor-mist)] text-[var(--athanor-slate)]",
            )}
            aria-pressed={compact}
            onClick={toggleCompact}
            title={
              compact
                ? "Show full two-paragraph guides"
                : "Compact mode for proficient users (names only)"
            }
          >
            {compact ? "Compact" : "Full"}
          </button>
        </div>
        {pendingType && (
          <p className="rounded border border-dashed border-[var(--athanor-ember)] bg-orange-50/70 px-2 py-1 text-[11px] text-[var(--athanor-ember)]">
            Selected — click again to place on canvas
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setPendingType(null)}
            >
              Cancel
            </button>
          </p>
        )}
      </div>

      <button type="button" className="rounded border border-[var(--athanor-ember)] bg-orange-50 px-3 py-2 text-sm text-[var(--athanor-ember)]" onClick={() => setImportMcp(true)}>Import MCP servers</button>
      {importMcp && <McpImportPanel onClose={() => setImportMcp(false)} />}
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setImportSchemas(true)}>Import OpenAPI / JSON Schema</button>
      {importSchemas && <SchemaImportPanel onClose={() => setImportSchemas(false)} />}
      <input aria-label="Search blocks" placeholder="Search blocks…" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5 text-sm" />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--athanor-slate)]">My blocks</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" className="rounded border px-2 py-1" onClick={() => placeNode("agent.custom_tool")}>+ Custom API block</button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => templateFile.current?.click()}>Import templates</button>
            <button type="button" disabled={!templates.length} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => {
              const url = URL.createObjectURL(new Blob([serializeBlockTemplates(templates)], { type: "application/json" }));
              const a = document.createElement("a"); a.href = url; a.download = "athanor-blocks.json"; a.click(); URL.revokeObjectURL(url);
            }}>Export templates</button>
          </div>
          <input ref={templateFile} type="file" accept=".json,application/json" className="hidden" aria-label="Import block templates" onChange={async event => {
            const file = event.target.files?.[0];
            if (file) { try { importTemplates(await file.text()); } catch { useBlockTemplateStore.setState({ error: "Could not read this template file." }); } }
            event.target.value = "";
          }} />
          {templateError && <p role="alert" className="text-xs text-red-700">{templateError}</p>}
          {!templates.length && <p className="text-xs text-[var(--athanor-slate)]">Configure a block, apply changes, then save it as a template in the inspector.</p>}
          {templates.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).map(template => <div key={template.id} className="flex items-center gap-2 rounded border border-[var(--athanor-mist)] bg-white p-2 text-xs">
            <button type="button" className="flex-1 text-left font-medium" onClick={() => focusNode(addTemplate(template))}>{template.name}</button>
            <button type="button" aria-label={`Remove ${template.name} template`} className="text-red-700" onClick={() => removeTemplate(template.id)}>×</button>
          </div>)}
        </section>
        {!definitions.length && <p className="text-xs text-[var(--athanor-slate)]">No matching blocks.</p>}
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--athanor-slate)]">
              {category === "harnesses" || category === "sandboxes"
                ? `${CATEGORY_LABELS[category]} · ${alternativeCount(category)} alternatives`
                : (CATEGORY_LABELS[category] ?? category)}
            </h3>
            <ul className={cn("space-y-2", compact && "space-y-1.5")}>
              {items.map((definition) => {
                const Icon = ICONS[definition.icon as keyof typeof ICONS] ?? Type;
                const selected = pendingType === definition.type;
                const docsId = `palette-docs-${definition.type.replace(/\./g, "-")}`;
                const descriptionExpanded =
                  !compact && expandedDescriptions.includes(definition.type);
                return (
                  <li key={definition.type}>
                    <div
                      className={cn(
                        "flex w-full items-start gap-1 rounded border bg-white transition-colors",
                        compact ? "px-1.5 py-1.5" : "px-2 py-2",
                        selected
                          ? "border-[var(--athanor-ember)] ring-2 ring-orange-200"
                          : "border-[var(--athanor-mist)] hover:border-[var(--athanor-ember)]",
                      )}
                    >
                      {!compact && (
                        <button
                          type="button"
                          className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--athanor-slate)] hover:bg-stone-100 hover:text-[var(--athanor-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--athanor-ember)]"
                          aria-expanded={descriptionExpanded}
                          aria-controls={docsId}
                          title={
                            descriptionExpanded
                              ? "Collapse description"
                              : "Expand description"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleDescription(definition.type);
                          }}
                        >
                          {descriptionExpanded ? (
                            <ChevronDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronRight className="size-3.5" aria-hidden />
                          )}
                          <span className="sr-only">
                            {descriptionExpanded
                              ? `Collapse ${definition.displayName} description`
                              : `Expand ${definition.displayName} description`}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "flex min-w-0 flex-1 items-start gap-2 text-left",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athanor-ember)]",
                        )}
                        onClick={() => onPaletteClick(definition.type)}
                      >
                        <Icon
                          className={cn(
                            "shrink-0 text-[var(--athanor-ember)]",
                            compact ? "mt-0.5 size-3.5" : "mt-0.5 size-4",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block font-medium",
                              compact ? "text-xs" : "text-sm",
                            )}
                          >
                            {definition.displayName}
                          </span>
                          {descriptionExpanded && (
                            <span id={docsId} className="mt-1 block">
                              <span className="block text-xs leading-relaxed text-[var(--athanor-slate)]">
                                {definition.description}
                              </span>
                              <span className="mt-2 block text-[11px] leading-relaxed text-[var(--athanor-slate)]/90">
                                {definition.documentation}
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
