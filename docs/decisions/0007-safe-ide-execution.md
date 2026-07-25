# ADR 0007: Safe IDE graph execution for payload inspection

## Status

Accepted (execution/debug vertical slice)

## Context

Architects need to inspect data flowing between nodes without exporting and running a full project. Generated/compiled transform code must never execute on the API host.

## Decision

1. Add `POST /api/v1/projects/execute` that walks the architecture graph in topological order and returns per-node steps, edge payloads, and final sink outputs.
2. **Compiled transforms** run only in the existing Podman sandbox; on sandbox skip, fall back to the Phase-2 classifier.
3. **Uncompiled transforms** use only the deterministic classifier (`uppercase` / `lowercase` / `strip` / `identity`).
4. **Secret Reference** always returns `[redacted:name]` — never environment or vault values.
5. **HTTP Request** is skipped by default (no host network).
6. **Portal buses** participate via virtual topo edges so outputs publish before matching inputs.
7. The UI exposes Run, an Execution panel, node payload previews, and edge payload labels.

## Consequences

- IDE debug works locally without OpenShift/Kubernetes.
- Fine-tuning and HTTP nodes remain non-executing in this slice.
- Users still Validate before Run for graphs with configuration errors.
