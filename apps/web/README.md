# `@athanor/web` — AthanorIDE frontend

Next.js App Router application for the three-role agent/MCP workbench. Subject Matter Expert, AI Engineer, and AgentOpSec Engineer tabs edit one shared project, from task briefs to implementation and security review. Start with the [root README](../../README.md) for setup and the [three-role user guide](../../docs/user-guide.md) for the complete workflow.

## Routes

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `HomeShell` + `ProjectSidebar` | Project library, role entry choices, and example starters |
| `/editor` | Redirect helper | Opens active project or creates one |
| `/editor/[projectId]` | `WorkspaceEditor` | Three role views over one project |

## Layout of the editor

| View | Canvas and controls |
| --- | --- |
| Subject Matter Expert | Draw/resize/color/clone task briefs; Start and numbered/recovery transitions; workflow overview, design validation, and build-brief export |
| AI Engineer | Palette, component canvas, task groups, component assignment, input/result boundaries, and instruction inheritance/overrides |
| AgentOpSec Engineer | Engineering layout with highlighted controls/findings, instruction comparison, pruning previews, optional-port restoration, and deployment validation/export |

Blank projects open in SME view. Role selection is remembered, with separate SME and engineering viewports. Tabs support arrow keys, Home, and End. Narrow layouts expose Inspector, Node library, and Actions controls. All roles remain available to everyone.

## Key directories

| Path | Role |
| --- | --- |
| `components/canvas/` | Toolbar, React Flow canvas, workspace shell |
| `components/workflow/` | Role tabs, SME task canvas, task boxes, and workflow inspector |
| `components/nodes/` | Node renderers, port rows, macros, swimlanes |
| `components/sidebar/` | Agent palette, MCP registry/JSON import, reusable templates |
| `components/inspector/` | Config forms, tool schema editor, disconnect + delete confirmation |
| `components/projects/` | Home project sidebar |
| `store/` | Zustand stores (graph, library, selection, run, …) |
| `lib/` | API clients, browser persistence, starters, MCP parsing, templates, graph helpers |

## Editor behavior

- Task briefs persist across all views. Engineering group movement moves assigned components; assignment is explicit. Agent instructions inherit later SME edits unless an engineer selects an override, which remains visible in AgentOpSec review.
- Pruning previews exact removals and applies them as one undoable edit. Required, connected, and boundary ports are protected; group pruning preserves referenced components and shared resources. Graph changes invalidate validation and pruning triggers revalidation.
- The current palette filters the full catalog with `isAgentStudioType`: agent, harness, sandbox, and MCP blocks plus four foundation input/output blocks. Earlier definitions remain in the package but are not all shown in the palette.
- Inspector edits must be applied. **Save applied block as template** stores the applied node configuration; templates are managed in the palette's **My blocks** section.
- Connections enforce compatible contracts and reject duplicates. Reconnecting an endpoint replaces a wire atomically; invalid drops retain it. Disconnects and confirmed node deletions are undoable, including attached wires.
- Node dragging uses transient React Flow state, committing positions on drop. Initial fitting waits for measured nodes; restored viewports are preserved.
- **Run preview** displays planned stages and recovery routes without executing agent/MCP endpoints or workers. Real execution belongs to the exported runtime. **Export build brief** needs a valid design before implementation is complete.
- MCP import keeps CPU keyword/topic search available offline, offers optional local semantic search, and still supports direct online registry lookup and manifest imports. Import only creates metadata/configuration blocks; see the [MCP Registry Search guide](../../docs/mcp-registry-search.md) for caching and privacy behavior.
- Export supports source code, Helm, Podman, Docker, OpenShift, npm, and Makefiles through the API.

Schema-2.0.0 projects use IndexedDB `athanoride-project-library` / `projects`, with metadata in localStorage `athanoride.agents.projects.index.v2`. Restricted browsers use `athanoride.agents.project.v2.<id>` as a graph fallback. The database version-2 upgrade resets the project store once; one-time cleanup removes old project indexes/body keys. Subsequent loads preserve new projects. Templates (`athanor.block-templates.v1`), preferences, marketplace data, and the vault are preserved. Older graph imports are rejected. Back up graphs with **Graph JSON** and libraries with **Export templates**. Browser storage is scoped to the profile and origin.

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

- [Three-role user guide](../../docs/user-guide.md) — task design, engineering, review, and pruning
- [Starter examples](../../examples/README.md) — parallel tasks, join/recovery, agents, harnesses, and MCP
- [Agent studio guide](../../docs/agent-studio.md) — current palette and runtime behavior
- [Node authoring guide](../../packages/node-definitions/README.md)
- [Architecture](../../docs/architecture.md) and [ADR 0012](../../docs/decisions/0012-three-role-workflow.md) — shared project and execution contracts
