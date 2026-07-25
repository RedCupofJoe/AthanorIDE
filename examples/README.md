# Examples

Sample architectures and walkthroughs for AthanorIDE.

## In the IDE (recommended)

On the home page (`/`), use **Examples** to create:

| Example | What it demonstrates |
| --- | --- |
| RAG pipeline | Query → prompt + retrieve/answer → policy → viewer, with retrieval lineage |
| Vision fine-tuning | Dataset → LoRA trainer, plus image → preprocess → vision model → viewer |
| Text transform | Classic Text Input → Python Transform → Output Viewer |

Builders live in `apps/web/lib/example-projects.ts`.

## Text transformation (exported repo)

See [text-transformation/README.md](./text-transformation/README.md) for validating, exporting, and running the generated FastAPI container.

Golden fixture: `packages/contracts/fixtures/text-transform.v1.json`.
