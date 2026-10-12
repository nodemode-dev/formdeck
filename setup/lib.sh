#!/usr/bin/env bash
FORMDECK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORMDECK_ROOT
for _fd_key in PORT HOST DATA_DIR TARGET DIST CORS_ORIGINS CALLER_DIR MCP_AUTOSTART; do
  _fd_old="FORMSLD_${_fd_key}"
  _fd_new="FORMDECK_${_fd_key}"
  if [ -z "${!_fd_new:-}" ] && [ -n "${!_fd_old:-}" ]; then export "${_fd_new}=${!_fd_old}"; fi
done
unset _fd_key _fd_old _fd_new
fd_say() { printf '[formdeck] %s\n' "$*"; }
fd_die() { printf '[formdeck] error: %s\n' "$*" >&2; exit 1; }
fd_os() {
  case "$(uname -s 2>/dev/null)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}
fd_python() {
  local c
  for c in python3.14 python3.13 python3.12 python3 python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
      echo "$c"
      return 0
    fi
  done
  return 1
}
fd_venv() {
  local act="$FORMDECK_ROOT/backend/venv/bin/activate"
  [ -f "$act" ] || act="$FORMDECK_ROOT/backend/venv/Scripts/activate"
  [ -f "$act" ] || fd_die "backend venv missing, run ./formdeck install"
  # shellcheck disable=SC1090
  source "$act"
}
fd_target_triple() {
  if [ -n "${FORMDECK_TARGET:-}" ]; then echo "$FORMDECK_TARGET"; return 0; fi
  command -v rustc >/dev/null 2>&1 || return 1
  rustc -vV | awk '/^host:/ {print $2}'
}
fd_exe() { [ "$(fd_os)" = windows ] && echo ".exe" || echo ""; }
