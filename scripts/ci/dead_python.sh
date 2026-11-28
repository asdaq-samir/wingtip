#!/usr/bin/env bash
# No unused Python: vulture over every service, ml/ and scripts/ at 80%
# confidence (unused imports, variables and unreachable code; at lower
# confidence it takes FastAPI's routes and pytest's fixtures for dead).
# The names it cannot see the use of are in scripts/ci/vulture_allow.py,
# each with why. Generated code is left out: what writes it decides it.
# Seconds. The pinned vulture through uvx, or pipx where uv is missing
# (GitHub's runners have pipx); CI and scripts/dev/check.sh's arch area run it.
set -euo pipefail
cd "$(dirname "$0")/../.."
VULTURE=vulture==2.16
args=(services ml scripts scripts/ci/vulture_allow.py --min-confidence 80
  --exclude '*/generated/*,*/node_modules/*,*/target/*,*/.venv/*')
# vulture exits 3 on dead code, the code guards.sh reads as a tool
# missing and skips: turned to 1 here, so a finding fails the guard.
run() {
  if command -v uvx >/dev/null; then
    uvx -q "$VULTURE" "${args[@]}"
  else
    pipx run --spec "$VULTURE" vulture "${args[@]}"
  fi
}
rc=0
run || rc=$?
[ "$rc" -eq 3 ] && exit 1
exit "$rc"
