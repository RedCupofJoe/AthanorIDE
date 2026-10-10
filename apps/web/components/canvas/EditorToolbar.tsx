"use client";

/**
 * Editor chrome: project name, validate/run/export, undo, search, deploy toggles.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Boxes,
  Download,
  FolderOpen,
  KeyRound,
  Map,
  Package,
  Play,
  Redo2,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Undo2,
} from "lucide-react";

import { executeProject } from "@/lib/execute";
import { downloadExportZip, exportProject, type ExportOptions } from "@/lib/export";
import { downloadGraphJson, importGraphJson } from "@/lib/persistence";
import { importProjectIntoLibrary } from "@/lib/project-library";
import { validateProject } from "@/lib/validate";
import {
  selectCanRedo,
  selectCanUndo,
  useProjectStore,
} from "@/store/project-store";
import { useExecutionStore } from "@/store/execution-store";
import { useSelectionStore } from "@/store/selection-store";
import { useValidationStore } from "@/store/validation-store";

type EditorToolbarProps = {
  onOpenInfrastructureTokens?: () => void;
  onOpenLocalVault?: () => void;
};

export function EditorToolbar({
  onOpenInfrastructureTokens,
  onOpenLocalVault,
}: EditorToolbarProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<NonNullable<ExportOptions["exportFormat"]>>("code");
  const [searchQuery, setSearchQuery] = useState("");
  const graph = useProjectStore((state) => state.graph);
  const setProjectName = useProjectStore((state) => state.setProjectName);
  const setExportConfiguration = useProjectStore((state) => state.setExportConfiguration);
  const replaceGraph = useProjectStore((state) => state.replaceGraph);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const markSaved = useProjectStore((state) => state.markSaved);
  const collapseSelectionToMacro = useProjectStore(
    (state) => state.collapseSelectionToMacro,
  );
  const addSwimlane = useProjectStore((state) => state.addSwimlane);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);
  const setRunning = useValidationStore((state) => state.setRunning);
  const setResult = useValidationStore((state) => state.setResult);
  const setError = useValidationStore((state) => state.setError);
  const setExecRunning = useExecutionStore((state) => state.setRunning);
  const setExecResult = useExecutionStore((state) => state.setResult);
  const setExecError = useExecutionStore((state) => state.setError);
  const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
  const focusNode = useSelectionStore((state) => state.focusNode);

  const selectableNodeIds = useMemo(
    () =>
      selectedNodeIds.filter(
        (id) => !id.startsWith("macro:") && !id.startsWith("swimlane:"),
      ),
    [selectedNodeIds],
  );

  const searchHits = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return graph.nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query) ||
        String(node.configuration.busId ?? "")
          .toLowerCase()
          .includes(query),
    );
  }, [graph.nodes, searchQuery]);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-[var(--athanor-mist)] bg-white/90 px-4 py-3">
      <Link
        href="/"
        className="rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-xs font-medium text-[var(--athanor-slate)] hover:border-[var(--athanor-ember)] hover:text-[var(--athanor-ember)]"
      >
        Projects
      </Link>
      <div className="min-w-[12rem] flex-1">
        <label className="sr-only" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          className="w-full rounded border border-transparent bg-transparent px-1 text-lg font-semibold outline-none hover:border-[var(--athanor-mist)] focus:border-[var(--athanor-ember)]"
          style={{ fontFamily: "var(--font-display)" }}
          value={graph.project.name}
          onChange={(event) => setProjectName(event.target.value)}
        />
        <p className="text-xs text-[var(--athanor-slate)]">
          AthanorIDE · schema {graph.schemaVersion} · autosaves locally
        </p>
      </div>

      <div className="relative min-w-[14rem]">
        <label className="sr-only" htmlFor="graph-search">
          Search graph
        </label>
        <div className="flex items-center gap-1 rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5">
          <Search className="size-4 text-[var(--athanor-slate)]" aria-hidden />
          <input
            id="graph-search"
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Search nodes…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchHits[0]) {
                focusNode(searchHits[0].id);
              }
            }}
          />
        </div>
        {searchQuery.trim() && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-[var(--athanor-mist)] bg-white text-sm shadow">
            {searchHits.length === 0 ? (
              <li className="px-3 py-2 text-[var(--athanor-slate)]">No matches</li>
            ) : (
              searchHits.slice(0, 8).map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--athanor-mist)]/50"
                    onClick={() => {
                      focusNode(node.id);
                      setSearchQuery("");
                    }}
                  >
                    <span className="block font-medium">{node.name}</span>
                    <span className="block text-xs text-[var(--athanor-slate)]">
                      {node.type}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm disabled:opacity-40"
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label="Undo"
        >
          <Undo2 className="size-4" /> Undo
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm disabled:opacity-40"
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label="Redo"
        >
          <Redo2 className="size-4" /> Redo
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm disabled:opacity-40"
          disabled={selectableNodeIds.length < 2}
          onClick={() => {
            const macroId = collapseSelectionToMacro(selectableNodeIds);
            if (macroId) {
              useSelectionStore.getState().clearSelection();
            }
          }}
        >
          <Boxes className="size-4" /> Collapse macro
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm"
          onClick={() => addSwimlane("LOCAL_WORKSTATION")}
        >
          <Map className="size-4" /> Add swimlane
        </button>
        <fieldset className="flex flex-wrap items-center gap-2 rounded border border-[var(--athanor-mist)] px-2 py-1 text-xs">
          <legend className="sr-only">Export deployment targets</legend>
          <span
            className="text-[10px] text-[var(--athanor-slate)]"
            title="Podman Containerfile and deploy/podman/ are always included"
          >
            Podman always
          </span>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={Boolean(graph.exportConfiguration?.includeKubernetes)}
              onChange={(event) =>
                setExportConfiguration({ includeKubernetes: event.target.checked })
              }
            />
            K8s
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={Boolean(graph.exportConfiguration?.includeOpenShift)}
              onChange={(event) =>
                setExportConfiguration({
                  includeOpenShift: event.target.checked,
                  includeKubernetes: event.target.checked
                    ? true
                    : graph.exportConfiguration?.includeKubernetes,
                })
              }
            />
            OKD
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={Boolean(graph.exportConfiguration?.includeArgoCd)}
              onChange={(event) =>
                setExportConfiguration({
                  includeArgoCd: event.target.checked,
                  includeKubernetes: event.target.checked
                    ? true
                    : graph.exportConfiguration?.includeKubernetes,
                })
              }
            />
            Argo CD
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={Boolean(graph.exportConfiguration?.includeTerraform)}
              onChange={(event) =>
                setExportConfiguration({ includeTerraform: event.target.checked })
              }
            />
            Terraform
          </label>
        </fieldset>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm"
          onClick={() => onOpenInfrastructureTokens?.()}
        >
          <KeyRound className="size-4" /> Infra tokens
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm"
          onClick={() => onOpenLocalVault?.()}
        >
          <Shield className="size-4" /> Local vault
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm"
          onClick={() => markSaved()}
        >
          <Save className="size-4" /> Save
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm"
          onClick={() => downloadGraphJson(graph)}
        >
          <Download className="size-4" /> Graph JSON
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm"
          onClick={() => fileRef.current?.click()}
        >
          <FolderOpen className="size-4" /> Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const imported = importProjectIntoLibrary(importGraphJson(text));
              replaceGraph(imported, false);
              router.push(`/editor/${imported.project.id}`);
            } catch {
              window.alert(
                "Could not import project JSON. Check the schema version and format.",
              );
            } finally {
              event.target.value = "";
            }
          }}
        />
        <label className="inline-flex items-center gap-2 text-xs">Export as
          <select aria-label="Export format" value={exportFormat} onChange={event => setExportFormat(event.target.value as NonNullable<ExportOptions["exportFormat"]>)} className="rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5 text-sm">
            <option value="code">Source code</option><option value="helm">Helm Chart</option><option value="podman">Podman container</option><option value="docker">Docker container</option><option value="openshift">OpenShift deployment</option><option value="npm">npm package</option><option value="makefile">Makefiles</option>
          </select>
        </label>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-[var(--athanor-mist)] px-2.5 py-1.5 text-sm disabled:opacity-40"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const result = await exportProject(useProjectStore.getState().graph, { exportFormat });
              downloadExportZip(result);
              setResult(true, result.validationIssues, result.durationMs);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Export failed. Validate the graph and confirm the API is running.",
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          <Package className="size-4" /> {exporting ? "Exporting…" : "Export"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded bg-[var(--athanor-ember)] px-3 py-1.5 text-sm text-white"
          onClick={async () => {
            setExecRunning();
            try {
              const result = await executeProject(useProjectStore.getState().graph);
              setExecResult({
                status: result.status,
                steps: result.steps,
                edgePayloads: result.edgePayloads,
                finalOutputs: result.finalOutputs,
                durationMs: result.durationMs,
              });
            } catch (error) {
              setExecError(
                error instanceof Error
                  ? error.message
                  : "Unable to execute. Is make dev running?",
              );
            }
          }}
        >
          <Play className="size-4" /> Run preview
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white"
          onClick={async () => {
            setRunning();
            try {
              const result = await validateProject(useProjectStore.getState().graph);
              setResult(result.valid, result.issues, result.durationMs);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Unable to reach the validation API. Is make dev running?",
              );
            }
          }}
        >
          <ShieldCheck className="size-4" /> Validate
        </button>
      </div>
    </header>
  );
}
