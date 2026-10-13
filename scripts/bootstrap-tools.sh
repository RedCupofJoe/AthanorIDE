#!/usr/bin/env bash
# Bootstrap project-local pnpm and uv into .tools/ (no host-global install required).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/.tools"
PNPM_VERSION="9.15.0"
mkdir -p "${TOOLS_DIR}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_pnpm() {
  if [[ -x "${TOOLS_DIR}/pnpm" ]]; then
    local installed_version
    installed_version="$("${TOOLS_DIR}/pnpm" -v 2>/dev/null || true)"
    if [[ "${installed_version}" == "${PNPM_VERSION}" ]]; then
      echo "pnpm: ${TOOLS_DIR}/pnpm (${installed_version})"
      return
    fi
    echo "Replacing project-local pnpm ${installed_version:-unknown} with pinned ${PNPM_VERSION}."
  fi
  if ! need_cmd npm || ! need_cmd node; then
    echo "Node.js and npm are required to bootstrap pnpm." >&2
    exit 1
  fi
  echo "Installing project-local pnpm ${PNPM_VERSION} into .tools/"
  rm -rf "${TOOLS_DIR}/package"
  npm pack "pnpm@${PNPM_VERSION}" --pack-destination "${TOOLS_DIR}" >/dev/null
  tar -xzf "${TOOLS_DIR}/pnpm-${PNPM_VERSION}.tgz" -C "${TOOLS_DIR}"
  if [[ ! -f "${TOOLS_DIR}/package/bin/pnpm.cjs" ]]; then
    echo "The pnpm ${PNPM_VERSION} archive is missing package/bin/pnpm.cjs." >&2
    exit 1
  fi
  cat > "${TOOLS_DIR}/pnpm" <<'EOF'
#!/usr/bin/env bash
TOOLS_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${TOOLS_DIR}/package/bin/pnpm.cjs" "$@"
EOF
  chmod +x "${TOOLS_DIR}/pnpm"
  local installed_version
  installed_version="$("${TOOLS_DIR}/pnpm" -v)"
  if [[ "${installed_version}" != "${PNPM_VERSION}" ]]; then
    echo "Expected pnpm ${PNPM_VERSION}, but the project-local launcher reported ${installed_version}." >&2
    exit 1
  fi
  echo "pnpm: ${TOOLS_DIR}/pnpm (${installed_version})"
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
  local python_bin
  python_bin="$(bash "${ROOT_DIR}/scripts/resolve-python.sh")"
  echo "Installing project-local uv into .tools/ with ${python_bin}"
  "${python_bin}" -m pip install --target "${TOOLS_DIR}/py" uv >/dev/null
  if [[ -x "${TOOLS_DIR}/py/bin/uv" ]]; then
    ln -sfn "${TOOLS_DIR}/py/bin/uv" "${TOOLS_DIR}/uv"
  else
    cat > "${TOOLS_DIR}/uv" <<EOF
#!/usr/bin/env bash
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
export PYTHONPATH="\${DIR}/py\${PYTHONPATH:+:\$PYTHONPATH}"
exec ${python_bin} -m uv "\$@"
EOF
    chmod +x "${TOOLS_DIR}/uv"
  fi
  echo "uv: ${TOOLS_DIR}/uv ($("${TOOLS_DIR}/uv" --version))"
}

ensure_pnpm
ensure_uv
