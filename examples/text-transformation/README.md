# Text Transformation Example

Minimal three-node pipeline used as the Phase-1 vertical slice and still the fastest smoke path.

## On the canvas

1. From **Examples**, open **Text transform**, *or* add nodes manually:
   - **Text Input** — set a sample value
   - **Python Transformation** — e.g. `uppercase the input`
   - **Output Viewer**
2. Connect `text` → `text` ports between the three nodes.
3. **Validate**, then **Run** (payload should show the transformed string).
4. Optionally **Compile transform**, then **Export repo**.

## What each node does

| Node | Role |
| --- | --- |
| Text Input | STRING source (`configuration.value`) |
| Python Transformation | NL instruction → deterministic classifier or sandboxed compiled code |
| Output Viewer | Sink that displays the final STRING in Run / export docs |

Full catalog: [docs/node-catalog.md](../../docs/node-catalog.md).

## Exported repository

The ZIP contains a FastAPI app, `Containerfile`, `compose.yaml`, and tests.

```bash
unzip text-transformation-example.zip -d exported-project
cd exported-project
podman build -t text-transformation-example -f Containerfile .
podman run --rm -p 8080:8080 text-transformation-example
curl -s http://127.0.0.1:8080/health
curl -s -X POST http://127.0.0.1:8080/v1/run \
  -H 'content-type: application/json' \
  -d '{"text":"hello"}'
```

Golden fixture: `packages/contracts/fixtures/text-transform.v1.json`
