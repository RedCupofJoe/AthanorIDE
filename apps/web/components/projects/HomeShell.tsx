"use client";

/**
 * Home layout: project sidebar + branded intro / health status.
 */
import Link from "next/link";

import { HealthStatus } from "@/components/HealthStatus";
import { ProjectSidebar } from "@/components/projects/ProjectSidebar";

export function HomeShell() {
  return (
    <div className="flex min-h-screen">
      <ProjectSidebar />
      <main className="flex min-w-0 flex-1 flex-col justify-center gap-8 px-8 py-16 sm:px-12 lg:px-16">
        <header className="mx-auto w-full max-w-2xl space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--athanor-slate)]">
            Local-first architecture workbench
          </p>
          <h1
            className="text-5xl font-semibold tracking-tight text-[var(--athanor-ink)] sm:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            AthanorIDE
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[var(--athanor-slate)]">
            Create and reopen projects from the sidebar. Each project is saved in this
            browser and survives restarts — open one to continue on the canvas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/editor"
              className="rounded bg-[var(--athanor-ink)] px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athanor-ember)]"
            >
              Open last project
            </Link>
            <a
              href="http://127.0.0.1:8000/docs"
              className="rounded border border-[var(--athanor-mist)] bg-white/70 px-4 py-2 text-sm"
            >
              API docs
            </a>
          </div>
        </header>

        <div className="mx-auto w-full max-w-2xl">
          <HealthStatus />
        </div>
      </main>
    </div>
  );
}
