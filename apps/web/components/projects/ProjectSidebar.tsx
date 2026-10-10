"use client";

/**
 * Home-page project library: list, CRUD, and example starters.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { EXAMPLE_PROJECTS } from "@/lib/example-projects";
import { useProjectLibraryStore } from "@/store/project-library-store";

function formatUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ProjectSidebar() {
  const router = useRouter();
  const projects = useProjectLibraryStore((state) => state.projects);
  const activeId = useProjectLibraryStore((state) => state.activeId);
  const refresh = useProjectLibraryStore((state) => state.refresh);
  const create = useProjectLibraryStore((state) => state.create);
  const createFromExample = useProjectLibraryStore((state) => state.createFromExample);
  const rename = useProjectLibraryStore((state) => state.rename);
  const remove = useProjectLibraryStore((state) => state.remove);
  const setActive = useProjectLibraryStore((state) => state.setActive);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openProject = (id: string) => {
    setActive(id);
    router.push(`/editor/${id}`);
  };

  const onCreate = () => {
    const id = create("Untitled project");
    router.push(`/editor/${id}`);
  };

  const onCreateExample = (exampleId: string) => {
    const id = createFromExample(exampleId);
    if (!id) return;
    router.push(`/editor/${id}`);
  };

  const beginRename = (id: string, name: string) => {
    setRenamingId(id);
    setRenameValue(name);
  };

  const commitRename = () => {
    if (!renamingId) return;
    rename(renamingId, renameValue);
    setRenamingId(null);
  };

  const onDelete = (id: string, name: string) => {
    const ok = window.confirm(`Delete project “${name}”? This cannot be undone.`);
    if (!ok) return;
    remove(id);
  };

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--athanor-mist)] bg-white/80"
      aria-label="Projects"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--athanor-mist)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- sidebar brand mark */}
          <img
            src="/logo.jpg"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-sm object-cover"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Projects</h2>
            <p className="text-[11px] text-[var(--athanor-slate)]">Saved locally on this device</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1 rounded bg-[var(--athanor-ink)] px-2.5 py-1.5 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athanor-ember)]"
        >
          <FolderPlus className="size-3.5" aria-hidden />
          New
        </button>
      </div>

      <div className="border-b border-[var(--athanor-mist)] px-3 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--athanor-slate)]">
          Examples
        </h3>
        <ul className="mt-2 space-y-2">
          {EXAMPLE_PROJECTS.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                className="w-full rounded border border-[var(--athanor-mist)] bg-white px-2.5 py-2 text-left hover:border-[var(--athanor-ember)]"
                onClick={() => onCreateExample(example.id)}
              >
                <span className="block text-xs font-medium">{example.name}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-[var(--athanor-slate)]">
                  {example.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex-1 space-y-1 overflow-auto p-2">
        {projects.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-[var(--athanor-slate)]">
            No projects yet. Create one or start from an example.
          </li>
        )}
        {projects.map((project) => {
          const isActive = project.id === activeId;
          const isRenaming = renamingId === project.id;
          return (
            <li key={project.id}>
              <div
                className={cn(
                  "group rounded-md border px-2.5 py-2",
                  isActive
                    ? "border-[var(--athanor-ember)] bg-orange-50/70"
                    : "border-transparent hover:border-[var(--athanor-mist)] hover:bg-white",
                )}
              >
                {isRenaming ? (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename();
                    }}
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={commitRename}
                      className="w-full rounded border border-[var(--athanor-mist)] px-2 py-1 text-sm"
                      aria-label="Project name"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => openProject(project.id)}
                  >
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--athanor-slate)]">
                      Updated {formatUpdatedAt(project.updatedAt)}
                    </span>
                  </button>
                )}
                <div className="mt-1.5 flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <Link
                    href={`/editor/${project.id}`}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--athanor-ember)] hover:underline"
                    onClick={() => setActive(project.id)}
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--athanor-slate)] hover:bg-[var(--athanor-mist)]"
                    onClick={() => beginRename(project.id, project.name)}
                  >
                    <Pencil className="size-3" aria-hidden />
                    Rename
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(project.id, project.name)}
                  >
                    <Trash2 className="size-3" aria-hidden />
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
