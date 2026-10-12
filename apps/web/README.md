# `@athanor/web` — AthanorIDE frontend

Next.js App Router application for the agent/MCP workbench. It retains the project library, palette, React Flow canvas, and inspector layout. Start with the [root README](../../README.md) for setup and end-to-end workflows.

## Routes

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `HomeShell` + `ProjectSidebar` | Project library & example starters |
| `/editor` | Redirect helper | Opens active project or creates one |
| `/editor/[projectId]` | `WorkspaceEditor` | Canvas workspace for one project |

## Layout of the editor

```text
┌ Toolbar (validate, preview, export format, undo, search) ──┐
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
| `components/sidebar/` | Agent palette, MCP registry/JSON import, reusable templates |
| `components/inspector/` | Config forms, tool schema editor, disconnect + delete confirmation |
| `components/projects/` | Home project sidebar |
| `store/` | Zustand stores (graph, library, selection, run, …) |
| `lib/` | API clients, browser persistence, starters, MCP parsing, templates, graph helpers |

## Editor behavior

- The current palette filters the full catalog with `isAgentStudioType`: agent, harness, sandbox, and MCP blocks plus four foundation input/output blocks. Earlier definitions remain in the package but are not all shown in the palette.
- Inspector edits must be applied. **Save applied block as template** stores the applied node configuration; templates are managed in the palette's **My blocks** section.
- Connections enforce compatible contracts and reject duplicates. Reconnecting an endpoint replaces a wire atomically; invalid drops retain it. Disconnects and confirmed node deletions are undoable, including attached wires.
- Node dragging uses transient React Flow state, committing positions on drop. Initial fitting waits for measured nodes; restored viewports are preserved.
- **Run preview** does not execute agent/MCP endpoints or workers. Real execution belongs to the exported runtime.
- MCP import keeps CPU keyword/topic search available offline, offers optional local semantic search, and still supports direct online registry lookup and manifest imports. Import only creates metadata/configuration blocks; see the [MCP Registry Search guide](../../docs/mcp-registry-search.md) for caching and privacy behavior.
- Export supports source code, Helm, Podman, Docker, OpenShift, npm, and Makefiles through the API.

Projects use `athanoride.agents.projects.index.v1` and `athanoride.agents.project.<id>.v1` in localStorage. Templates use `athanor.block-templates.v1`. Back up graphs with **Graph JSON** and libraries with **Export templates**. Old project namespaces are not migrated. Storage is scoped to the browser profile and origin.

## Talking to the API

Base URL from `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000`). Helpers in `lib/api.ts`, `validate.ts`, `execute.ts`, `export.ts`, `compiler.ts`.

Set the public URL before starting development or building production assets. Runtime environment changes alone do not change the URL embedded in a built frontend. A different frontend origin also needs a corresponding API CORS setting; see [custom development ports](../../README.md#use-different-development-ports).

## Development

From the monorepo root:

```bash
make install
make dev
```

Package-only, after installing dependencies and building shared packages (with `pnpm` on PATH):

```bash
pnpm --filter @athanor/web dev
pnpm --filter @athanor/web test
pnpm --filter @athanor/web typecheck
pnpm --filter @athanor/web build
```

These commands do not start the API. `make dev` rebuilds shared packages; when editing the agent catalog, also run `pnpm catalog:sync` to update the API mirror. The production build currently downloads fonts through `next/font/google`.

## Related docs

- [Agent studio guide](../../docs/agent-studio.md) — current palette and runtime behavior
- [Node authoring guide](../../packages/node-definitions/README.md)
- [Architecture](../../docs/architecture.md) — retained architecture and runtime history
