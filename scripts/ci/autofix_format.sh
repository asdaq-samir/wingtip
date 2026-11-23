#!/usr/bin/env bash
# CI's formatting of a claude/ pull request whose CI failed, and nothing
# else (the owner, 2026-11-15: "the autofix bot only formats").
# .github/workflows/ci-autofix.yml runs it as three jobs, each on a
# machine of its own:
#
#   scripts/ci/autofix_format.sh plan             a runner's failure run again, or the languages to format
#   scripts/ci/autofix_format.sh format PATCH     format them here, with no token, into PATCH
#   scripts/ci/autofix_format.sh push PATCH [--dry-run]   apply PATCH's own files, commit, push
#
# plan only reads GitHub (and reruns): a job GitHub never ran ("not
# acquired by Runner", as main's run 37366678665 had four) is the runner's
# fault, so the failed jobs run again, once, and nothing is formatted.
# Otherwise it writes `langs=...` (scripts/dev/format.sh's names) to
# $GITHUB_OUTPUT when the failed run $RUN_ID is of an open pull request
# from a claude/ branch of this repository, the branch still ends at the
# commit that failed, and that commit is not this bot's own. A session
# that has pushed again has moved the branch on, and its newer run answers
# for it; one that pushes after the bot is refused and pulls.
#
# format runs the branch's own format.sh for each of $LANGS in a checkout
# of that commit (the working directory), and writes what it changed as a
# diff. The formatters and their settings are the branch's code (a
# prettier config is JavaScript, a pom names Maven plugins), so this job
# holds no token at all and its machine never sees one: they used to run
# beside MERGE_TOKEN, the owner's own, which env -u kept from only their
# own environment, not from /proc of the script that called them, nor
# from a .git/hooks/pre-push they could write for the push that followed
# (the deep security review of 2026-11-21). Only the diff leaves.
#
# push, on a fresh machine with a fresh checkout of the same commit,
# applies the diff where it only changes files that exist (no file made,
# removed, renamed or its mode changed), keeps of it only the files the
# pull request itself changes (format.sh lays out a language's whole tree,
# and a file the pull request did not touch is not its to change), and
# makes one commit of those, pushed to the branch with PUSH_TOKEN, hooks
# off. A language whose tool is not on the runner is skipped with a note.
# Nothing changed, nothing written: no commit, no comment, no issue, no
# pull request, ever. --dry-run (or DRY_RUN=1) applies and shows the
# commit it would make.
#
# Once per failed head commit, and no loop: the push moves the branch on
# from the commit that failed, and the commit it makes starts with MARK,
# which plan refuses. A push made with GITHUB_TOKEN starts no workflow,
# so with MERGE_TOKEN the push starts CI as any of the owner's does, and
# without it CI is started on the branch by hand (workflow_dispatch).
#
# Env: GH_TOKEN, GH_REPO, RUN_ID (and ATTEMPT) for plan and push; LANGS
# and SHA for format; PUSH_TOKEN, HAS_MERGE_TOKEN and GAP_SECONDS (10) for
# push.
set -uo pipefail
MARK="CI's formatting only:"

nothing() { echo "autofix: $*; nothing to do"; exit 0; }

# The failed run, read once: its event is main's, but its head is the branch's.
read_run() {
  local run
  run=$(gh api "repos/$GH_REPO/actions/runs/$RUN_ID" --jq '[.head_branch, .head_sha, .head_repository.full_name, .conclusion, .html_url,
    (.head_commit.message | split("\n")[0])] | map(. // "-") | @tsv') || { echo "autofix: could not read run $RUN_ID" >&2; exit 1; }
  IFS=$'\t' read -r branch sha head_repo conclusion url subject <<<"$run"
}

# format.sh's languages for the paths on stdin: the pre-push hook's table
# (scripts/dev/hooks/pre-push), each language's files and its settings.
langs_of() {
  while read -r path; do
    case "$path" in
      apps/web/*.ts | apps/web/*.tsx | apps/web/*.js | apps/web/*.jsx | apps/web/*.mjs | apps/web/*.cjs) echo web ;;
      apps/web/*.css | apps/web/*.json | apps/web/*.jsonc | apps/web/*.md | scripts/build/*.mjs | .prettierrc.yaml) echo web ;;
      *.py | .ruff.toml) echo python ;;
      engine/*.rs | engine/*rustfmt.toml) echo rust ;;
      apps/ios/*.swift | apps/ios/.swiftformat) echo swift ;;
      apps/android/*.kt | apps/android/*.kts | .editorconfig) echo kotlin ;;
      services/gateway/*.java | services/gateway/pom.xml) echo java ;;
    esac
  done | sort -u | tr '\n' ' ' | sed 's/ $//'
}

# The open pull request from the run's branch, and the files it changes.
pr_of() {
  gh pr list --head "$branch" --state open --json number,isCrossRepository --jq '[.[] | select(.isCrossRepository | not)][0].number // empty'
}
pr_files() { gh api "repos/$GH_REPO/pulls/$1/files?per_page=100" --paginate --jq '.[].filename'; }

# Whether a failed job of the run is one GitHub never gave a runner.
runners_fault() {
  local job
  for job in $(gh api "repos/$GH_REPO/actions/runs/$RUN_ID/jobs" --jq '.jobs[] | select(.conclusion == "failure" or .conclusion == "cancelled") | .id'); do
    gh api "repos/$GH_REPO/check-runs/$job/annotations" --jq '.[].message' | grep -q "not acquired by Runner" && return 0
  done
  return 1
}

plan() {
  local pr tip langs
  [ "$conclusion" = failure ] || nothing "run $RUN_ID ended in $conclusion"
  if runners_fault; then
    [ "${ATTEMPT:-1}" = 1 ] || nothing "run $RUN_ID's runner failed again on attempt $ATTEMPT"
    gh run rerun "$RUN_ID" --failed && nothing "run $RUN_ID's failed jobs were never given a runner: run again"
    exit 1
  fi
  [ "$head_repo" = "$GH_REPO" ] || nothing "run $RUN_ID is of $head_repo, not this repository"
  case "$branch" in claude/*) ;; *) nothing "$branch is not a claude/ branch" ;; esac
  case "$subject" in "$MARK"*) nothing "${sha:0:7} is this bot's own formatting, which it never formats again" ;; esac
  pr=$(pr_of) || { echo "autofix: could not list $branch's pull requests" >&2; exit 1; }
  [ -n "$pr" ] || nothing "no open pull request from $branch"

  tip=$(gh api "repos/$GH_REPO/git/ref/heads/$branch" --jq .object.sha) || nothing "GitHub did not say where $branch ends"
  [ "$tip" = "$sha" ] || nothing "$branch has moved on from ${sha:0:7}, the commit that failed; its newer commit's run answers for it"

  langs=$(pr_files "$pr" | langs_of) || { echo "autofix: could not list #$pr's files" >&2; exit 1; }
  [ -n "$langs" ] || nothing "#$pr changes no file a formatter lays out"
  echo "autofix: #$pr $branch at ${sha:0:7}, still its tip: to format $langs"
  echo "langs=$langs" >> "${GITHUB_OUTPUT:-/dev/null}"
}

# The branch's formatters over its own tree, here, into the diff $1. No
# GitHub, no token: this machine holds none.
format() {
  local out=$1 lang
  cd "$(git rev-parse --show-toplevel)" || exit 1
  [ "$(git rev-parse HEAD)" = "${SHA:-}" ] || { echo "autofix: this checkout is not at ${SHA:-the failed commit}" >&2; exit 1; }
  git diff --quiet HEAD || { echo "autofix: this checkout has changes of its own; not formatted over them" >&2; exit 1; }
  for lang in ${LANGS:-}; do
    scripts/dev/format.sh "$lang"
    case $? in
      0) ;;
      2) echo "::notice title=CI autofix::$lang: its formatter is not on this machine; skipped" ;;
      *) echo "::warning title=CI autofix::$lang: its formatter failed; the files it did lay out are kept" ;;
    esac
  done
  git diff --binary > "$out"
  echo "autofix: format.sh ${LANGS:-} changed $(git diff --name-only | wc -l | tr -d ' ') file(s)"
}

# The diff $1 applied to a fresh checkout of the failed commit, the pull
# request's own files of it committed and pushed.
push() {
  local patch=$1 dry=$2 count elsewhere message pr list
  cd "$(git rev-parse --show-toplevel)" || exit 1
  [ "$(git rev-parse HEAD)" = "$sha" ] || nothing "this checkout is not at ${sha:0:7}, the commit that failed"
  [ -s "$patch" ] || nothing "the formatters changed nothing"
  # Only changes to files that exist: a diff that makes, removes or renames
  # a file, or changes its mode (a symbolic link), is no formatter's.
  [ -z "$(git apply --summary "$patch")" ] || { echo "autofix: the diff does more than change files; not applied" >&2; exit 1; }
  git -c core.hooksPath=/dev/null apply "$patch" || { echo "autofix: the diff does not apply to ${sha:0:7}" >&2; exit 1; }
  pr=$(pr_of) && [ -n "$pr" ] || nothing "no open pull request from $branch"
  list=$(mktemp -d)
  pr_files "$pr" | sort > "$list/own" || { echo "autofix: could not list #$pr's files" >&2; exit 1; }
  # Of what was laid out, only the pull request's own files: the rest of each tree is put back.
  git diff --name-only | sort > "$list/changed"
  comm -12 "$list/changed" "$list/own" > "$list/keep"
  comm -23 "$list/changed" "$list/own" | tr '\n' '\0' | xargs -0 git checkout -q --
  count=$(wc -l < "$list/keep" | tr -d ' ')
  elsewhere=$(($(wc -l < "$list/changed") - count))
  [ "$count" -gt 0 ] || nothing "format.sh changed no file of #$pr's own ($elsewhere elsewhere, left as they were)"

  message="$MARK scripts/dev/format.sh laid out $count file(s) as the pinned formatters write them and changed nothing else, after CI run $RUN_ID failed on ${sha:0:7} ($url). The autofix bot's commit (.github/workflows/ci-autofix.yml, scripts/ci/autofix_format.sh): it formats a failed head commit once and never its own, so a run that still fails is the code's to fix."
  if [ -n "$dry" ]; then
    echo "autofix: would commit $count file(s) by path and push to $branch (dry run: left applied here, nothing committed):"
    git diff --stat
    printf 'autofix: with the message:\n%s\n' "$message"
    return
  fi
  tr '\n' '\0' < "$list/keep" | git -c core.hooksPath=/dev/null -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -q --no-verify -m "$message" --pathspec-from-file=- --pathspec-file-nul || exit 1
  # The token stays in the environment: a helper hands it to git, so it is
  # in no command line and no file. No force: a branch that has moved on
  # refuses the push, and its own run answers for it.
  if git -c core.hooksPath=/dev/null -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo "password=$PUSH_TOKEN"; }; f' \
    push -q --no-verify origin "HEAD:refs/heads/$branch"; then
    echo "autofix: $count file(s) formatted on $branch ($(git rev-parse --short HEAD))"
    # GITHUB_TOKEN's push starts no workflow: CI is started by hand, as update_branches.sh does.
    if [ "${HAS_MERGE_TOKEN:-}" != "true" ]; then
      sleep "${GAP_SECONDS:-10}"
      gh workflow run ci.yml --ref "$branch" && echo "autofix: CI started by hand (no MERGE_TOKEN)"
    fi
  else
    echo "::warning title=CI autofix::could not push the formatting to $branch; it is dropped"
  fi
}

dry=""
case " $* " in *" --dry-run "*) dry=1 ;; esac
[ "${DRY_RUN:-}" != "1" ] || dry=1
case "${1:-}" in
  plan) read_run && plan ;;
  format) format "${2:?the diff to write}" ;;
  push) read_run && push "${2:?the diff to apply}" "$dry" ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
