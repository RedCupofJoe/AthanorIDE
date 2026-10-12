#!/usr/bin/env bash
# Print a Python 3.12+ interpreter whose architecture matches this machine.
# An x86_64 interpreter on Apple Silicon (for example Intel Anaconda) makes
# uv build wheels for x86_64. Current Command Line Tools ship an arm64-only
# libxcrun, so that link fails.
set -euo pipefail

HOST_ARCH="$(uname -m)"
if [[ "$(uname -s)" == "Darwin" ]]; then
  apple_silicon="$(sysctl -n hw.optional.arm64 2>/dev/null || true)"
  if [[ "${apple_silicon}" == "1" ]]; then
    HOST_ARCH="arm64"
  fi
fi

WRONG_ARCH_PYTHON=""

try_python() {
  local candidate="$1"
  local resolved="${candidate}"
  if [[ "${candidate}" != */* ]]; then
    resolved="$(command -v "${candidate}" 2>/dev/null || true)"
  fi
  if [[ -z "${resolved}" || ! -x "${resolved}" ]]; then
    return 1
  fi
  if ! "${resolved}" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1; then
    return 1
  fi
  local arch
  arch="$("${resolved}" -c 'import platform; print(platform.machine())' 2>/dev/null || true)"
  if [[ "${arch}" != "${HOST_ARCH}" ]]; then
    if [[ -z "${WRONG_ARCH_PYTHON}" ]]; then
      WRONG_ARCH_PYTHON="${resolved} (${arch:-unknown})"
    fi
    return 1
  fi
  printf '%s\n' "${resolved}"
  exit 0
}

if [[ -n "${UV_PYTHON:-}" ]]; then
  if ! try_python "${UV_PYTHON}"; then
    echo "UV_PYTHON=${UV_PYTHON} is not a ${HOST_ARCH} Python 3.12+." >&2
    exit 1
  fi
fi

brew_prefix=""
if command -v brew >/dev/null 2>&1; then
  brew_prefix="$(brew --prefix 2>/dev/null || true)"
fi
if [[ -z "${brew_prefix}" && -d /opt/homebrew/opt ]]; then
  brew_prefix="/opt/homebrew"
elif [[ -z "${brew_prefix}" && -d /usr/local/opt ]]; then
  brew_prefix="/usr/local"
fi

if [[ -n "${brew_prefix}" ]]; then
  for version in 3.12 3.13 3.14; do
    try_python "${brew_prefix}/opt/python@${version}/bin/python${version}" || true
    try_python "${brew_prefix}/opt/python@${version}/libexec/bin/python3" || true
  done
fi

IFS=':' read -r -a path_dirs <<< "${PATH}"
for dir in "${path_dirs[@]}"; do
  [[ -n "${dir}" ]] || continue
  for name in python3.12 python3.13 python3.14 python3; do
    try_python "${dir}/${name}" || true
  done
done

echo "No ${HOST_ARCH} Python 3.12+ is available." >&2
if [[ -n "${WRONG_ARCH_PYTHON}" ]]; then
  echo "Skipped ${WRONG_ARCH_PYTHON}. That architecture cannot link native packages such as cryptography with this machine's Command Line Tools." >&2
fi
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "Install a native interpreter with: brew install python@3.12" >&2
else
  echo "Install Python 3.12+ for ${HOST_ARCH}." >&2
fi
exit 1
