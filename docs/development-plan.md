# AthanorIDE Development Plan

## Product

AthanorIDE is a local-first visual development environment for solution architects. Users model AI systems as typed graphs, validate architectures, and export readable deployable repositories without requiring hand-written application code.

## Current repository state

As of Phase 0 kickoff the repository was empty (git metadata only). Phase 0 establishes the monorepo foundation from scratch.

## Vertical slice: Phase 0 — Repository Foundation

**Goal:** A runnable monorepo where frontend, backend, shared contracts, tooling, Podman-based development, CI, and documentation all work without proprietary services or API credentials.

### Definition of done

- [x] Frontend starts (`apps/web`)
- [x] Backend starts (`apps/api`)
- [x] `GET /api/v1/health` works
- [x] Tests run
- [x] Type checking passes
- [x] Development environment runs with rootless Podman
- [x] `make install|dev|lint|typecheck|test|podman-up|podman-down` documented and implemented

## Phase roadmap

| Phase | Focus | Acceptance |
| --- | --- | --- |
| **0** | Repository foundation | Apps start; health OK; lint/typecheck/test; Podman compose |
| **1** | Executable canvas vertical slice | Text Input → Python Transform → Output Viewer; save/reload/validate |
| **2** | Deterministic export | Graph exports to Podman-runnable repo with generated tests |
| **3** | Safe NL compiler | Mock provider + AST allowlist + sandbox + audit trail |
| **4** | Advanced canvas | Semantic zoom, macros, portals, swimlanes |
| **5** | Expanded node library | Declarative nodes with ports, forms, export, tests |
| **6** | Deployment generation | K8s/OpenShift/Terraform + boundary validation |

## Working protocol

1. Inspect existing code and docs before changing files.
2. Implement one complete vertical slice at a time.
3. Prefer reuse over rewrite.
4. Add tests with every behavior change.
5. Run format, lint, typecheck, and tests before claiming done.
6. Update docs and ADRs when schema or tooling decisions change.

## Platform support

Primary development targets:

- Fedora Linux (rootless Podman native)
- macOS (Podman machine or compatible OCI runtime)
- Windows (WSL2 strongly recommended; Git Bash for `make` where available)

Tooling bootstrap installs project-local `pnpm` and `uv` under `.tools/` so host-global installs are optional.

## Vertical slice: Phase 1 — Executable Canvas

**Goal:** A user can visually build, save, reload, and validate a three-node text-transformation pipeline.

### Definition of done

- [x] Text Input, Python Transformation, and Output Viewer nodes
- [x] Typed ports with contract compatibility checks
- [x] Node configuration forms
- [x] Zustand project/selection/validation state with undo/redo
- [x] Debounced local persistence + JSON import/export
- [x] Backend `POST /api/v1/projects/validate`

## Vertical slice: Phase 2 — Deterministic Export

**Goal:** A validated Phase 1 graph exports into a repository that passes generated tests and runs with rootless Podman.

### Definition of done

- [x] Graph-to-project IR + Jinja2 exporter
- [x] FastAPI runtime, Containerfile, compose, contract tests
- [x] Export manifest + deterministic ZIP archive
- [x] `POST /api/v1/projects/export`
- [x] Generated project pytest + optional Podman smoke test

## Vertical slice: Phase 3 — Safe NL Compiler

**Goal:** A natural-language transformation can be compiled, validated, tested, inspected, and exported without running untrusted code on the host.

### Definition of done

- [x] Model-provider abstraction + deterministic mock provider
- [x] TransformationSpec → Python codegen
- [x] AST allowlist + Ruff/Mypy + Podman sandbox
- [x] Bounded correction loop with audit trail
- [x] `POST /api/v1/compiler/generate` and `/validate`
- [x] Export embeds compiled code when present

## Vertical slice: Phase 4 — Advanced Canvas

**Goal:** Architects can navigate large graphs with semantic zoom, collapse reusable macros, hop via portal buses, and place nodes into deployment swimlanes with validation navigation.

### Definition of done

- [x] Semantic zoom LOD (macro / mid / micro) without mutating the graph
- [x] Collapse/expand macro blocks with external ports + serialization
- [x] Portal Input / Portal Output with bus validation and jump navigation
- [x] Deployment swimlanes with inherited targets + cross-env edge checks
- [x] Graph search + validation issue focus (nodes and edges)
- [x] Memoized node rendering + `onlyRenderVisibleElements`

## Vertical slice: Phase 5 — Expanded Node Library

**Goal:** Complete the foundation catalog and introduce the first fine-tuning nodes, each with typed ports, configuration, validation, documentation, export lineage, and tests.

### Definition of done

- [x] Foundation nodes: JSON Input, Prompt Template, HTTP Request, Environment Variable, Secret Reference
- [x] Fine-tuning starters: Dataset Loader, LoRA Trainer
- [x] Declarative `exportKind` + mirrored API catalog
- [x] Node-specific validation (JSON, HTTP URL/method, env names, secret embedding, LoRA hyperparams)
- [x] Export: node catalog docs, env bindings, secret name comments, HTTP client stubs
- [x] Palette grouped by category; inspector shows docs/export metadata

## Vertical slice: Phase 6 — Deployment Generation

**Goal:** Optionally generate Kubernetes, OpenShift, and Terraform artifacts with resource limits, secret references, network policies, and deployment-boundary validation—without requiring a cluster to run the IDE.

### Definition of done

- [x] Kubernetes manifests (Namespace, Deployment, Service, ConfigMap, Secret placeholders, NetworkPolicy)
- [x] OpenShift Route overlay
- [x] Terraform (Kubernetes provider) for the primary cluster target
- [x] Resource requirements (CPU/memory/GPU) from env/node metadata
- [x] Secret references exported as empty placeholders only
- [x] Network policy generation from cross-env edges + HTTP egress
- [x] Deployment-boundary validation (unknown targets, air-gap HTTP, escalate incomplete cross-env on cluster export)
- [x] Toolbar toggles for K8s / OpenShift / Terraform

## Vertical slice: Execution & debug inspection

**Goal:** Run the architecture graph inside the IDE to inspect payloads on nodes and edges, without executing untrusted code on the host.

### Definition of done

- [x] `POST /api/v1/projects/execute` with per-node steps + edge payloads
- [x] Safe transform execution (sandbox for compiled code; classifier fallback)
- [x] Secret redaction; HTTP skipped by default; portal bus ordering
- [x] Toolbar **Run**, Execution panel, canvas payload previews

## Next slice

**Node library expansion:** vision / multi-agent / enterprise categories with export + tests.

## Vertical slice: Catalog expansion (vision / multi-agent / enterprise)

**Goal:** Add the deferred category starters as typed lineage nodes with validation, export docs, and non-executing IDE behavior.

### Definition of done

- [x] Vision: Image Input, Image Preprocessor, Vision Model
- [x] Multi-agent: Agent, Tool Definition, MCP Server
- [x] Enterprise: Policy Guardrail, Audit Log, Identity Reference
- [x] Export lineage sections + node catalog entries
- [x] Validation for tool schema, MCP endpoint, identity credentials, vision dims
- [x] IDE executor skips these categories

## Next slice

**Product hardening:** orchestrator / vision inference stubs under sandbox, richer inspector forms, or catalog TS→Python codegen to prevent drift.

## Vertical slice: Multi-project library

**Goal:** Manage multiple named projects from the home page, with local persistence across restarts.

### Definition of done

- [x] Home sidebar: create / open / rename / delete
- [x] Per-project localStorage + legacy single-project migration
- [x] `/editor/[projectId]` routing; `/editor` opens active/creates default
- [x] Autosave writes into the active project slot

## Next slice

**Product hardening:** cloud/sync optional later; for now keep local-first. Orchestrator nodes, sandboxed HTTP, or catalog codegen remain open.

## Vertical slice: Big Blocks

**Goal:** Opinionated multi-technology composite nodes with OSS defaults, optional cloud URI/secret-name bindings, and a customizable template footer.

### Definition of done

- [x] Category `big-blocks` with 18 composite node types
- [x] Shared OSS stack + local/hybrid/cloud + URI + tokenSecretName + customTemplate fields
- [x] Mirrored Python catalog, export lineage, IDE Run skip, secret-embedding validation
- [x] Palette section + docs/ADR 0010

## Next slice

**Product hardening:** optional Big Block example projects, sandboxed HTTP, or TS→Python catalog codegen.
