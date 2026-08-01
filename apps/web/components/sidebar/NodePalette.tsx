"use client";

/**
 * Left sidebar node library with two-click add, docs, and compact mode.
 */
import { useState } from "react";
import { listNodeDefinitions } from "@athanor/node-definitions";
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
  foundation: "Foundation",
  "fine-tuning": "Fine-tuning",
  vision: "Vision",
  "multi-agent": "Multi-agent",
  enterprise: "Enterprise",
  "big-blocks": "Big Blocks",
};

export function NodePalette() {
  const addNode = useProjectStore((state) => state.addNode);
  const focusNode = useSelectionStore((state) => state.focusNode);
  const compact = useUiPreferencesStore((state) => state.paletteCompact);
  const toggleCompact = useUiPreferencesStore((state) => state.togglePaletteCompact);
  const [pendingType, setPendingType] = useState<string | null>(null);
  /** Types whose descriptions are expanded (max 3). Empty = all collapsed (default). */
  const [expandedDescriptions, setExpandedDescriptions] = useState<readonly string[]>(
    () => [],
  );
  const definitions = listNodeDefinitions();

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
        "flex h-full flex-col gap-3 border-r border-[var(--athanor-mist)] bg-white/80 p-4",
        compact ? "w-56" : "w-80",
      )}
      aria-label="Node palette"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Node library</h2>
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

      <div className="space-y-4 overflow-auto">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--athanor-slate)]">
              {CATEGORY_LABELS[category] ?? category}
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
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          placeNode(definition.type);
                        }}
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
