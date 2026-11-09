#!/usr/bin/env bash
# Points this checkout's git at scripts/dev/hooks, so the pre-push hook's quick
# checks run before every push. Run once per clone; worktrees share the
# clone's settings, and each runs the hook from its own scripts/dev/hooks.
#
#   scripts/dev/install-hooks.sh            install
#   scripts/dev/install-hooks.sh --remove   back to git's own .git/hooks
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ "${1:-}" = "--remove" ]; then
  git config --unset core.hooksPath || true
  git config --unset blame.ignoreRevsFile || true
  echo "git hooks: back to .git/hooks"
else
  chmod +x scripts/dev/hooks/*
  git config core.hooksPath scripts/dev/hooks
  # git blame past the whole-tree reformats (.git-blame-ignore-revs).
  [ ! -f .git-blame-ignore-revs ] || git config blame.ignoreRevsFile .git-blame-ignore-revs
  echo "git hooks: scripts/dev/hooks (pre-push runs the quick checks; skip with --no-verify or SKIP_HOOKS=1)"
fi
