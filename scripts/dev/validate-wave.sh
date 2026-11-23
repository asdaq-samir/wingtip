#!/usr/bin/env bash
# A wave's validation, on GitHub and not the Mac (decisions 0054 and 0062;
# docs/CI.md, "Validating a wave"). Each push starts
# .github/workflows/validate-wave.yml, which is ci.yml with `wave`; the
# branch it pushes to says what the run does (scripts/ci/validation.py):
#
#   validate-wave.sh --check [<topic>]          this branch alone, as soon as its fix is ready:
#                                               claude/check-<topic>, its reached specs on the wave's
#                                               projects and its areas' unit tests, against the wave it
#                                               builds on (topic: this branch's name without claude/)
#   validate-wave.sh <wave> --failed [<run>]    after a red run: only its failed jobs and red tests
#                                               (no retry for a known red), and what the commits since
#                                               reach; <run> by default the wave's newest failed run
#   validate-wave.sh <wave> [--full]            the whole wave, ci.yml as the night runs it: the one
#                                               last proof once the reruns are green
#
# Run from claude/integration's tip (or the wave's branch) for a wave, or
# from the branch for a check; it pushes this checkout's commit. Every
# validation is one concurrency group, so a newer push cancels the run
# before it; each check is its own. A failure is reproduced with its narrow
# test (each red job's summary names it, scripts/ci/failure_summary.py).
# The push skips the pre-push hook: the run checks all of it.
set -euo pipefail

usage() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
here=$(cd "$(dirname "$0")/../.." && pwd)
wave="" kind=full run="" topic=""
while [ $# -gt 0 ]; do
  case $1 in
    -h | --help) usage ;;
    --full) kind=full ;;
    --failed) kind=failed; if [[ ${2:-} =~ ^[0-9]+$ ]]; then run=$2; shift; fi ;;
    --check) kind=check; if [ -n "${2:-}" ] && [[ $2 != -* ]]; then topic=$2; shift; fi ;;
    -*) usage 64 ;;
    *) [ -z "$wave" ] || usage 64; wave=$1 ;;
  esac
  shift
done
name_ok() { [[ $1 =~ ^[a-z0-9][a-z0-9.-]*$ ]] && [[ $1 != *--* ]] && [ "$1" != failed ]; }
if [ "$kind" = check ]; then
  [ -n "$topic" ] || topic=$(git -C "$here" branch --show-current | sed 's#^claude/##; s#/#-#g')
  name_ok "$topic" || { echo "validate-wave: a check's topic is lower case, digits, dots and dashes: '$topic'" >&2; exit 64; }
else
  [ -n "$wave" ] || usage 64
  name_ok "$wave" || { echo "validate-wave: a wave's name is lower case, digits, dots and dashes, not 'failed': $wave" >&2; exit 64; }
fi
if [ -n "$(git -C "$here" status --porcelain --untracked-files=no)" ]; then
  echo "validate-wave: commit first; the run checks out only what is pushed" >&2
  exit 1
fi
repo=$(git -C "$here" remote get-url origin | sed -E 's#^(git@|https://)github\.com[:/]##; s#\.git$##')

case $kind in
  full) branch=claude/validate-$wave ;;
  check) branch=claude/check-$topic ;;
  failed)
    if [ -z "$run" ]; then
      # The wave's newest finished run that failed, its whole run's or a rerun's (a cancelled one was superseded).
      run=$(gh run list -R "$repo" -w "Validate wave" -L 50 --json databaseId,headBranch,status,conclusion \
        -q "[.[] | select(.status == \"completed\" and .conclusion == \"failure\")
             | select(.headBranch == \"claude/validate-$wave\" or (.headBranch | startswith(\"claude/validate-failed/$wave/\")))][0].databaseId // empty")
      [ -n "$run" ] || { echo "validate-wave: no failed run of $wave to rerun; --full runs it all" >&2; exit 1; }
    fi
    branch=claude/validate-failed/$wave/$run
    ;;
esac
sha=$(git -C "$here" rev-parse HEAD)
SKIP_HOOKS=1 git -C "$here" push -q origin "HEAD:refs/heads/$branch"
echo "validate-wave: ${sha:0:9} ($(git -C "$here" branch --show-current)) pushed to $branch"
if [ "$kind" = failed ]; then
  echo "  rerunning what run $run failed: https://github.com/$repo/actions/runs/$run"
  # The wave's earlier reruns' branches go (their runs are kept); one push deletes them all.
  old=()
  while read -r _ ref; do
    [ "$ref" = "refs/heads/$branch" ] || old+=(":$ref")
  done < <(git -C "$here" ls-remote --heads origin "claude/validate-failed/$wave/*")
  [ ${#old[@]} -eq 0 ] || SKIP_HOOKS=1 git -C "$here" push -q origin "${old[@]}"
fi
echo "  the run: https://github.com/$repo/actions/workflows/validate-wave.yml?query=branch%3A${branch//\//%2F}"
echo "  follow:  gh run watch --exit-status \$(gh run list -w 'Validate wave' -b $branch -L 1 --json databaseId -q '.[0].databaseId')"
