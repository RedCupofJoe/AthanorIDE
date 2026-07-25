# ADR 0005: Declarative expanded node catalog

## Status

Accepted (Phase 5)

## Context

Phase 1–4 established a small foundation set. Phase 5 requires incremental categories where every node ships with typed ports, configuration schema, validation, documentation, export behavior, and tests—without inventing a second schema system.

## Decision

1. **TypeScript `@athanor/node-definitions` is the authoring source of truth.** Each `NodeDefinition` includes `exportKind`, ports, fields, and documentation.
2. **Python `athanor_api.catalog.NODE_CATALOG` mirrors summaries + required config** for offline API validation/export. Drift is caught by catalog length/type tests.
3. **Foundation catalog is completed** (JSON Input, Prompt Template, HTTP Request, Environment Variable, Secret Reference) alongside existing nodes.
4. **Fine-tuning starts with Dataset Loader + LoRA Trainer** as the first non-foundation category.
5. **Secrets never enter export artifacts.** Secret Reference validation rejects embedded values; exporters emit names/providers only into `.env.example` comments.
6. **Export lineage is extended** with node catalog docs, env bindings, HTTP client stubs, prompt templates, and fine-tuning hyperparameter snapshots—without requiring every node to participate in the text-transform runtime.

## Consequences

- Vision / multi-agent / enterprise categories were deferred; later delivered in ADR 0008.
- HTTP client stubs are generated only when HTTP Request nodes exist.
- Catalog mirroring is manual; a future codegen step can sync TS → Python if drift becomes costly.
