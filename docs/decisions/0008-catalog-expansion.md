# ADR 0008: Vision, multi-agent, and enterprise catalog expansion

## Status

Accepted (catalog expansion vertical slice)

## Context

ADR 0005 deferred vision / multi-agent / enterprise categories after foundation + fine-tuning starters. Architects need those categories as typed lineage nodes with validation and export documentation, without requiring IDE-side inference, agent loops, or IdP credential storage.

## Decision

1. Ship **nine lineage-first nodes**:
   - Vision: Image Input, Image Preprocessor, Vision Model
   - Multi-agent: Agent, Tool Definition, MCP Server
   - Enterprise: Policy Guardrail, Audit Log, Identity Reference
2. Extend `NodeExportKind` with `vision` / `multi_agent` / `enterprise` and emit matching sections in `docs/architecture.md`.
3. Keep IDE execution non-running for these prefixes (same posture as fine-tuning).
4. Reject embedded identity credentials (`clientSecret`, etc.) the same way Secret Reference rejects secret values.
5. Continue mirroring TypeScript definitions into Python `NODE_CATALOG`.

## Consequences

- Palette sections for vision / multi-agent / enterprise become populated.
- Export lineage grows without adding runtime pipeline steps.
- Orchestrators, live MCP connections, and vision inference remain future work.
