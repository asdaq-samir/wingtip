#!/usr/bin/env bash
# Tidy the owner's Mac before a wave goes live (CLAUDE.md, Branches:
# "Live for the owner first"). Removes only what is already safe:
# - a worktree under .claude/worktrees or ../wingtip-* whose checkout is
#   clean and whose commit is already on origin/main or
#   origin/claude/integration, unless it is locked (a running agent's)
#   or is the live stack's (~/Developer/wingtip-live);
# - local branches whose commits are all on those two (none checked out);
# - stopped containers and dangling images (never volumes).
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

removed=0; kept=0
while IFS= read -r line; do
  case $line in worktree\ *) wt=${line#worktree }; locked=0; head="";;
    HEAD\ *) head=${line#HEAD };;
    locked*) locked=1;;
    "") [ -n "${wt:-}" ] || continue
        if [ "$wt" = "$main" ] || [ "$wt" = "$live" ]; then wt=""; continue; fi
        case $wt in */.claude/worktrees/*|*/wingtip-*) ;; *) wt=""; continue;; esac
        if [ $locked = 1 ]; then echo "keep (running agent): $wt"; kept=$((kept+1))
        elif [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then echo "keep (uncommitted changes): $wt"; kept=$((kept+1))
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

run docker container prune -f >/dev/null
run docker image prune -f >/dev/null
df -h /System/Volumes/Data | tail -1
