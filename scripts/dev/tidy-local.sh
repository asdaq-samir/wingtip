#!/usr/bin/env bash
# Tidy the owner's Mac before a wave goes live (CLAUDE.md, Branches:
# "Live for the owner first"). Removes only what is already safe:
# - a worktree under .claude/worktrees or ../wingtip-* whose checkout is
#   clean and whose commit is already on origin/main or
#   origin/claude/integration, unless it is locked (a running agent's)
#   or is the live stack's (~/Developer/wingtip-live), or was touched in
#   the last six hours (a fresh agent's worktree is "landed" too);
# - local branches whose commits are all on those two (none checked out);
# - stopped containers of the worktrees' and scratch stacks (compose
#   projects named wingtip-<something>) and the leftovers of
#   `docker compose run` in the live project (label oneoff=True), plus
#   dangling images (never volumes). Never the live `wingtip` project's
#   other stopped containers (ml, retrain, charts, charts-overlays: the
#   dev-services sidecar can only start a container that exists), and
#   never another project's.
#   scripts/dev/tidy-local.sh [--dry-run]
set -uo pipefail
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
main=$(git -C "$(dirname "$0")/../.." rev-parse --path-format=absolute --git-common-dir 2>/dev/null \
  || git rev-parse --path-format=absolute --git-common-dir)
main=${main%/.git}
live=${WINGTIP_LIVE_DIR:-$HOME/Developer/wingtip-live}
export PATH="$PATH:$HOME/.docker/bin"
cd "$main" || exit 1
git fetch -q origin
landed() { # is commit $1 on main or the integration branch?
  git merge-base --is-ancestor "$1" origin/main 2>/dev/null ||
  { git rev-parse -q --verify origin/claude/integration >/dev/null &&
    git merge-base --is-ancestor "$1" origin/claude/integration 2>/dev/null; }
}
run() { if [ $dry = 1 ]; then echo "would: $*"; else "$@"; fi; }

# Minutes since a worktree's git state (its HEAD, index, reflog) or its
# folder last changed. A worktree just made from claude/integration for an
# agent is "landed" before the agent has written anything; on 2026-11-11
# go-live removed three such worktrees under their running agents. As
# tidy-branches.sh does, nothing touched in the last six hours goes.
idle_minutes() {
  local admin newest=0 t f
  admin=$(git -C "$1" rev-parse --path-format=absolute --git-dir 2>/dev/null) || { echo 0; return; }
  for f in "$admin/HEAD" "$admin/index" "$admin/logs/HEAD" "$1"; do
    [ -e "$f" ] || continue
    t=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
    [ "$t" -gt "$newest" ] && newest=$t
  done
  echo $((($(date +%s) - newest) / 60))
}

removed=0; kept=0
while IFS= read -r line; do
  case $line in worktree\ *) wt=${line#worktree }; locked=0; head="";;
    HEAD\ *) head=${line#HEAD };;
    locked*) locked=1;;
    "") [ -n "${wt:-}" ] || continue
        if [ "$wt" = "$main" ] || [ "$wt" = "$live" ]; then wt=""; continue; fi
        case $wt in */.claude/worktrees/*|*/wingtip-*) ;; *) wt=""; continue;; esac
        if [ "$locked" = 1 ]; then echo "keep (running agent): $wt"; kept=$((kept+1))
        elif [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then echo "keep (uncommitted changes): $wt"; kept=$((kept+1))
        elif [ "$(idle_minutes "$wt")" -lt 360 ]; then echo "keep (in use in the last six hours): $wt"; kept=$((kept+1))
        elif landed "$head"; then run git worktree remove "$wt" && removed=$((removed+1))
        else echo "keep (not landed yet): $wt"; kept=$((kept+1)); fi
        wt="";;
  esac
done < <(git worktree list --porcelain; echo)
run git worktree prune
echo "worktrees: $removed removed, $kept kept"

checked_out=$(git worktree list --porcelain | sed -n 's#^branch refs/heads/##p')
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  [ "$b" = main ] && continue
  echo "$checked_out" | grep -qx "$b" && continue
  # The harness's own branch for an agent whose worktree still exists.
  case $b in worktree-agent-*) [ -d "$main/.claude/worktrees/${b#worktree-}" ] && continue;; esac
  landed "$b" && run git branch -D "$b" >/dev/null && echo "branch removed: $b"
done

# One at a time, chosen by label, so nothing of another project or of the
# live stack's jobs is touched: `docker container prune` has no such rule.
while read -r id project oneoff; do
  [ -n "$id" ] || continue
  case $project in
    wingtip) [ "$oneoff" = "True" ] || continue;;   # a `run --rm` leftover, not a job container
    wingtip-*) ;;
    *) continue;;
  esac
  run docker rm "$id" >/dev/null
done < <(docker ps -a --filter status=exited --filter status=dead \
  --format '{{.ID}} {{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.oneoff"}}' 2>/dev/null)
# Cargo targets are one per worktree (check.sh, the pre-push hook): those of
# a worktree that no longer exists go. The volumes carry the worktree's path
# as a label, the hook's directories as a .worktree file.
for vol in $(docker volume ls -q --filter name=wingtip-cargo-target-tests- 2>/dev/null); do
  path=$(docker volume inspect -f '{{index .Labels "wingtip.worktree"}}' "$vol" 2>/dev/null)
  if [ -n "$path" ] && [ ! -d "$path" ]; then run docker volume rm "$vol" >/dev/null; echo "cargo target removed: $vol"; fi
done
for d in "$HOME"/Library/Caches/wingtip-pre-push-cargo/*/; do
  if [ -f "$d.worktree" ] && [ ! -d "$(cat "$d.worktree")" ]; then run rm -rf "$d"; echo "cargo target removed: $d"; fi
done
# The wheel's targets are BuildKit cache mounts, which cannot be named in a
# prune: the ones unused for two weeks go (a cold wheel build at worst).
run docker builder prune -f --filter type=exec.cachemount --filter until=336h >/dev/null 2>&1 || true
run docker image prune -f >/dev/null
df -h /System/Volumes/Data | tail -1
