# AthanorIDE Architecture

## Overview

AthanorIDE is a monorepo containing:

| Path | Role |
| --- | --- |
| `apps/web` | Next.js App Router visual IDE |
| `apps/api` | FastAPI validation, execution, compiler, export, sandbox |
| `packages/contracts` | Canonical JSON Schema + TypeScript Zod mirrors |
| `packages/node-definitions` | Declarative node catalog (ports, forms, docs, exportKind) |
| `packages/ui` | Shared UI primitives |

## Design principles

1. Visual first, code optional  
2. Progressive disclosure  
3. Local first  
4. Open-source first  
5. Podman first, OCI compatible  
6. Strong contracts over implicit behavior  
7. Inspectable automation  
8. Secure by default (never execute generated code on the host)  
9. Incremental delivery (vertical slices)  
10. Architecture before decoration  

Opinionated multi-tech composites live in the **Big Blocks** catalog category (`big_blocks.*`): lineage/config only (IDE Run skips them). See [ADR 0010](./decisions/0010-big-blocks.md) and [node-catalog.md](./node-catalog.md).
## Canonical graph

Persisted projects are JSON documents conforming to `packages/contracts/schema/architecture-graph.v1.schema.json`.

Browser library keys:

- Index: `athanoride.projects.index.v1`
- Bodies: `athanoride.project.<id>.v1`

See [ADR 0001](./decisions/0001-canonical-graph-schema.md) and [ADR 0009](./decisions/0009-multi-project-library.md).

## Runtime boundaries

```text
Browser (Next.js)
  ├─ /                    project library + examples
  ├─ /editor/[projectId]  canvas (Zustand + @xyflow/react)
  ├─ local persistence    multi-project localStorage
  └─ API calls ──────────► FastAPI
                            ├─ GET  /api/v1/health
                            ├─ GET  /api/v1/node-definitions
                            ├─ POST /api/v1/projects/validate
                            ├─ POST /api/v1/projects/execute
                            ├─ POST /api/v1/projects/export
                            ├─ POST /api/v1/compiler/generate
                            └─ POST /api/v1/compiler/validate
```

Generated transforms are never executed on the API host interpreter — only in the rootless Podman sandbox (or via the deterministic Phase-2 classifier for uncompiled instructions).

## Frontend state (summary)

| Store | Responsibility |
| --- | --- |
| `project-store` | Open graph, undo/redo, mutations, autosave |
| `project-library-store` | Project list / create / rename / delete / examples |
| `selection-store` | Selected nodes/edges + focus |
| `validation-store` / `execution-store` | Last Validate / Run results |
| `pending-delete-store` | Canvas delete → inspector confirmation |
| `ui-preferences-store` | Compact palette, etc. |

## Security model (summary)

- Generated or user-supplied transformation code runs only in isolated, resource-limited rootless containers.
- Secrets are referenced, never embedded in exported repositories (`.env.example` only).
- Structured API errors; no raw stack traces to clients.
- Full detail: [security-model.md](./security-model.md)

## Further reading

- [User guide](./user-guide.md)
- [Node catalog](./node-catalog.md)
- [Development plan](./development-plan.md)
- [ADRs](./decisions/README.md)
