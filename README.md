# AthanorIDE

Local-first visual IDE for AI solution architects. Model typed architecture graphs on a canvas, validate designs, run safe payload inspection, and export readable deployable repositories — without requiring proprietary cloud services for core editing.

## How the application works

```text
Home (/)                     Editor (/editor/[projectId])
┌──────────────┐             ┌──────────────────────────────────────────┐
│ Project list │ ── open ──► │ Palette │ Canvas + Run/Validate │ Inspect │
│ Examples     │             │ (nodes) │ (graph / connections) │ (forms) │
└──────────────┘             └────────────┬─────────────────────────────┘
                                          │ HTTP
                                          ▼
                                 FastAPI (apps/api)
                                 validate · execute · compile · export
```

1. **Projects** live in the browser (`localStorage`). Create blank projects or start from examples (RAG, vision fine-tuning, text transform).
2. **Nodes** come from the declarative catalog (`@athanor/node-definitions`). Drag (two-click) from the palette onto the canvas.
3. **Edges** connect typed ports. Contract types must match (or use `ANY`). Hover a port to see what it accepts.
4. **Validate** checks configuration, contracts, portals, and deployment boundaries via the API.
5. **Run** walks the graph safely for payload inspection (compiled transforms use Podman; secrets are redacted; HTTP skipped by default).
6. **Export** generates a FastAPI repo ZIP (optional K8s/OpenShift/Terraform) with lineage docs for every node.

Full node reference: [docs/node-catalog.md](docs/node-catalog.md)  
User-oriented walkthrough: [docs/user-guide.md](docs/user-guide.md)

## Prerequisites

| Tool | Notes |
| --- | --- |
| Node.js 20+ | Frontend and workspace tooling |
| Python 3.12+ | Backend (3.12–3.14 tested) |
| Podman 4+ | Rootless preferred; used by `make podman-up` and sandboxed transforms |
| Make | Fedora/macOS; on Windows use WSL2 or Git Bash |

`make install` bootstraps project-local `pnpm` and `uv` into `.tools/` when they are missing from `PATH`.

## Quick start

```bash
make install
make dev
```

| URL | Purpose |
| --- | --- |
| http://localhost:3000 | Home — projects & examples |
| http://localhost:3000/editor | Opens the last/active project |
| http://localhost:8000/api/v1/health | API health |
| http://localhost:8000/docs | OpenAPI |

## Common commands

```bash
make install       # Bootstrap tools + install JS/Python deps
make dev           # Run API + web concurrently
make lint          # ESLint + Ruff
make typecheck     # tsc + mypy
make test          # Vitest + Pytest
make podman-up     # Rootless compose stack
make podman-down   # Stop compose stack
```

## Repository layout

```text
apps/web                   Next.js App Router IDE (canvas, stores, UI)
apps/api                   FastAPI: validate, execute, compile, export, sandbox
packages/contracts         Canonical JSON Schema + Zod / TS types
packages/node-definitions  Declarative node catalog (ports, forms, docs)
packages/ui                Shared UI primitives
docs/                      Architecture, ADRs, security, node catalog, user guide
examples/                  Walkthroughs for exported / sample pipelines
```

| Package README | Description |
| --- | --- |
| [apps/web/README.md](apps/web/README.md) | Frontend architecture & stores |
| [apps/api/README.md](apps/api/README.md) | API endpoints & safety rules |
| [packages/contracts/README.md](packages/contracts/README.md) | Graph schema & contract types |
| [packages/node-definitions/README.md](packages/node-definitions/README.md) | How to add nodes |
| [packages/ui/README.md](packages/ui/README.md) | Shared UI package |

## Documentation index

- [User guide](docs/user-guide.md) — projects, canvas, run, export
- [Node catalog](docs/node-catalog.md) — every node type explained
- [Architecture](docs/architecture.md) — monorepo & runtime boundaries
- [Development plan](docs/development-plan.md) — vertical slices & status
- [Security model](docs/security-model.md) — sandbox, secrets, threat posture
- [ADRs](docs/decisions/README.md) — durable design decisions

## Platform notes

### Fedora Linux
Native rootless Podman works well. After `make install`, use `make dev` for host processes or `make podman-up` for containers.

### macOS
Install Node 20+, Python 3.12+, and Podman Desktop / Podman machine. `make` is available via Xcode CLT or Homebrew.

### Windows
Use **WSL2** for the supported path. Install Node, Python, Make, and Podman inside WSL.

If port `8000` or `3000` is already occupied:

```bash
ATHANOR_API_PORT=8010 ATHANOR_WEB_PORT=3010 make podman-up
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010 make dev
```
