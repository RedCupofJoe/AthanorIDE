#!/usr/bin/env bash
# Bootstrap project-local pnpm and uv into .tools/ (no host-global install required).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/.tools"
mkdir -p "${TOOLS_DIR}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_pnpm() {
  if need_cmd pnpm; then
    echo "pnpm: $(command -v pnpm) ($(pnpm -v))"
    return
  fi
  if [[ -x "${TOOLS_DIR}/pnpm" ]]; then
    echo "pnpm: ${TOOLS_DIR}/pnpm ($("${TOOLS_DIR}/pnpm" -v))"
    return
  fi
  if ! need_cmd npm || ! need_cmd node; then
    echo "Node.js and npm are required to bootstrap pnpm." >&2
    exit 1
  fi
  echo "Installing project-local pnpm into .tools/"
  npm pack pnpm --pack-destination "${TOOLS_DIR}" >/dev/null
  tar -xzf "${TOOLS_DIR}"/pnpm-*.tgz -C "${TOOLS_DIR}"
  cat > "${TOOLS_DIR}/pnpm" <<'EOF'
#!/usr/bin/env bash
exec node "$(dirname "$0")/package/bin/pnpm.cjs" "$@"
EOF
  chmod +x "${TOOLS_DIR}/pnpm"
  echo "pnpm: ${TOOLS_DIR}/pnpm ($("${TOOLS_DIR}/pnpm" -v))"
}

ensure_uv() {
  if need_cmd uv; then
    echo "uv: $(command -v uv) ($(uv --version))"
    return
  fi
  if [[ -x "${TOOLS_DIR}/uv" ]]; then
    echo "uv: ${TOOLS_DIR}/uv ($("${TOOLS_DIR}/uv" --version))"
    return
  fi
  if ! need_cmd python3; then
    echo "python3 is required to bootstrap uv." >&2
    exit 1
  fi
  echo "Installing project-local uv into .tools/"
  python3 -m pip install --target "${TOOLS_DIR}/py" uv >/dev/null
  if [[ -x "${TOOLS_DIR}/py/bin/uv" ]]; then
    ln -sfn "${TOOLS_DIR}/py/bin/uv" "${TOOLS_DIR}/uv"
  else
    cat > "${TOOLS_DIR}/uv" <<'EOF'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="${DIR}/py${PYTHONPATH:+:$PYTHONPATH}"
exec python3 -m uv "$@"
EOF
    chmod +x "${TOOLS_DIR}/uv"
  fi
  echo "uv: ${TOOLS_DIR}/uv ($("${TOOLS_DIR}/uv" --version))"
}

ensure_pnpm
ensure_uv
