#!/usr/bin/env bash
# Start API and web concurrently for local development.
# Prefer `make dev` (rebuilds shared packages first). This script also rebuilds
# contracts/node-definitions/ui so a direct `./scripts/dev.sh` cannot leave a
# stale palette/catalog dist.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/.tools"
export PATH="${TOOLS_DIR}:${TOOLS_DIR}/py/bin:${PATH}"

PNPM="$(command -v pnpm || true)"
UV="$(command -v uv || true)"
if [[ -z "${PNPM}" ]]; then PNPM="${TOOLS_DIR}/pnpm"; fi
if [[ -z "${UV}" ]]; then UV="${TOOLS_DIR}/uv"; fi

echo "==> Rebuilding shared TypeScript packages (palette/catalog)"
"${PNPM}" --filter @athanor/contracts build
"${PNPM}" --filter @athanor/node-definitions build
"${PNPM}" --filter @athanor/ui build

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "${API_PID}" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "${WEB_PID}" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "==> Starting API on :8000"
(
  cd "${ROOT_DIR}/apps/api"
  "${UV}" run uvicorn athanor_api.main:app --reload --host 127.0.0.1 --port 8000
) &
API_PID=$!

echo "==> Starting web on :3000"
(
  cd "${ROOT_DIR}"
  "${PNPM}" --filter @athanor/web dev
) &
WEB_PID=$!

echo "Web: http://127.0.0.1:3000"
echo "API: http://127.0.0.1:8000/api/v1/health"
echo "Docs: http://127.0.0.1:8000/docs"
wait
