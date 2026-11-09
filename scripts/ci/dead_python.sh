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
VULTURE=vulture==2.14
args=(services ml scripts scripts/ci/vulture_allow.py --min-confidence 80
  --exclude '*/generated/*,*/node_modules/*,*/target/*,*/.venv/*')
if command -v uvx >/dev/null; then
  exec uvx -q "$VULTURE" "${args[@]}"
fi
exec pipx run --spec "$VULTURE" vulture "${args[@]}"
