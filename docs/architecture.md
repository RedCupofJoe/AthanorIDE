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

Persisted projects are JSON documents conforming to `packages/contracts/schema/architecture-graph.v2.schema.json`.

Browser persistence:

- Project metadata index remains in localStorage: `athanoride.agents.projects.index.v2`.
- Project graph bodies use IndexedDB database version 2. The upgrade recreates only the project store; a one-time marker limits cleanup of older project indexes/body keys. No old-project loaders or migrations remain. Restricted browsers fall back to localStorage and the editor reports save errors.
- Marketplace snapshots are cached independently in IndexedDB and refreshed every 24 hours
  while the app is open.

Canvas derivation builds node, edge-payload, deployment-count, execution, and collapsed-macro
indexes once per relevant graph snapshot. React Flow retains viewport culling; dragging is
transient in the canvas and graph positions are persisted once on drop. Low-resource mode
removes the minimap, and undo snapshots are capped to approximately 8 MiB. The FastAPI
process sends graph validation, execution, compiler, export, and catalog-refresh work to a
two-job worker limit; requests above capacity get a structured 503 and `Retry-After` hint.
The current baseline target is 8 GB RAM and 4 CPU cores. These settings reduce overhead but
are not a measured performance guarantee; interactive rendering benchmarks across hardware remain future work.
Run `PYTHONPATH=apps/api uv run --project apps/api python scripts/benchmark_graph_validation.py`
to record graph-validation timings for 300, 999, and 3,000-node sample graphs on the current
machine. The benchmark reports timings without machine-independent pass/fail thresholds.

See [ADR 0001](./decisions/0001-canonical-graph-schema.md) and [ADR 0009](./decisions/0009-multi-project-library.md).

## Runtime boundaries

```text
Browser (Next.js)
  ├─ /                    project library + examples
  ├─ /editor/[projectId]  canvas (Zustand + @xyflow/react)
  ├─ local persistence    IndexedDB graph bodies + localStorage metadata index
  ├─ /marketplace         locally cached package/advisory snapshot
  └─ API calls ──────────► FastAPI
                            ├─ GET  /api/v1/health
                            ├─ GET  /api/v1/node-definitions
                            ├─ POST /api/v1/projects/validate
                            ├─ POST /api/v1/projects/execute
                            ├─ POST /api/v1/projects/handoff
                            ├─ POST /api/v1/projects/export
                            ├─ POST /api/v1/compiler/generate
                            ├─ POST /api/v1/compiler/validate
                            ├─ GET  /api/v1/marketplace/topics
                            └─ POST /api/v1/marketplace/refresh
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
- Marketplace sources, refresh cadence, and coverage limitations: [marketplace.md](./marketplace.md)

## Further reading

- [User guide](./user-guide.md)
- [Node catalog](./node-catalog.md)
- [Development plan](./development-plan.md)
- [ADRs](./decisions/README.md)

## Shared workflow workspace

Schema 2.0.0 contains task briefs, independent SME/engineering layouts, stage transitions, string task bindings, workflow input, and a concurrency limit. Component membership is explicit. All three tabs edit this same graph; role selection is a browser preference, not an access-control boundary. Undo/redo and autosave include workflow edits and deliberate optional-port omissions.

Design validation checks briefs and workflow topology. Deployment validation also checks implementation bindings, catalog ports, policies, credentials, and executable coverage. Both profiles scan descriptive content and nested configuration for credentials without echoing matched values. Server export revalidates every submitted graph. Handoff returns a deterministic design ZIP; deployment formats include workflow.json and security-review.json.

Exported workflow_scheduler.py is shared by local isolated-container and cluster process launchers. It runs each global stage with bounded concurrency, joins predecessors in sorted task-ID order, and substitutes successful dedicated recovery results. A failed stage waits for already-running peers within their worker deadlines and does not advance. Interactive CLI approvals share one deadline-aware lock. IDE task preview is non-executing. See [ADR 0012](./decisions/0012-three-role-workflow.md).
