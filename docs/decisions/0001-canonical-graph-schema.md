# ADR 0001: Canonical Graph Schema Strategy

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** AthanorIDE engineering

## Context

The canvas represents a typed, executable architecture graph. Frontend (TypeScript/Zod) and backend (Python/Pydantic) must share the same domain model. Schema drift between the two runtimes would silently break validation, persistence, and export.

Requirements:

- Human-readable JSON persistence
- Explicit schema version from day one
- Migration path for future versions
- No proprietary schema registry
- Testable parity between TypeScript and Python

## Decision

Use **versioned JSON Schema as the shared source of truth**, with language-specific mirrors and contract tests.

1. **Canonical artifact:** `packages/contracts/schema/architecture-graph.v1.schema.json`
2. **TypeScript mirror:** Zod schemas and exported types in `packages/contracts` that validate the same shape
3. **Python mirror:** Pydantic v2 models in `apps/api/schemas` that validate the same shape
4. **Parity enforcement:** Both stacks load golden fixtures and the JSON Schema in automated tests. CI fails if either mirror accepts/rejects fixtures differently from the canonical schema.
5. **Versioning:** Every persisted project includes `schemaVersion` (e.g. `"1.0.0"`). Migrations live in `packages/contracts/migrations` (TS) and `apps/api/schemas/migrations` (Python) and are applied on load.
6. **Change control:** Any change to the canonical schema requires an ADR update or a new ADR, fixture updates, and dual-mirror updates in the same PR.

Phase 0 ships schema `1.0.0` with the minimal graph envelope (metadata, nodes, edges, ports, viewport, empty extension points for macros/portals/validation/export). Later phases extend the schema rather than replacing it silently.

## Alternatives considered

### Generate both languages from one IDL (Protobuf / OpenAPI-only)

- **Pros:** Single codegen path
- **Cons:** Graph documents are JSON documents, not RPC payloads; Protobuf is a poor fit for optional UI metadata and progressive schema growth; extra toolchain for little Phase 0 value

### TypeScript Zod as sole source, generate Python

- **Pros:** Frontend-owned iteration speed
- **Cons:** Codegen to Pydantic is non-trivial; Python API would lag; JSON Schema remains needed for persistence docs anyway

### Duplicate models with manual review only

- **Pros:** Fastest to start
- **Cons:** High drift risk; rejected because validation and export correctness depend on shared semantics

## Consequences

- Adding a field means updating JSON Schema, Zod, Pydantic, fixtures, and migrations together.
- Early versions stay conservative: prefer additive, optional fields.
- Export and compiler features consume the same graph document the UI persists.
- Users can inspect and edit project JSON with standard tools because the format is documented JSON Schema.

## Follow-ups

- Phase 1: flesh out node/port/edge validation rules against this schema
- Phase 2+: exporter consumes `schemaVersion` and embeds `docs/generated-graph.json`
- When schema generation tooling is justified, prefer generating TS/Python from the JSON Schema rather than inventing a new IDL
