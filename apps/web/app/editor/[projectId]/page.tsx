/** Project-scoped editor route — loads WorkspaceEditor for a library project id. */
import type { Metadata } from "next";

import { WorkspaceEditor } from "@/components/canvas/WorkspaceEditor";

export const metadata: Metadata = {
  title: "Editor · AthanorIDE",
  description: "Visual architecture canvas for typed AI pipelines.",
};

type EditorProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditorProjectPage({ params }: EditorProjectPageProps) {
  const { projectId } = await params;
  return <WorkspaceEditor projectId={projectId} />;
}
