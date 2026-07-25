# `@athanor/web` — AthanorIDE frontend

Next.js App Router application that hosts the visual architecture IDE.

## Routes

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `HomeShell` + `ProjectSidebar` | Project library & example starters |
| `/editor` | Redirect helper | Opens active project or creates one |
| `/editor/[projectId]` | `WorkspaceEditor` | Canvas workspace for one project |

## Layout of the editor

```text
┌ Toolbar (validate, run, export, undo, search) ──────────────┐
├ Node palette │ Canvas (React Flow) │ Inspector ─────────────┤
│              │ Execution panel     │ Delete confirm banner  │
│              │ Validation panel    │ Config forms           │
└──────────────┴─────────────────────┴────────────────────────┘
```

## Key directories

| Path | Role |
| --- | --- |
| `components/canvas/` | Toolbar, React Flow canvas, workspace shell |
| `components/nodes/` | Node renderers, port rows, macros, swimlanes |
| `components/sidebar/` | Node palette |
| `components/inspector/` | Config forms + delete confirmation |
| `components/projects/` | Home project sidebar |
| `store/` | Zustand stores (graph, library, selection, run, …) |
| `lib/` | API clients, persistence, examples, graph helpers |

## Talking to the API

Base URL from `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000`). Helpers in `lib/api.ts`, `validate.ts`, `execute.ts`, `export.ts`, `compiler.ts`.

## Development

From the monorepo root:

```bash
make install
make dev
```

Package-only:

```bash
pnpm --filter @athanor/web dev
pnpm --filter @athanor/web test
pnpm --filter @athanor/web typecheck
```

## Related docs

- [User guide](../../docs/user-guide.md)
- [Node catalog](../../docs/node-catalog.md)
- [Architecture](../../docs/architecture.md)
