#!/usr/bin/env bash
# Start AthanorIDE services with rootless Podman (no docker-compose plugin required).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v podman >/dev/null 2>&1; then
  echo "Podman is required for make podman-up." >&2
  exit 1
fi

API_IMAGE="${ATHANOR_API_IMAGE:-localhost/athanor-api:dev}"
WEB_IMAGE="${ATHANOR_WEB_IMAGE:-localhost/athanor-web:dev}"
API_NAME="${ATHANOR_API_NAME:-athanor-api}"
WEB_NAME="${ATHANOR_WEB_NAME:-athanor-web}"
API_PORT="${ATHANOR_API_PORT:-8000}"
WEB_PORT="${ATHANOR_WEB_PORT:-3000}"
NETWORK="${ATHANOR_NETWORK:-athanor-net}"

echo "==> Ensuring network ${NETWORK}"
podman network exists "${NETWORK}" 2>/dev/null || podman network create "${NETWORK}"

echo "==> Building API image"
podman build -t "${API_IMAGE}" --target api -f Containerfile .

echo "==> Building web image"
podman build -t "${WEB_IMAGE}" --target web -f Containerfile .

if podman container exists "${API_NAME}"; then
  echo "==> Removing existing ${API_NAME}"
  podman rm -f "${API_NAME}" >/dev/null
fi
if podman container exists "${WEB_NAME}"; then
  echo "==> Removing existing ${WEB_NAME}"
  podman rm -f "${WEB_NAME}" >/dev/null
fi

echo "==> Starting ${API_NAME} on :${API_PORT}"
podman run -d \
  --name "${API_NAME}" \
  --network "${NETWORK}" \
  -p "${API_PORT}:8000" \
  "${API_IMAGE}"

echo "==> Starting ${WEB_NAME} on :${WEB_PORT}"
podman run -d \
  --name "${WEB_NAME}" \
  --network "${NETWORK}" \
  -p "${WEB_PORT}:3000" \
  -e "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:${API_PORT}" \
  "${WEB_IMAGE}"

echo "API health: http://127.0.0.1:${API_PORT}/api/v1/health"
echo "Web UI:     http://127.0.0.1:${WEB_PORT}"
