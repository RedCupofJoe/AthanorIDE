# ADR 0009: Multi-project local library

## Status

Accepted

## Context

AthanorIDE previously persisted a single architecture graph under one localStorage key. Architects need multiple named projects that survive browser restarts, with a home-page list to create/open/rename/delete.

## Decision

1. Store an index at `athanoride.projects.index.v1` and per-project bodies at `athanoride.project.<id>.v1`.
2. Migrate the legacy `athanoride.project.v1` key into the library on first access.
3. Route editors as `/editor/[projectId]`; `/editor` redirects to the active project (or creates one).
4. Home page (`/`) hosts a Projects sidebar for library management.
5. Autosave continues to write the open graph into the keyed body + index.

## Consequences

- Projects are device-local (browser storage), not synced to a server.
- Clearing site data deletes the library.
- Import JSON upserts into the library by `project.id`.
