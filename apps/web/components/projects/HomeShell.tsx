"use client";

/**
 * Home layout: project sidebar + branded intro / health status.
 */
import Image from "next/image";
import Link from "next/link";

import { ROLES } from "@/components/workflow/RoleTabs";
import { HealthStatus } from "@/components/HealthStatus";
import { ProjectSidebar } from "@/components/projects/ProjectSidebar";

export function HomeShell() {
  return (
    <div className="flex min-h-screen">
      <ProjectSidebar />
      <main className="flex min-w-0 flex-1 flex-col justify-center gap-8 px-8 py-16 sm:px-12 lg:px-16">
        <header className="mx-auto w-full max-w-2xl space-y-4">
          <Image
            src="/logo.jpg"
            alt="AthanorIDE — AI first, visual, architect, build"
            width={320}
            height={320}
            priority
            className="h-auto w-48 max-w-full sm:w-64"
          />
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--athanor-slate)]">
            Local-first agent engineering
          </p>
          <h1 className="sr-only">AthanorIDE</h1>
          <p className="max-w-xl text-lg leading-relaxed text-[var(--athanor-slate)]">
            Design sandboxed agents, agent harnesses, and MCP servers on a visual canvas.
            Connect API endpoints, choose your isolation, and export readable code.
            Start with an example from the sidebar — every project stays saved in this browser.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">{ROLES.map(role => <Link key={role.id} href={`/editor?role=${role.id}`} className="rounded-lg border bg-white p-3 text-sm"><strong>{role.label}</strong><span className="mt-1 block text-xs text-slate-600">{role.description}</span></Link>)}</div>
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
            <Link href="/marketplace" className="rounded border border-[var(--athanor-mist)] bg-white/70 px-4 py-2 text-sm hover:border-[var(--athanor-ember)]">
              Open-source marketplace
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-2xl">
          <HealthStatus />
        </div>
      </main>
    </div>
  );
}
