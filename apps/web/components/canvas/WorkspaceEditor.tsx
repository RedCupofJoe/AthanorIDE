"use client";

/**
 * Editor shell that hydrates a projectId and lays out palette, canvas, and inspector.
 */
import Link from "next/link";
import { RoleTabs } from "@/components/workflow/RoleTabs";
import {
  WorkflowCanvas,
  parseTransitionFlowId,
} from "@/components/workflow/WorkflowCanvas";
import {
  WorkflowInspector,
  ComponentWorkflowControls,
} from "@/components/workflow/WorkflowInspector";
import { parseTaskFlowId } from "@/lib/workflow";
import { useUiPreferencesStore } from "@/store/ui-preferences-store";
import { useSelectionStore } from "@/store/selection-store";
import { validateCurrentProject } from "@/lib/validate";
import { useEffect, useState } from "react";

import { ArchitectureCanvas } from "@/components/canvas/ArchitectureCanvas";
import { EditorToolbar } from "@/components/canvas/EditorToolbar";
import { ExecutionPanel } from "@/components/execution/ExecutionPanel";
import { DeleteConfirmationPanel } from "@/components/inspector/DeleteConfirmationPanel";
import { InfrastructureTokensPanel } from "@/components/inspector/InfrastructureTokensPanel";
import { LocalVaultPanel } from "@/components/inspector/LocalVaultPanel";
import { NodeInspector } from "@/components/inspector/NodeInspector";
import { NodePalette } from "@/components/sidebar/NodePalette";
import { ValidationPanel } from "@/components/validation/ValidationPanel";
import { useProjectStore } from "@/store/project-store";

type WorkspaceEditorProps = {
  projectId?: string;
};

type RightPanel = "inspector" | "infra" | "vault";

export function WorkspaceEditor({ projectId }: WorkspaceEditorProps) {
  const role = useUiPreferencesStore((s) => s.workspaceRole);
  const graph = useProjectStore((s) => s.graph);
  const selection = useSelectionStore();
  const workflowSelection = Boolean(
    parseTaskFlowId(selection.selectedNodeIds[0] ?? "") ||
      parseTransitionFlowId(selection.selectedEdgeIds[0] ?? ""),
  );
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("role");
    if (
      requested === "sme" ||
      requested === "engineer" ||
      requested === "security"
    )
      useUiPreferencesStore.getState().setWorkspaceRole(requested);
  }, []);
  useEffect(() => {
    if (role !== "security") return;
    const timer = setTimeout(() => void validateCurrentProject(), 450);
    return () => clearTimeout(timer);
  }, [graph, role]);
  const hydrate = useProjectStore((state) => state.hydrate);
  const hydrated = useProjectStore((state) => state.hydrated);
  const [missing, setMissing] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("inspector");
  const [mobilePanel, setMobilePanel] = useState<
    "palette" | "inspector" | null
  >(null);

  useEffect(() => {
    setRightPanel("inspector");
    setMobilePanel(null);
  }, [role]);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    setMissing(false);
    useProjectStore.setState({ hydrated: false });
    let current = true;
    void hydrate(projectId)
      .then((ok) => {
        if (current) setMissing(Boolean(projectId) && !ok);
      })
      .catch(() => {
        if (current) setMissing(Boolean(projectId));
      });
    return () => {
      current = false;
    };
  }, [hydrate, projectId]);

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[var(--athanor-slate)]">
          That project was not found in local storage.
        </p>
        <Link
          href="/"
          className="rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm font-medium text-white"
        >
          Back to projects
        </Link>
      </div>
    );
  }

  if (!hydrated || (projectId && graph.project.id !== projectId)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--athanor-slate)]">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden flex-col bg-[var(--athanor-paper)]">
      <div className="shrink-0">
        <EditorToolbar
          onOpenInfrastructureTokens={() => setRightPanel("infra")}
          onOpenLocalVault={() => setRightPanel("vault")}
          onToggleNodeLibrary={() =>
            setMobilePanel((current) =>
              current === "palette" ? null : "palette",
            )
          }
          onToggleInspector={() =>
            setMobilePanel((current) =>
              current === "inspector" ? null : "inspector",
            )
          }
        />
      </div>
      <RoleTabs />
      <div
        id="role-workspace"
        role="tabpanel"
        aria-labelledby={`role-${role}`}
        className="relative flex min-h-0 flex-1"
      >
        {role !== "sme" && (
          <div
            className={
              mobilePanel === "palette"
                ? "absolute inset-y-0 left-0 z-30 shadow-xl lg:static lg:z-auto lg:shadow-none"
                : "hidden lg:block"
            }
          >
            <NodePalette />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {role === "sme" ? <WorkflowCanvas /> : <ArchitectureCanvas />}
          </div>
          {role !== "sme" && <ExecutionPanel />}
          <ValidationPanel />
        </div>
        <div
          className={
            mobilePanel === "inspector"
              ? "absolute inset-y-0 right-0 z-30 flex w-80 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto overscroll-contain bg-white shadow-xl lg:static lg:z-auto lg:max-w-none lg:shadow-none"
              : "hidden lg:flex lg:min-h-0 lg:w-80 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-[var(--athanor-mist)]"
          }
        >
          {rightPanel === "infra" ? (
            <InfrastructureTokensPanel
              open
              onClose={() => setRightPanel("inspector")}
            />
          ) : rightPanel === "vault" ? (
            <LocalVaultPanel open onClose={() => setRightPanel("inspector")} />
          ) : (
            <>
              <DeleteConfirmationPanel />
              <div className="min-h-0 flex-1">
                {role === "sme" || workflowSelection ? (
                  <WorkflowInspector />
                ) : (
                  <>
                    <ComponentWorkflowControls />
                    <NodeInspector />
                    <WorkflowInspector />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
