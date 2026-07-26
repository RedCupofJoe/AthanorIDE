"use client";

/**
 * Right sidebar: node configuration forms, compile actions, and delete initiation.
 */
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { getNodeDefinition } from "@athanor/node-definitions";

import { compileTransformation } from "@/lib/compiler";
import {
  findLinkedPortalNodes,
  isPortalNode,
  portalBusId,
} from "@/lib/portals";
import { useProjectStore } from "@/store/project-store";
import { usePendingDeleteStore } from "@/store/pending-delete-store";
import { useSelectionStore } from "@/store/selection-store";

type InspectorFormValues = {
  name: string;
  configuration: Record<string, string>;
};

export function NodeInspector() {
  const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
  const focusNode = useSelectionStore((state) => state.focusNode);
  const graph = useProjectStore((state) => state.graph);
  const nodes = graph.nodes;
  const updateNodeConfiguration = useProjectStore((state) => state.updateNodeConfiguration);
  const updateNodeName = useProjectStore((state) => state.updateNodeName);
  const updateNodeDeploymentTarget = useProjectStore(
    (state) => state.updateNodeDeploymentTarget,
  );
  const setMacroCollapsed = useProjectStore((state) => state.setMacroCollapsed);
  const requestDelete = usePendingDeleteStore((state) => state.requestDelete);
  const [compiling, setCompiling] = useState(false);
  const [compileMessage, setCompileMessage] = useState<string | null>(null);

  const realSelectedIds = selectedNodeIds.filter(
    (id) => !id.startsWith("macro:") && !id.startsWith("swimlane:"),
  );

  const node = useMemo(
    () =>
      realSelectedIds.length === 1
        ? nodes.find((item) => item.id === realSelectedIds[0])
        : undefined,
    [nodes, realSelectedIds],
  );

  const selectedMacro = useMemo(() => {
    if (selectedNodeIds.length !== 1) return undefined;
    const id = selectedNodeIds[0]!;
    if (!id.startsWith("macro:")) return undefined;
    const macroId = id.slice("macro:".length);
    return graph.macroBlocks.find((macro) => macro.id === macroId);
  }, [graph.macroBlocks, selectedNodeIds]);

  const definition = node ? getNodeDefinition(node.type) : undefined;
  const linkedPortals = node ? findLinkedPortalNodes(nodes, node.id) : [];
  const deploymentLane = node?.deploymentTarget
    ? graph.deploymentEnvironments.find((lane) => lane.id === node.deploymentTarget)
    : undefined;

  const compiledCode =
    typeof node?.configuration.compiledCode === "string"
      ? node.configuration.compiledCode
      : null;
  const compileStatus =
    typeof node?.configuration.compileStatus === "string"
      ? node.configuration.compileStatus
      : null;

  const primaryFields = useMemo(
    () => definition?.configurationFields.filter((field) => !field.advanced) ?? [],
    [definition],
  );
  const advancedFields = useMemo(
    () => definition?.configurationFields.filter((field) => field.advanced) ?? [],
    [definition],
  );

  const formValues = useMemo<InspectorFormValues>(() => {
    if (!node || !definition) {
      return { name: "", configuration: {} };
    }
    const configuration: Record<string, string> = {};
    for (const field of definition.configurationFields) {
      const value = node.configuration[field.key];
      configuration[field.key] =
        typeof value === "string" ? value : String(value ?? field.defaultValue ?? "");
    }
    return { name: node.name, configuration };
  }, [definition, node]);

  const { register, handleSubmit, reset, getValues, watch } = useForm<InspectorFormValues>({
    values: formValues,
  });

  const watchedConfiguration = watch("configuration");

  const fieldVisible = (
    field: NonNullable<typeof definition>["configurationFields"][number],
  ): boolean => {
    if (!field.showWhen) return true;
    const current = watchedConfiguration?.[field.showWhen.key] ?? "";
    const expected = field.showWhen.equals;
    return Array.isArray(expected) ? expected.includes(current) : current === expected;
  };

  useEffect(() => {
    reset(formValues);
  }, [formValues, reset]);

  const renderConfigField = (
    field: NonNullable<typeof definition>["configurationFields"][number],
  ) => {
    if (!fieldVisible(field)) return null;
    return (
    <label key={field.key} className="block space-y-1 text-sm">
      <span className="font-medium">{field.label}</span>
      <span className="block text-xs text-[var(--athanor-slate)]">{field.description}</span>
      {field.type === "text" ? (
        <textarea
          rows={5}
          className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5"
          {...register(`configuration.${field.key}`, {
            required: field.required,
          })}
        />
      ) : field.type === "select" && field.options ? (
        <select
          className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5"
          {...register(`configuration.${field.key}`, {
            required: field.required,
          })}
        >
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <select
          className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5"
          {...register(`configuration.${field.key}`, {
            required: field.required,
          })}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          step={field.type === "number" ? "any" : undefined}
          className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5"
          {...register(`configuration.${field.key}`, {
            required: field.required,
          })}
        />
      )}
      {field.recommendedDefaultExplanation && (
        <span className="block text-xs text-[var(--athanor-slate)]">
          Tip: {field.recommendedDefaultExplanation}
        </span>
      )}
    </label>
    );
  };

  if (selectedMacro) {
    return (
      <aside
        className="flex h-full flex-col gap-3 bg-white/80 p-4"
        aria-label="Node inspector"
      >
        <h2 className="text-sm font-semibold">{selectedMacro.name}</h2>
        <p className="text-sm text-[var(--athanor-slate)]">
          {selectedMacro.description ?? "Collapsed macro block"}
        </p>
        <p className="text-xs text-[var(--athanor-slate)]">
          Contains {selectedMacro.nodeIds.length} node(s) with{" "}
          {selectedMacro.inputs.length} external input(s) and{" "}
          {selectedMacro.outputs.length} external output(s).
        </p>
        <button
          type="button"
          className="rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white"
          onClick={() => setMacroCollapsed(selectedMacro.id, false)}
        >
          Expand macro
        </button>
      </aside>
    );
  }

  if (realSelectedIds.length > 1) {
    return (
      <aside
        className="flex h-full flex-col gap-3 bg-white/80 p-4"
        aria-label="Node inspector"
      >
        <h2 className="text-sm font-semibold">Inspector</h2>
        <p className="text-sm text-[var(--athanor-slate)]">
          {realSelectedIds.length} nodes selected. Use Collapse macro in the toolbar to group
          them.
        </p>
        <button
          type="button"
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
          onClick={() => requestDelete(realSelectedIds, [])}
        >
          Delete selected…
        </button>
      </aside>
    );
  }

  if (!node || !definition) {
    return (
      <aside
        className="flex h-full flex-col bg-white/80 p-4"
        aria-label="Node inspector"
      >
        <h2 className="text-sm font-semibold">Inspector</h2>
        <p className="mt-2 text-sm text-[var(--athanor-slate)]">
          Select a single node to edit its configuration. Press Delete on the canvas to remove
          nodes — confirmation appears here.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full flex-col gap-4 overflow-auto bg-white/80 p-4"
      aria-label="Node inspector"
    >
      <div>
        <h2 className="text-sm font-semibold">Inspector</h2>
        <p className="mt-1 text-xs text-[var(--athanor-slate)]">{definition.description}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) => {
          updateNodeName(node.id, values.name);
          const configuration: Record<string, unknown> = { ...values.configuration };
          for (const field of definition.configurationFields) {
            const raw = configuration[field.key];
            if (field.type === "number" && typeof raw === "string") {
              const parsed = Number(raw);
              configuration[field.key] = Number.isFinite(parsed)
                ? parsed
                : field.defaultValue;
            } else if (field.type === "boolean" && typeof raw === "string") {
              configuration[field.key] = raw === "true";
            }
          }
          updateNodeConfiguration(node.id, configuration);
        })}
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Display name</span>
          <input
            className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5"
            {...register("name", { required: true })}
          />
        </label>

        {primaryFields.map(renderConfigField)}

        {advancedFields.length > 0 && (
          <details className="rounded border border-[var(--athanor-mist)] bg-white/60 p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--athanor-ink)]">
              Advanced
            </summary>
            <div className="mt-3 space-y-4">{advancedFields.map(renderConfigField)}</div>
          </details>
        )}

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Deployment target</span>
          <span className="block text-xs text-[var(--athanor-slate)]">
            Inherited from swimlane placement; override only when needed.
          </span>
          <select
            className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2 py-1.5"
            value={node.deploymentTarget ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              updateNodeDeploymentTarget(node.id, value || undefined);
            }}
          >
            <option value="">None</option>
            {graph.deploymentEnvironments.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name} ({lane.kind})
              </option>
            ))}
          </select>
          {deploymentLane && (
            <span className="block text-xs text-[var(--athanor-slate)]">
              Active: {deploymentLane.name}
            </span>
          )}
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white"
          >
            Apply
          </button>
          <button
            type="button"
            className="rounded border border-[var(--athanor-mist)] px-3 py-1.5 text-sm"
            onClick={() => reset(formValues)}
          >
            Reset
          </button>
          {node.type === "foundation.python_transform" && (
            <button
              type="button"
              className="rounded border border-[var(--athanor-ember)] px-3 py-1.5 text-sm text-[var(--athanor-ember)] disabled:opacity-40"
              disabled={compiling}
              onClick={async () => {
                setCompiling(true);
                setCompileMessage(null);
                try {
                  const instruction =
                    getValues("configuration.instruction") ||
                    String(node.configuration.instruction ?? "");
                  updateNodeConfiguration(node.id, { instruction });
                  const result = await compileTransformation({
                    instruction,
                    provenance: [node.id],
                  });
                  updateNodeConfiguration(node.id, {
                    instruction,
                    compiledCode: result.sourceCode,
                    compileStatus: result.status,
                    compileAudit: result.audit,
                    compiledSpec: result.spec,
                  });
                  setCompileMessage(
                    result.status === "success"
                      ? `Compiled via ${result.audit.provider} (${result.durationMs.toFixed(1)} ms)`
                      : `Compile finished with status ${result.status}`,
                  );
                } catch (error) {
                  setCompileMessage(
                    error instanceof Error ? error.message : "Compile request failed",
                  );
                } finally {
                  setCompiling(false);
                }
              }}
            >
              {compiling ? "Compiling…" : "Compile transform"}
            </button>
          )}
          <button
            type="button"
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50"
            onClick={() => requestDelete([node.id], [])}
          >
            Delete…
          </button>
        </div>
      </form>

      {isPortalNode(node) && (
        <section className="space-y-2 border-t border-[var(--athanor-mist)] pt-3 text-sm">
          <h3 className="font-medium">Portal bus</h3>
          <p className="text-xs text-[var(--athanor-slate)]">
            Bus id: <code>{portalBusId(node) || "(missing)"}</code>
          </p>
          {linkedPortals.length === 0 ? (
            <p className="text-xs text-[var(--athanor-slate)]">
              No linked portal endpoints on this bus yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {linkedPortals.map((portal) => (
                <li key={portal.id}>
                  <button
                    type="button"
                    className="text-left text-sm text-[var(--athanor-ember)] underline"
                    onClick={() => focusNode(portal.id)}
                  >
                    Jump to {portal.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {node.type === "foundation.python_transform" && (
        <section className="space-y-2 border-t border-[var(--athanor-mist)] pt-3 text-sm">
          <h3 className="font-medium">Compiler</h3>
          <p className="text-xs text-[var(--athanor-slate)]">
            Status: {compileStatus ?? "not compiled"}
          </p>
          {compileMessage && (
            <p className="text-xs text-[var(--athanor-slate)]">{compileMessage}</p>
          )}
          {compiledCode && (
            <pre className="max-h-48 overflow-auto rounded bg-[var(--athanor-mist)]/60 p-2 text-[11px] leading-relaxed">
              {compiledCode}
            </pre>
          )}
        </section>
      )}

      <section className="border-t border-[var(--athanor-mist)] pt-3 text-xs text-[var(--athanor-slate)]">
        <p>
          Type: <code>{node.type}</code>
        </p>
        <p>
          Version: <code>{node.version}</code>
        </p>
        <p>
          Category: <code>{definition.category}</code>
        </p>
        <p>
          Export: <code>{definition.exportKind}</code>
        </p>
        {node.parentMacroId && (
          <p>
            Parent macro: <code>{node.parentMacroId}</code>
          </p>
        )}
        <p className="mt-2 leading-relaxed">{definition.documentation}</p>
      </section>
    </aside>
  );
}
