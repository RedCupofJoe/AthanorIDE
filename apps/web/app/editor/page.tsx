"use client";

/**
 * /editor entry: redirects to the active project or creates a blank one.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createProject,
  getActiveProjectId,
  listProjectSummaries,
} from "@/lib/project-library";

/** Resolves `/editor` to the active project, or creates one when the library is empty. */
export default function EditorIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const active = getActiveProjectId();
    if (active) {
      router.replace(`/editor/${active}`);
      return;
    }
    const first = listProjectSummaries()[0];
    if (first) {
      router.replace(`/editor/${first.id}`);
      return;
    }
    const created = createProject("Untitled project");
    router.replace(`/editor/${created.project.id}`);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--athanor-slate)]">
      Opening project…
    </div>
  );
}
