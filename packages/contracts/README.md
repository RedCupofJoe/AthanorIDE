# `@athanor/contracts`

Canonical architecture-graph schema and TypeScript types for AthanorIDE.

## What this package owns

| Artifact | Purpose |
| --- | --- |
| `schema/architecture-graph.v1.schema.json` | JSON Schema source of truth |
| `src/index.ts` | Zod schemas, TS types, `createEmptyGraph`, `parseArchitectureGraph` |
| `src/compatibility.ts` | Port contract compatibility (`STRING`↔`STRING`, `ANY`, …) |
| `fixtures/` | Golden graphs for tests and examples |

## Contract types

Ports use a closed enum (`STRING`, `PROMPT`, `IMAGE`, `DATASET`, `TOOL_DEFINITION`, …). Connections require an exact match or `ANY` on either side — no silent coercion.

See [docs/node-catalog.md](../../docs/node-catalog.md) for how nodes use these types.

## Usage

```ts
import {
  parseArchitectureGraph,
  createEmptyGraph,
  areContractsCompatible,
} from "@athanor/contracts";
```

## Development

```bash
pnpm --filter @athanor/contracts build
pnpm --filter @athanor/contracts test
```

Schema migrations notes: [migrations/README.md](./migrations/README.md).

## Related ADR

[0001 — Canonical Graph Schema Strategy](../../docs/decisions/0001-canonical-graph-schema.md)
