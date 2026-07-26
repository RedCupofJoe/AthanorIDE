"use client";

/**
 * Editor shell that hydrates a projectId and lays out palette, canvas, and inspector.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const hydrate = useProjectStore((state) => state.hydrate);
  const hydrated = useProjectStore((state) => state.hydrated);
  const openGraphId = useProjectStore((state) => state.graph.project.id);
  const [missing, setMissing] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("inspector");

  useEffect(() => {
    useProjectStore.setState({ hydrated: false });
    const ok = hydrate(projectId);
    setMissing(Boolean(projectId) && !ok);
  }, [hydrate, projectId]);

  useEffect(() => {
    if (!hydrated || missing || !projectId) return;
    if (openGraphId !== projectId) {
      router.replace(`/editor/${openGraphId}`);
    }
  }, [hydrated, missing, openGraphId, projectId, router]);

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

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--athanor-slate)]">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--athanor-paper)]">
      <EditorToolbar
        onOpenInfrastructureTokens={() => setRightPanel("infra")}
        onOpenLocalVault={() => setRightPanel("vault")}
      />
      <div className="flex min-h-0 flex-1">
        <NodePalette />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ArchitectureCanvas />
          </div>
          <ExecutionPanel />
          <ValidationPanel />
        </div>
        <div className="flex w-80 shrink-0 flex-col border-l border-[var(--athanor-mist)]">
          {rightPanel === "infra" ? (
            <InfrastructureTokensPanel open onClose={() => setRightPanel("inspector")} />
          ) : rightPanel === "vault" ? (
            <LocalVaultPanel open onClose={() => setRightPanel("inspector")} />
          ) : (
            <>
              <DeleteConfirmationPanel />
              <div className="min-h-0 flex-1">
                <NodeInspector />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
