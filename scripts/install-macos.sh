#!/usr/bin/env bash
# Guide macOS users through prerequisites, then run the normal project install.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS. On Linux or Windows, use the root README instructions." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) echo "Detected Apple Silicon Mac (arm64)." ;;
  x86_64) echo "Detected Intel or Rosetta macOS (x86_64)." ;;
  *) echo "Unsupported Mac architecture: $(uname -m)." >&2; exit 1 ;;
esac

if ! command -v brew >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Homebrew is needed to offer automatic Node.js and Python setup.
Install Homebrew from https://brew.sh, open a new Terminal, then run this installer again.
EOF
  exit 1
fi

BREW_PREFIX="$(brew --prefix)"
export PATH="${BREW_PREFIX}/opt/python@3.12/libexec/bin:${BREW_PREFIX}/bin:${BREW_PREFIX}/sbin:${PATH}"

missing_formulas=()
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]]; then
  missing_formulas+=(node)
fi
# Accept only a native-architecture Python. An x86_64 3.12 on Apple Silicon
# satisfies a version check and then fails while linking cryptography.
if ! bash "${ROOT_DIR}/scripts/resolve-python.sh" >/dev/null 2>&1; then
  missing_formulas+=(python@3.12)
fi

if ((${#missing_formulas[@]} > 0)); then
  echo "AthanorIDE needs Node.js 20+ and Python 3.12+. Missing Homebrew packages: ${missing_formulas[*]}"
  if [[ ! -t 0 ]]; then
    echo "Run: brew install ${missing_formulas[*]}" >&2
    exit 1
  fi
  read -r -p "Install these packages with Homebrew now? [y/N] " answer
  case "${answer}" in
    y|Y|yes|YES) brew install "${missing_formulas[@]}" ;;
    *) echo "Install the listed packages, then run this script again."; exit 1 ;;
  esac
fi

export PATH="${BREW_PREFIX}/opt/python@3.12/libexec/bin:${BREW_PREFIX}/bin:${BREW_PREFIX}/sbin:${PATH}"
if ! command -v make >/dev/null 2>&1; then
  cat >&2 <<'EOF'
The macOS Make tool is missing. Install Apple's Command Line Tools, then run this installer again:
  xcode-select --install
EOF
  exit 1
fi

for tool in bash git tar node npm python3; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "Required command not found: ${tool}" >&2
    exit 1
  fi
done

PYTHON_BIN="$(bash "${ROOT_DIR}/scripts/resolve-python.sh")"
export UV_PYTHON="${PYTHON_BIN}"
echo "Using Node.js $(node --version), Python $("${PYTHON_BIN}" --version) ($("${PYTHON_BIN}" -c 'import platform; print(platform.machine())')), and Make at $(command -v make)."
echo "Installing AthanorIDE dependencies and building shared packages..."
# The bootstrapper uses pip --target to put uv under the repository's .tools/ directory.
export PIP_BREAK_SYSTEM_PACKAGES=1
make -C "${ROOT_DIR}" install
cat <<'EOF'

Install complete. Start the local IDE with:
  make dev

Then open http://localhost:3000 in your browser. Stop the services with Ctrl+C.
EOF
