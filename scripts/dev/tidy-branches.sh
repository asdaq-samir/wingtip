#!/usr/bin/env bash
# Deletes the local branches the agents' worktrees leave behind
# (worktree-agent-*, the harness's names) once every commit on them is on
# origin/main, and lists the ones it keeps, with why. A branch checked out
# in any worktree (`git worktree list`) is kept whatever it holds, and so
# is worktree-agent-<id> while a worktree named agent-<id> is there (its
# agent moved it to a claude/ branch, and the harness may still clean up
# by the name): a running agent may still be at work. Nothing is pushed or deleted on
# GitHub.
#
# Last, scripts/dev/tidy-build-caches.sh: the build caches of the worktrees
# it removed, and the shared ones past their caps.
#
# First it removes the sessions' worktrees, ~/Developer/wingtip-<topic>
# (`git worktree add ../wingtip-<topic>`, CLAUDE.md), whose commit is on
# origin/claude/integration or origin/main and which have nothing
# uncommitted, so a merged branch's checkout does not sit on the disk (each
# holds its own node_modules, build output and Cargo target). Never the
# main checkout or ~/Developer/wingtip-live (the live stack's), never a
# locked worktree (a running agent's), and never one whose git state
# changed in the last six hours: a worktree just made from the integration
# branch is "merged" too, before its agent has written anything.
#
#   scripts/dev/tidy-branches.sh [--dry-run] [<pattern>]   (worktree-agent-* by default)
set -euo pipefail

dry=""
if [ "${1:-}" = "--dry-run" ]; then dry=1; shift; fi
pattern=${1:-worktree-agent-*}

git fetch -q origin main claude/integration

# --- the merged worktrees ----------------------------------------------------
dev=${WINGTIP_DEV_DIR:-$HOME/Developer}
keep_dirs=("$dev/wingtip" "${WINGTIP_LIVE_DIR:-$dev/wingtip-live}")
landed() {   # is commit $1 on origin/main or origin/claude/integration?
  git merge-base --is-ancestor "$1" origin/main 2>/dev/null \
    || git merge-base --is-ancestor "$1" origin/claude/integration 2>/dev/null
}
# Minutes since the worktree's git state (its HEAD, index, reflog) last
# changed, from its admin folder in the main repository.
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
wt_removed=0
wt=""; head=""; locked=""
while IFS= read -r line; do
  case $line in
    "worktree "*) wt=${line#worktree }; head=""; locked="" ;;
    "HEAD "*) head=${line#HEAD } ;;
    locked*) locked=1 ;;
    "")
      [ -n "$wt" ] || continue
      dir=$wt; wt=""
      case $dir in "$dev"/wingtip-*) ;; *) continue ;; esac
      skip=""
      for k in "${keep_dirs[@]}"; do [ "$dir" = "$k" ] && skip=1; done
      [ -z "$skip" ] || continue
      if [ -n "$locked" ]; then
        echo "kept     $dir (locked: a running agent's)"
      elif [ ! -d "$dir" ]; then
        continue   # gone already; `git worktree prune` below forgets it
      elif [ -n "$(git -C "$dir" --no-optional-locks status --porcelain 2>/dev/null)" ]; then
        echo "kept     $dir (uncommitted changes)"
      elif [ -z "$head" ] || ! landed "$head"; then
        echo "kept     $dir (not on origin/claude/integration or origin/main)"
      elif [ "$(idle_minutes "$dir")" -lt 360 ]; then
        echo "kept     $dir (merged, but in use in the last six hours)"
      elif [ -n "$dry" ]; then
        echo "merged   $dir (would remove the worktree)"
        wt_removed=$((wt_removed + 1))
      else
        git worktree remove "$dir" && echo "removed  $dir" && wt_removed=$((wt_removed + 1))
      fi
      ;;
  esac
done < <(git worktree list --porcelain; echo)
[ -n "$dry" ] || git worktree prune
# Every branch a worktree has checked out, one per line.
in_use=$(git worktree list --porcelain | sed -n 's#^branch refs/heads/##p')
# And each worktree's own folder name, as worktree-<name>.
in_use+=$'\n'$(git worktree list --porcelain | sed -n 's#^worktree .*/#worktree-#p')

deleted=0
kept=0
while IFS= read -r branch; do
  [ -n "$branch" ] || continue
  if grep -qxF "$branch" <<<"$in_use"; then
    echo "kept     $branch (its worktree is there)"
    kept=$((kept + 1))
  elif git merge-base --is-ancestor "$branch" origin/main; then
    if [ -n "$dry" ]; then
      echo "merged   $branch (would delete)"
    else
      # -D, not -d: -d asks whether it is merged into HEAD or its
      # upstream, and the check that matters, origin/main, is made above.
      git branch -q -D "$branch"
      echo "deleted  $branch"
    fi
    deleted=$((deleted + 1))
  else
    echo "kept     $branch ($(git rev-list --count "origin/main..$branch") commit(s) not on origin/main)"
    kept=$((kept + 1))
  fi
done < <(git for-each-ref --format='%(refname:short)' "refs/heads/$pattern")

echo "tidy-branches: ${dry:+would remove }$wt_removed merged worktree(s); ${dry:+would delete }$deleted merged branch(es), kept $kept"
# The removed worktrees' DerivedData and Cargo targets, and the shared
# caches past their caps.
"$(dirname "$0")/tidy-build-caches.sh" ${dry:+--dry-run}
