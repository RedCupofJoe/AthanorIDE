# ADR 0004: Advanced canvas LOD, macros, portals, and swimlanes

## Status

Accepted (Phase 4)

## Context

Phase 1–3 established a typed, validated, exportable graph. Large architectures need higher-order canvas affordances: semantic zoom, collapse groups, logical portal hops, and deployment boundaries—without changing the canonical schema envelope.

## Decision

1. **LOD is view-only.** `lodFromZoom(viewport.zoom)` drives rendering detail. The persisted graph is unchanged by zoom.
2. **Macro blocks use the existing `macroBlocks` array.** Internal nodes remain in `nodes` with `parentMacroId`. Collapsed macros render as synthetic React Flow nodes (`macro:{id}`) with external ports derived from crossing edges. Expand/collapse toggles `collapsed`.
3. **Portal Input/Output are foundation nodes.** Bus metadata lives on node configuration and is mirrored into `portalBuses`. Logical bus links are visualized as non-editable dashed edges; validation enforces contract alignment and pairing.
4. **Deployment swimlanes use `deploymentEnvironments.bounds`.** Nodes inherit `deploymentTarget` when dragged into a lane. Cross-environment edges are styled distinctly and validated for transport/auth/network metadata.
5. **Undo history snapshots macros, portals, and environments** alongside nodes and edges.

## Consequences

- Export still focuses on the text-transform pipeline; portals/macros are structural and do not alter Phase 2/3 codegen unless present as foundation transform nodes.
- Runtime health/latency/RPS aggregates are deferred; macro LOD shows validation-derived health indicators instead of invented metrics.
- Schema version remains `1.0.0` (extension points already present).
