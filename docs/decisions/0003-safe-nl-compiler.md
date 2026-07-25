# ADR 0003: Safe NL Compiler Pipeline

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** AthanorIDE engineering

## Context

Phase 3 requires compiling natural-language transformation instructions into Python without executing untrusted code on the application host, while remaining provider-agnostic.

## Decision

1. Use an abstract `ModelProvider` with a deterministic `MockModelProvider` as the default (no API keys).
2. Provider output is an intermediate `TransformationSpec`, not raw Python.
3. Codegen emits a single `transform(value: str) -> str` module from the spec.
4. Validation stages run in a bounded loop (default max 3 attempts): AST allowlist → Ruff → Mypy → rootless Podman sandbox → expectation check.
5. Every correction attempt is recorded in an `AuditRecord` (no silent “self-healing”).
6. Sandbox execution uses rootless Podman with `--network none`, read-only root, dropped caps, resource limits, and a disposable workspace.
7. Export embeds `configuration.compiledCode` when present; otherwise falls back to the Phase 2 classifier.

## Consequences

- Host Python never executes generated transforms.
- External providers (Ollama, vLLM, OpenAI-compatible) can be added behind `ModelProvider` later.
- Environments without Podman can still compile with sandbox status `skipped` unless `requireSandbox` is set.

## Follow-ups

- Add OpenAI-compatible and Ollama providers.
- Expand TransformationSpec for JSON-object pipelines beyond STRING→STRING.
