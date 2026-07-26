# AthanorIDE Security Model

## Goals

- Local-first modeling without requiring cloud credentials
- Never execute untrusted or generated code on the application host
- Keep secrets out of persisted graphs and exported repositories
- Provide auditable automation for compilation and export

## Trust boundaries

| Zone | Trust | Notes |
| --- | --- | --- |
| Browser editor | User-trusted | Local project JSON; no host code execution |
| FastAPI process | Trusted control plane | Validation, templating, orchestration only |
| Compiler sandbox | Untrusted workload | Rootless Podman; network off by default |
| Exported project | User-reviewed artifacts | Runs under user control via Podman |

## Non-negotiables

1. Generated Python from the NL compiler is AST-allowlisted before any execution.
2. Execution uses rootless containers with read-only rootfs, no privileges, CPU/memory/PID/time limits, and disposable workspaces.
3. API responses never include raw stack traces or secret values.
4. Logs use correlation IDs and must not record credentials, secret material, or sensitive payloads.
5. Export emits `.env.example`, never `.env` with real secrets.
6. Compiler correction loops are bounded and every attempt is written to an audit record.
7. Project **infrastructure pull tokens** store secret **names** only (Hugging Face, Kaggle, Docker, GitHub, UCI ML, PyTorch Hub, plus custom slots). Per-node `tokenSecretName` fields remain for service-specific credentials.
8. The **local vault** (API-encrypted, passphrase-locked) may store secret **values** for local runs only. Values are never written into the architecture graph or export ZIPs; use Materialize `.env` for compose / run-local. See [ADR 0011](./decisions/0011-local-secrets-vault.md).

## Phase 3 compiler sandbox defaults

- Image: `python:3.12-slim` (configurable via `ATHANOR_SANDBOX_IMAGE`)
- `--network none`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`
- Memory/CPU/PID limits and execution timeout
- Input/output via mounted disposable workspace only
