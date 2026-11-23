#!/usr/bin/env bash
# Deletes the branches a wave leaves behind, here and on GitHub in one pass
# (the owner, 2026-11-23: "Make git cleanups faster"), and removes the
# sessions' worktrees whose work has landed. go-live.sh and after-merge.sh
# run it at their end; .github/workflows/tidy-branches.yml runs it on
# GitHub (--github) each night and after each push to main.
#
# A branch (claude/* and the harness's worktree-agent-*, local and on
# origin) goes when its work is on origin/main: its tip is there, or
# `git cherry origin/main <branch>` shows no '+' (each patch landed under
# another commit, as a squash or a cherry-pick does). claude/check-* and
# claude/validate-* go too once their run has finished and the branch they
# were pushed from is gone. Kept, with why: a branch with a commit or a
# ref change in the last six hours, one checked out in a worktree that is
# locked or was used in the last six hours, one with an open pull request,
# android-wave3, backup/*, main, and every branch of the main checkout
# and the live tree (~/Developer/wingtip-live).
#
# A worktree, ~/Developer/wingtip-<topic> or .claude/worktrees/*, goes when
# its branch goes, or when it is detached at a commit on origin/main (or on
# origin/claude/integration while a wave has one), and it is neither locked
# nor used in the last six hours. Its uncommitted changes are saved first.
#
# Nothing is lost: before deleting, every ref it deletes is written to
# ~/wingtip-archive/<date>/ (refs.txt, its sha and name; a verified
# `git bundle` of what is not on origin/main) with each removed worktree's
# uncommitted diff (`git add -N`, then `git diff --binary HEAD`); a branch
# comes back with `git fetch <bundle> <ref>:<ref>`. The branches on GitHub
# go in one `git push origin :refs/heads/a :refs/heads/b ...`: one write.
#
#   scripts/dev/tidy-branches.sh [--dry-run]   here and on origin
#   scripts/dev/tidy-branches.sh --github      on GitHub, from a full clone (no worktrees, no local branches)
set -euo pipefail
# Arrays are expanded as ${a[@]+"${a[@]}"}: the Mac's bash 3.2 calls an
# empty one unbound under set -u.

dry="" github=""
for arg in "$@"; do
  case $arg in
    --dry-run) dry=1 ;;
    --github) github=1 ;;
    *) echo "usage: tidy-branches.sh [--dry-run] [--github]" >&2; exit 64 ;;
  esac
done
here=$(cd "$(dirname "$0")" && pwd)
cd "$(git rev-parse --show-toplevel)" # the repository it is run in
now=$(date +%s)
recent=$((6 * 3600))
archive=${TIDY_ARCHIVE:-$HOME/wingtip-archive}/$(date +%F)
[ -z "$github" ] || archive=${RUNNER_TEMP:-/tmp}/branch-archive

git fetch -q --prune origin
integration=""
git rev-parse -q --verify origin/claude/integration > /dev/null && integration=origin/claude/integration

# The open pull requests' branches; without the list nothing on GitHub is
# deleted, as a deleted head closes its pull request.
remote_ok=1
open_prs=$(gh pr list --state open --limit 500 --json headRefName -q '.[].headRefName' 2> /dev/null) || {
  remote_ok=""
  echo "kept     every branch on origin (gh could not list the open pull requests)"
}

on_main() { # is every patch of ref $1 on origin/main?
  git merge-base --is-ancestor "$1" origin/main 2> /dev/null && return 0
  # git cherry compares patches and skips merge commits, whose conflict
  # resolutions are work of their own: a branch with a merge not on main is
  # kept (the safety audit of 2026-11-23, L10).
  [ -z "$(git rev-list --merges origin/main.."$1" 2> /dev/null)" ] || return 1
  ! git cherry origin/main "$1" 2> /dev/null | grep -q '^+'
}
# Seconds since ref $1 last changed: its commit, or for a local branch its
# reflog (a remote one's reflog moves at every fetch, so its commit alone).
age() {
  local t log
  t=$(git log -1 --format=%ct "$1")
  log=$(git rev-parse --git-common-dir)/logs/$1
  if [ "${1#refs/heads/}" != "$1" ] && [ -f "$log" ]; then
    local m
    m=$(stat -f %m "$log" 2> /dev/null || stat -c %Y "$log")
    [ "$m" -gt "$t" ] && t=$m
  fi
  echo $((now - t))
}
run_finished() { # has the latest run on branch $1 finished (or none ran)?
  local status
  status=$(gh run list -b "$1" -L 1 --json status -q '.[0].status // "completed"' 2> /dev/null) || return 1
  [ "$status" = completed ]
}
exists() { git rev-parse -q --verify "refs/heads/$1" > /dev/null || git rev-parse -q --verify "refs/remotes/origin/$1" > /dev/null; }
# A check's or validation's source: claude/<topic>, or the wave's branch.
source_gone() {
  case $1 in
    claude/check-*) ! exists "claude/${1#claude/check-}" ;;
    claude/validate-failed/*) local w=${1#claude/validate-failed/}; ! exists claude/integration && ! exists "claude/${w%%/*}" ;;
    claude/validate-*) ! exists claude/integration && ! exists "claude/${1#claude/validate-}" ;;
    *) return 1 ;;
  esac
}
# Why branch $1 (at ref $2) stays, or nothing when it goes.
why_kept() {
  local name=$1 ref=$2
  case $name in
    main | */android-wave3 | android-wave3 | backup/* | claude/backup/*) echo "kept by name"; return ;;
  esac
  if grep -qxF "$name" <<< "$keep_names"; then echo "checked out in a worktree in use"; return; fi
  if [ "$(age "$ref")" -lt "$recent" ]; then echo "changed in the last six hours"; return; fi
  if grep -qxF "$name" <<< "$open_prs"; then echo "open pull request"; return; fi
  on_main "$ref" && return
  case $name in
    claude/check-* | claude/validate-*)
      if source_gone "$name" && run_finished "$name"; then return; fi
      echo "its run or its source is still there"; return ;;
  esac
  echo "$(git rev-list --count "origin/main..$ref") commit(s) not on origin/main"
}

dev=$(cd "${WINGTIP_DEV_DIR:-$HOME/Developer}" 2> /dev/null && pwd -P || echo "${WINGTIP_DEV_DIR:-$HOME/Developer}")
main_dir=$(cd "$(git rev-parse --git-common-dir)/.." && pwd -P)
live_dir=${WINGTIP_LIVE_DIR:-$dev/wingtip-live}
keep_names="" wt_dirs=() wt_branches=()
idle_minutes() {
  local admin newest=0 t f
  admin=$(git -C "$1" rev-parse --path-format=absolute --git-dir 2> /dev/null) || { echo 0; return; }
  for f in "$admin/HEAD" "$admin/index" "$admin/logs/HEAD" "$1"; do
    [ -e "$f" ] || continue
    t=$(stat -f %m "$f" 2> /dev/null || stat -c %Y "$f")
    [ "$t" -gt "$newest" ] && newest=$t
  done
  echo $((($(date +%s) - newest) / 60))
}

# --- the worktrees: which stay (and keep their branch), which may go -------
if [ -z "$github" ]; then
  wt="" head="" branch="" locked=""
  while IFS= read -r line; do
    case $line in
      "worktree "*) wt=${line#worktree }; head="" branch="" locked="" ;;
      "HEAD "*) head=${line#HEAD } ;;
      "branch "*) branch=${line#branch refs/heads/} ;;
      locked*) locked=1 ;;
      "")
        [ -n "$wt" ] || continue
        dir=$wt; wt=""
        keep_names+=$'\n'"worktree-${dir##*/}"
        if [ "$(cd "$dir" 2> /dev/null && pwd -P)" = "$main_dir" ] || [ "$dir" = "$live_dir" ]; then
          keep_names+=$'\n'"$branch"; continue
        fi
        case $dir in "$dev"/wingtip-* | */.claude/worktrees/*) ;; *) keep_names+=$'\n'"$branch"; continue ;; esac
        [ -d "$dir" ] || continue # gone already; `git worktree prune` forgets it
        if [ -n "$locked" ]; then
          echo "kept     $dir (locked: a running agent's)"; keep_names+=$'\n'"$branch"
        elif [ "$(idle_minutes "$dir")" -lt 360 ]; then
          echo "kept     $dir (used in the last six hours)"; keep_names+=$'\n'"$branch"
        elif [ -n "$branch" ]; then
          wt_dirs+=("$dir"); wt_branches+=("$branch") # goes if its branch goes, below
        elif on_main "$head" || { [ -n "$integration" ] && git merge-base --is-ancestor "$head" "$integration"; }; then
          wt_dirs+=("$dir"); wt_branches+=("")
        else
          echo "kept     $dir (detached at ${head:0:9}, not landed)"
        fi
        ;;
    esac
  done < <(git worktree list --porcelain; echo)
fi

# --- the branches ------------------------------------------------------------
local_gone=() remote_gone=() refs=()
if [ -z "$github" ]; then
  while IFS= read -r name; do
    why=$(why_kept "$name" "refs/heads/$name")
    if [ -n "$why" ]; then echo "kept     $name ($why)"; else local_gone+=("$name"); refs+=("refs/heads/$name"); fi
  done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/claude/' 'refs/heads/worktree-agent-*')
fi
if [ -n "$remote_ok" ]; then
  while IFS= read -r name; do
    name=${name#origin/}
    why=$(why_kept "$name" "refs/remotes/origin/$name")
    if [ -n "$why" ]; then echo "kept     origin/$name ($why)"; else remote_gone+=("$name"); refs+=("refs/remotes/origin/$name"); fi
  done < <(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/claude/')
fi
# A worktree goes with its branch; one whose branch stays, stays.
wt_gone=()
for i in ${wt_dirs[@]+"${!wt_dirs[@]}"}; do
  b=${wt_branches[$i]}
  if [ -z "$b" ] || printf '%s\n' ${local_gone[@]+"${local_gone[@]}"} | grep -qxF "$b"; then
    wt_gone+=("${wt_dirs[$i]}")
  else
    echo "kept     ${wt_dirs[$i]} (its branch $b stays)"
  fi
done

for d in ${wt_gone[@]+"${wt_gone[@]}"}; do echo "goes     $d (worktree)"; done
for b in ${local_gone[@]+"${local_gone[@]}"}; do echo "goes     $b"; done
for b in ${remote_gone[@]+"${remote_gone[@]}"}; do echo "goes     origin/$b"; done
summary="${#wt_gone[@]} worktree(s), ${#local_gone[@]} local and ${#remote_gone[@]} remote branch(es)"
if [ -n "$dry" ]; then
  echo "tidy-branches: would remove $summary (--dry-run: nothing changed)"
  [ -n "$github" ] || [ "${TIDY_BUILD_CACHES:-1}" = 0 ] || "$here/tidy-build-caches.sh" --dry-run
  exit 0
fi
[ ${#wt_gone[@]} -gt 0 ] || [ ${#refs[@]} -gt 0 ] || { echo "tidy-branches: nothing to remove"; exit 0; }

# --- the archive, then the deletes -------------------------------------------
mkdir -p "$archive"
stamp=$(date +%H%M%S)
if [ ${#refs[@]} -gt 0 ]; then
  for r in ${refs[@]+"${refs[@]}"}; do echo "$(git rev-parse "$r") $r"; done >> "$archive/refs.txt"
  ahead=()
  for r in ${refs[@]+"${refs[@]}"}; do git merge-base --is-ancestor "$r" origin/main || ahead+=("$r"); done
  if [ ${#ahead[@]} -gt 0 ]; then
    git bundle create -q "$archive/branches-$stamp.bundle" ${ahead[@]+"${ahead[@]}"} --not origin/main
    git bundle verify -q "$archive/branches-$stamp.bundle" > /dev/null
  fi
fi
for d in ${wt_gone[@]+"${wt_gone[@]}"}; do
  diff="$archive/worktree-${d##*/}-$stamp.diff"
  git -C "$d" add -N . && git -C "$d" diff --binary HEAD > "$diff"
  [ -s "$diff" ] || rm -f "$diff"
done
echo "tidy-branches: archived in $archive"
for d in ${wt_gone[@]+"${wt_gone[@]}"}; do git worktree remove --force "$d" && echo "removed  $d"; done
[ -n "$github" ] || git worktree prune
[ ${#local_gone[@]} -eq 0 ] || git branch -q -D ${local_gone[@]+"${local_gone[@]}"}
if [ ${#remote_gone[@]} -gt 0 ]; then
  specs=()
  for b in ${remote_gone[@]+"${remote_gone[@]}"}; do specs+=(":refs/heads/$b"); done
  if [ -n "$github" ]; then
    # On GitHub the checkout keeps no token: a helper hands GH_TOKEN to git,
    # in no command line and no file (as scripts/ci/autofix_format.sh does).
    git -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f' \
      push -q --no-verify origin ${specs[@]+"${specs[@]}"}
  else
    git push -q origin ${specs[@]+"${specs[@]}"}
  fi
fi
echo "tidy-branches: removed $summary"
# The removed worktrees' DerivedData and Cargo targets, and the shared caches past their caps.
[ -n "$github" ] || [ "${TIDY_BUILD_CACHES:-1}" = 0 ] || "$here/tidy-build-caches.sh"
