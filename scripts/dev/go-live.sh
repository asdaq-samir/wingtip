#!/usr/bin/env bash
# Put a branch live on the owner's local stack for them to try on the
# phone, before any lengthy test or CI (CLAUDE.md, Branches: "Live for
# the owner first"). The stack runs from its own worktree,
# ~/Developer/wingtip-live, so the main checkout stays on main; data/,
# .env and the local HTTPS certificates are linked from the main
# checkout, and the compose project is the same (wingtip), so the
# phone's address and the saved data don't change.
#
#   scripts/dev/go-live.sh                 claude/integration
#   scripts/dev/go-live.sh <branch>        another branch
set -euo pipefail
branch=${1:-claude/integration}
# The main checkout: from the script's own repo, or the current
# directory's when the script is run from a copy.
main=$(git -C "$(dirname "$0")/../.." rev-parse --path-format=absolute --git-common-dir 2>/dev/null \
  || git rev-parse --path-format=absolute --git-common-dir)
main=${main%/.git}
live=${WINGTIP_LIVE_DIR:-$HOME/Developer/wingtip-live}
export PATH="$PATH:$HOME/.docker/bin"

# Tidy first: merged worktrees and branches, stopped containers.
"$(dirname "$0")/tidy-local.sh" || true
git -C "$main" fetch -q origin "$branch"
if [ ! -d "$live" ]; then
  git -C "$main" worktree add -q --detach "$live" "origin/$branch"
fi
git -C "$live" checkout -q --detach "origin/$branch"
# The owner's local files, shared rather than copied.
for p in data .env infra/local-https/certs; do
  if [ -e "$main/$p" ] && [ ! -L "$live/$p" ]; then
    rm -rf "${live:?}/$p"
    ln -s "$main/$p" "$live/$p"
  fi
done
cd "$live"
echo "go-live: $(git log --oneline -1 | cut -c1-72)"
# The web build's packages for this tree, then every service rebuilt
# and restarted where its image or settings changed.
docker compose -p wingtip run --rm --no-deps --entrypoint sh web-build -c "npm ci --no-audit --no-fund" >/dev/null
docker compose -p wingtip up -d --build --remove-orphans
for _ in $(seq 1 40); do
  docker compose -p wingtip ps --format '{{.Health}}' | grep -q starting || break
  sleep 15
done
docker compose -p wingtip ps --format '{{.Service}}: {{.Status}}'
host=$(grep -E '^PHONE_BASE_URL=' .env 2>/dev/null | cut -d= -f2-)
echo "go-live: live at ${host:-https://localhost:8443}/app"
