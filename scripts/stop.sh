#!/usr/bin/env bash
# Stop AthanorIDE API and web development processes.
# Servers listening on the dev ports are stopped even when they were started
# from another checkout. Unrelated programs on those ports are left running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${ATHANOR_DEV_API_PORT:-8000}"
WEB_PORT="${ATHANOR_DEV_WEB_PORT:-3000}"

process_cwd() {
  local pid="$1"
  lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, ""); print; exit }'
}

process_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

process_parent() {
  ps -p "$1" -o ppid= 2>/dev/null | tr -d '[:space:]'
}

belongs_here() {
  local cwd="$1"
  [[ "${cwd}" == "${ROOT_DIR}" || "${cwd}" == "${ROOT_DIR}"/* ]]
}

is_server_command() {
  local command="$1"
  [[ "${command}" == *"athanor_api.main:app"* || "${command}" == *"next dev"* || "${command}" == *"next-server"* ]]
}

is_launcher_command() {
  local command="$1"
  [[ "${command}" == *"athanor_api.main:app"* || "${command}" == *"next dev"* || "${command}" == *"next-server"* || "${command}" == *"pnpm"* || "${command}" == *"uvicorn"* || "${command}" == *"uv run"* ]]
}

pids=()
add_pid() {
  local pid="$1"
  local existing
  [[ -z "${pid}" || "${pid}" == "0" || "${pid}" == "1" || "${pid}" == "$$" || "${pid}" == "${PPID}" ]] && return
  for existing in "${pids[@]+"${pids[@]}"}"; do
    [[ "${existing}" == "${pid}" ]] && return
  done
  pids+=("${pid}")
}

add_launcher_tree() {
  local pid="$1"
  local parent command
  add_pid "${pid}"
  parent="$(process_parent "${pid}")"
  while [[ -n "${parent}" && "${parent}" != "0" && "${parent}" != "1" ]]; do
    command="$(process_command "${parent}")"
    if ! is_launcher_command "${command}"; then
      break
    fi
    add_pid "${parent}"
    parent="$(process_parent "${parent}")"
  done
}

while read -r pid command; do
  [[ -z "${pid}" ]] && continue
  cwd="$(process_cwd "${pid}" || true)"
  if is_server_command "${command}" && { belongs_here "${cwd}" || [[ "${command}" == *"${ROOT_DIR}"* ]]; }; then
    add_launcher_tree "${pid}"
  fi
done < <(ps -ax -o pid=,command=)

for port in "${API_PORT}" "${WEB_PORT}"; do
  while read -r pid; do
    [[ -z "${pid}" ]] && continue
    command="$(process_command "${pid}")"
    if is_server_command "${command}"; then
      add_launcher_tree "${pid}"
    fi
  done < <(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)
done

if [[ ${#pids[@]} -eq 0 ]]; then
  echo "No AthanorIDE development processes are running."
else
  echo "==> Stopping AthanorIDE development processes"
  for pid in "${pids[@]}"; do
    echo "    pid ${pid}: $(process_command "${pid}")"
  done
  kill "${pids[@]}" 2>/dev/null || true
  alive=()
  for _ in 1 2 3; do
    alive=()
    for pid in "${pids[@]}"; do
      if kill -0 "${pid}" 2>/dev/null; then
        alive+=("${pid}")
      fi
    done
    [[ ${#alive[@]} -eq 0 ]] && break
    sleep 1
  done
  if [[ ${#alive[@]} -gt 0 ]]; then
    kill -9 "${alive[@]}" 2>/dev/null || true
  fi
  echo "Development processes stopped."
fi

still_open=0
warn_remaining_listener() {
  local port="$1"
  local label="$2"
  local pid command
  while read -r pid; do
    [[ -z "${pid}" ]] && continue
    command="$(process_command "${pid}")"
    echo "${label} port ${port} is still in use by pid ${pid}: ${command}"
    still_open=1
  done < <(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)
}

warn_remaining_listener "${API_PORT}" "API"
warn_remaining_listener "${WEB_PORT}" "Web"
exit "${still_open}"
