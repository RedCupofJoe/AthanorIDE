# ADR 0010: Big Blocks opinionated composites

## Status

Accepted

## Context

Architects often need multi-technology assemblies (gateways, RAG variants, local object storage, UIs, runtimes, harnesses) without wiring dozens of atomic nodes. AthanorIDE remains local-first and must never embed cloud tokens in the graph.

## Decision

1. Add category **`big-blocks`** (`big_blocks.*`) for opinionated composite nodes.
2. Each Big Block includes:
   - three popular **open-source** stack options (select),
   - **deployment mode** (`local` | `hybrid` | `cloud`),
   - optional **cloud provider**, **endpoint URI**, and **token secret name** (name only),
   - bottom **custom template** (`useCustomTemplate` + `customTemplate`) for full overrides.
3. Export as `exportKind: big_blocks` lineage; IDE **Run** skips these nodes.
4. Validation rejects embedded secret keys, overly long `tokenSecretName` values, and secret-like content inside `customTemplate`. Export redacts matching spans as defense-in-depth.

## Consequences

- Palette gains a Big Blocks section with 18 starters.
- Atomic foundation/vision/multi-agent nodes remain available for fine-grained graphs.
- Runtime provisioning of MinIO/Ollama/etc. is out of band — the graph records intent and config.
