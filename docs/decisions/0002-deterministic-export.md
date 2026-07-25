# ADR 0002: Deterministic Phase-2 Transform Export

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** AthanorIDE engineering

## Context

Phase 2 must export a runnable repository from the Phase 1 text-transformation graph before the natural-language compiler exists (Phase 3).

## Decision

1. Build an explicit export IR from the canonical graph (topo-sorted nodes, classified transforms).
2. Render files with Jinja2 templates under `athanor_api/templates/export/`.
3. Map transform instructions to a small deterministic classifier (`uppercase` / `lowercase` / `strip` / `identity`) so exported projects are executable and testable now.
4. Refuse export when graph validation reports errors.
5. Return both a file map + SHA-256 manifest and a deterministic ZIP (`archiveBase64`) with fixed ZIP timestamps.
6. Never emit `.env`; only `.env.example`.

## Consequences

- Exported Phase-2 transforms are intentionally limited; rich NL compilation is deferred to Phase 3.
- Snapshot/determinism tests can compare full file maps.
- Podman smoke tests can build the generated `Containerfile` without host code execution of untrusted user code (generated code is still reviewed/trusted for Phase-2 templates).

## Follow-ups

- Phase 3 replaces `classify_instruction` output with compiler-produced AST-validated modules while preserving the same export packaging path.
