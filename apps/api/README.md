# AthanorIDE API (`apps/api`)

FastAPI control plane for validation, safe graph execution, NL compilation, deterministic export, and Podman sandbox orchestration.

## Run locally

```bash
# from repository root
make install
uv run --directory apps/api uvicorn athanor_api.main:app --reload --host 0.0.0.0 --port 8000
```

Or use `make dev` to start API + web together.

| URL | Purpose |
| --- | --- |
| `GET /api/v1/health` | Liveness |
| `GET /api/v1/node-definitions` | Catalog summaries |
| `POST /api/v1/projects/validate` | Graph validation |
| `POST /api/v1/projects/execute` | Safe IDE execution / payload inspection |
| `POST /api/v1/projects/export` | Export ZIP + file map |
| `POST /api/v1/compiler/generate` | NL → TransformationSpec / code |
| `POST /api/v1/compiler/validate` | Validate generated transform |
| `/docs` | OpenAPI UI |

## Package layout

| Module | Role |
| --- | --- |
| `athanor_api/main.py` | FastAPI app & routes |
| `athanor_api/catalog.py` | Mirrored node catalog for offline validation/export |
| `athanor_api/validation/` | Static graph checks |
| `athanor_api/execution/` | Topo walk + safe node handlers |
| `athanor_api/exporter/` | IR → Jinja2 → ZIP |
| `athanor_api/compiler/` | Provider + AST allowlist + codegen |
| `athanor_api/sandbox/` | Rootless Podman runner |
| `athanor_api/templates/export/` | Exported project templates |

## Safety rules (non-negotiable)

1. **Never** execute generated/compiled transform code on the API host interpreter.
2. Compiled transforms run only in the **Podman sandbox** (or fall back to the Phase-2 classifier).
3. **Secret Reference** values are never returned by execute or written into export artifacts.
4. **HTTP Request** is skipped during IDE execute by default (no host network).

## Tests

```bash
uv run --directory apps/api pytest -q
# or from root:
make test
```

## Related docs

- [Architecture](../../docs/architecture.md)
- [Security model](../../docs/security-model.md)
- [Node catalog](../../docs/node-catalog.md)
- ADR 0002 (export), 0003 (compiler), 0007 (execution)
