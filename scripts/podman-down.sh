#!/usr/bin/env bash
# Stop AthanorIDE Podman containers and optional network.
set -euo pipefail

API_NAME="${ATHANOR_API_NAME:-athanor-api}"
WEB_NAME="${ATHANOR_WEB_NAME:-athanor-web}"
NETWORK="${ATHANOR_NETWORK:-athanor-net}"
REMOVE_NETWORK="${ATHANOR_REMOVE_NETWORK:-0}"

if command -v podman >/dev/null 2>&1; then
  for name in "${WEB_NAME}" "${API_NAME}"; do
    if podman container exists "${name}" 2>/dev/null; then
      echo "==> Stopping ${name}"
      podman rm -f "${name}" >/dev/null
    fi
  done
  if [[ "${REMOVE_NETWORK}" == "1" ]] && podman network exists "${NETWORK}" 2>/dev/null; then
    echo "==> Removing network ${NETWORK}"
    podman network rm "${NETWORK}" >/dev/null || true
  fi
fi

# Also tear down compose stack if a compose provider is available.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if podman compose version >/dev/null 2>&1; then
  podman compose -f "${ROOT_DIR}/compose.yaml" down >/dev/null 2>&1 || true
elif command -v podman-compose >/dev/null 2>&1; then
  podman-compose -f "${ROOT_DIR}/compose.yaml" down >/dev/null 2>&1 || true
fi

echo "Podman stack stopped."
