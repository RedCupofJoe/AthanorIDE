# `@athanor/node-definitions`

Declarative catalog of canvas nodes: ports, configuration fields, documentation, icons, and export behavior.

**This package is the authoring source of truth.** The API mirrors summaries in `apps/api/athanor_api/catalog.py` for offline validation/export.

## Categories

| Category | Prefix | Examples |
| --- | --- | --- |
| Foundation | `foundation.*` | Text Input, Python Transform, Portals, Secrets |
| Fine-tuning | `fine_tuning.*` | Dataset Loader, LoRA Trainer |
| Vision | `vision.*` | Image Input, Preprocessor, Vision Model |
| Multi-agent | `multi_agent.*` | Agent, Tool Definition, MCP Server |
| Enterprise | `enterprise.*` | Policy Guardrail, Audit Log, Identity Reference |
| Big Blocks | `big_blocks.*` | Opinionated multi-tech composites (gateway, RAG, UI, harness, …) |

Human-readable reference: [docs/node-catalog.md](../../docs/node-catalog.md).

## Anatomy of a `NodeDefinition`

```ts
{
  type: "foundation.text_input",
  displayName: "Text Input",
  description: "…",           // short palette blurb
  documentation: "…",         // how-to paragraph
  category: "foundation",
  version: "1.0.0",
  icon: "type",               // lucide key mapped in the web app
  exportKind: "pipeline_text_source",
  inputs: [/* portTemplate(...) */],
  outputs: [/* portTemplate(...) */],
  configurationFields: [/* inspector form fields */],
}
```

`createNodeFromDefinition(type, position)` materializes an `ArchitectureNode` with port ids and default config.

## Adding a node (checklist)

1. Add the definition under the right category folder (`src/foundation`, `vision`, …).
2. Export it from `src/index.ts` into `NODE_DEFINITIONS`.
3. Mirror a `NodeCatalogEntry` in `apps/api/athanor_api/catalog.py` (required config + export kind).
4. Add validation rules in `validation/engine.py` if needed.
5. Teach export IR / templates if the node should emit lineage or stubs.
6. Decide IDE **execute** behavior (`execution/engine.py`) — often `skipped` for lineage-only nodes.
7. Map the icon in `NodePalette.tsx` / `FoundationNode.tsx`.
8. Extend tests (catalog length assertions, validation, export).

## Development

```bash
pnpm --filter @athanor/node-definitions build
pnpm --filter @athanor/node-definitions test
```

## Related ADRs

- [0005 — Expanded node catalog](../../docs/decisions/0005-expanded-node-catalog.md)
- [0008 — Vision / multi-agent / enterprise expansion](../../docs/decisions/0008-catalog-expansion.md)
- [0010 — Big Blocks opinionated composites](../../docs/decisions/0010-big-blocks.md)
