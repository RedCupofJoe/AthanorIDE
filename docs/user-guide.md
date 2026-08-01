# AthanorIDE user guide

This guide explains how to use the IDE day-to-day. For node-by-node details see [node-catalog.md](./node-catalog.md).

## Projects

Projects are **local to the browser**. They persist across restarts via `localStorage` and are not uploaded to the API unless you Validate, Run, Compile, or Export.

### Home (`/`)

- **New** — empty project
- **Examples** — RAG pipeline, vision fine-tuning, text transform starters
- **Open / Rename / Delete** — manage the library
- **Open last project** — jumps to the active project in the editor

### Editor (`/editor/[projectId]`)

Autosave writes the open graph into the project slot after edits (debounced). Use the toolbar **Projects** link to return home.

## Canvas basics

| Action | How |
| --- | --- |
| Add a node | Palette: click once to select, click again to place (or double-click). Toggle **Compact** to hide descriptions. |
| Connect | Drag from an output handle (right) to a compatible input (left). Hover ports for contract tooltips. |
| Select | Click a node; Shift+click for multi-select. Click a **wire** to select only that connection. |
| Delete connection | Click the wire → Delete/Backspace (or **Delete connection** in the inspector) → confirm. Nodes stay. |
| Delete node | Select the node → Delete/Backspace → confirm in the **right inspector** |
| Undo / Redo | Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Shift+Z) |
| Duplicate | Ctrl/Cmd+D |
| Search | Toolbar search focuses matching nodes |
| Zoom LOD | Zoom out for macro view; mid/micro show more port detail |

## Validation, run, compile, export

1. **Validate** — configuration, required fields, port contracts, portal buses, deployment boundaries.
2. **Run** — safe IDE execution for payload inspection. Compiled Python transforms use the Podman sandbox; secrets return `[redacted:…]`; HTTP nodes are skipped by default.
3. **Compile transform** (inspector, Python Transformation) — NL → sandboxed Python via the mock/provider compiler.
4. **Export repo** — ZIP with FastAPI app, tests, Containerfile, docs. Optional toggles: Kubernetes, OpenShift, Terraform, Docker-compat naming.

Graph JSON import/export is also available from the toolbar (imports join the project library).

### Infrastructure pull tokens

Toolbar **Infra tokens** opens project-level slots for registry credentials (Hugging Face, Kaggle, Docker Hub, GitHub, UCI Machine Learning, PyTorch Hub). Use the dropdown to add custom slots. Enter the **secret name** (e.g. `HF_TOKEN`), not the token value. Individual nodes still have their own `tokenSecretName` (or similar) fields for service endpoints.

### Local vault

Toolbar **Local vault** stores secret **values** encrypted on the API host (passphrase-locked). Use it to:

1. Unlock / add values keyed by the same secret names used in Infra tokens or nodes.
2. Check **Graph coverage** (present / missing).
3. **Materialize .env** to an absolute path next to an exported project, then run compose / `scripts/run-local.sh`.

IDE Run still redacts secrets in the canvas. Export ZIPs never include `.env`.

## Macros, portals, swimlanes

- **Macro** — select nodes → Collapse macro; expands later from the inspector or node.
- **Portals** — Portal Output / Input share a `busId` to hop data without long edges.
- **Swimlanes** — deployment environments (e.g. Kubernetes). Nodes inherit targets; cross-env edges are validated.

## Tips

- Prefer **Validate** before **Run** or **Export**.
- Never put secret values in Secret Reference or Identity Reference configuration.
- Fine-tuning, vision inference, multi-agent, and enterprise nodes are primarily **lineage** for architecture docs; many do not execute inside the IDE Run path.
