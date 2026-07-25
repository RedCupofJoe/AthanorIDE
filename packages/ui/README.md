# `@athanor/ui`

Shared UI primitives for AthanorIDE packages and the web app.

Keep this package thin: prefer product-specific composition in `apps/web`. Export reusable building blocks from `src/index.ts` when multiple surfaces need the same primitive.

## Development

```bash
pnpm --filter @athanor/ui build
pnpm --filter @athanor/ui typecheck
```
