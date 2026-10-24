"use client";
import {
  useUiPreferencesStore,
  type WorkspaceRole,
} from "@/store/ui-preferences-store";
import { useSelectionStore } from "@/store/selection-store";
export const ROLES: {
  id: WorkspaceRole;
  label: string;
  description: string;
}[] = [
  {
    id: "sme",
    label: "Subject Matter Expert",
    description: "Define tasks, constraints, and workflow stages",
  },
  {
    id: "engineer",
    label: "AI Engineer",
    description: "Configure each task’s agents and components",
  },
  {
    id: "security",
    label: "AgentOpSec Engineer",
    description: "Review controls, overrides, and unused connections",
  },
];
export function RoleTabs() {
  const role = useUiPreferencesStore((s) => s.workspaceRole);
  const select = (next: WorkspaceRole) => {
    useSelectionStore.getState().clearSelection();
    useUiPreferencesStore.getState().setWorkspaceRole(next);
  };
  return (
    <nav
      aria-label="Workspace roles"
      className="shrink-0 border-b bg-white px-3"
    >
      <div
        role="tablist"
        aria-label="Role views"
        className="flex overflow-x-auto"
      >
        {ROLES.map((r, index) => (
          <button
            key={r.id}
            id={`role-${r.id}`}
            role="tab"
            aria-selected={role === r.id}
            aria-controls="role-workspace"
            tabIndex={role === r.id ? 0 : -1}
            title={r.description}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${role === r.id ? "border-orange-700 text-orange-800" : "border-transparent text-slate-600"}`}
            onClick={() => select(r.id)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 2
                    : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3;
              select(ROLES[next]!.id);
              document.getElementById(`role-${ROLES[next]!.id}`)?.focus();
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
