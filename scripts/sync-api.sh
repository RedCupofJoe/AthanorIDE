#!/usr/bin/env bash
# Create the API virtual environment with a native-architecture Python.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UV="${UV:-${ROOT_DIR}/.tools/uv}"
python_bin="$(bash "${ROOT_DIR}/scripts/resolve-python.sh")"
venv_python="${ROOT_DIR}/apps/api/.venv/bin/python"

if [[ -x "${venv_python}" ]]; then
  venv_arch="$("${venv_python}" -c 'import platform; print(platform.machine())')"
  host_arch="$("${python_bin}" -c 'import platform; print(platform.machine())')"
  if [[ "${venv_arch}" != "${host_arch}" ]]; then
    echo "==> Replacing ${venv_arch} API virtual environment with ${host_arch}"
    rm -rf "${ROOT_DIR}/apps/api/.venv"
  fi
fi

python_version="$("${python_bin}" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
python_arch="$("${python_bin}" -c 'import platform; print(platform.machine())')"
echo "==> Installing Python API dependencies with uv (${python_bin}, ${python_version}, ${python_arch})"
exec "${UV}" sync --directory "${ROOT_DIR}/apps/api" --extra dev --python "${python_bin}"
