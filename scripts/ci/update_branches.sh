#!/usr/bin/env bash
# The claude/ pull requests behind main, brought up to date gently
# (.github/workflows/update-branches.yml says how and why). Reads the
# step's env: UPDATE_TOKEN, HAS_MERGE_TOKEN, GH_TOKEN, GH_REPO,
# MAX_UPDATES, QUIET_MINUTES, GAP_SECONDS and LABEL.
set -uo pipefail
now=$(date -u +%s)
wrote=0
updates=0

# Ten seconds or more between any two writes this run makes.
gentle() {
  if [ "$wrote" -gt 0 ]; then sleep "$GAP_SECONDS"; fi
  wrote=$((wrote + 1))
}

prs=$(gh pr list --base main --state open --limit 100 \
  --json number,headRefName,isDraft,updatedAt,isCrossRepository,labels \
  --jq '.[] | select((.isDraft | not) and (.isCrossRepository | not) and (.headRefName | startswith("claude/")))
        | [.number, .headRefName, .updatedAt, ([.labels[].name] | index(env.LABEL) != null)] | @tsv')

while IFS=$'\t' read -r pr branch updated labelled; do
  [ -n "$pr" ] || continue
  behind=$(gh api "repos/$GH_REPO/compare/main...$branch" --jq '.behind_by' 2>/dev/null) || { echo "#$pr: could not compare $branch with main"; continue; }

  if [ "$behind" = "0" ]; then
    echo "#$pr $branch: current"
    if [ "$labelled" = "true" ]; then
      gentle
      gh api -X DELETE "repos/$GH_REPO/issues/$pr/labels/$LABEL" >/dev/null && echo "#$pr: $LABEL removed"
    fi
    continue
  fi

  age=$(( now - $(date -u -d "$updated" +%s) ))
  if [ "$age" -lt $(( QUIET_MINUTES * 60 )) ]; then
    echo "#$pr $branch: $behind behind, but changed $((age / 60)) min ago; left for the next run"
    continue
  fi
  if [ "$updates" -ge "$MAX_UPDATES" ]; then
    echo "#$pr $branch: $behind behind; this run's $MAX_UPDATES updates are spent"
    continue
  fi

  gentle
  updates=$((updates + 1))
  if out=$(GH_TOKEN=$UPDATE_TOKEN gh api -X PUT "repos/$GH_REPO/pulls/$pr/update-branch" -f update_method=merge 2>&1); then
    echo "#$pr $branch: was $behind behind, main merged in"
    if [ "$HAS_MERGE_TOKEN" != "true" ]; then
      gentle
      gh workflow run ci.yml --ref "$branch" && echo "#$pr: CI started by hand (no MERGE_TOKEN)"
    fi
    if [ "$labelled" = "true" ]; then
      gentle
      gh api -X DELETE "repos/$GH_REPO/issues/$pr/labels/$LABEL" >/dev/null && echo "#$pr: $LABEL removed"
    fi
  elif grep -qi "conflict" <<<"$out"; then
    echo "#$pr $branch: main does not merge in cleanly"
    if [ "$labelled" != "true" ]; then
      gentle
      gh api -X POST "repos/$GH_REPO/issues/$pr/labels" -f "labels[]=$LABEL" >/dev/null && echo "#$pr: $LABEL added"
    fi
  else
    echo "::warning title=Update branches::#$pr $branch: $out"
    # A 403 or a 429 is GitHub asking for fewer writes: stop.
    if grep -qE "HTTP (403|429)" <<<"$out"; then exit 0; fi
  fi
done <<<"$prs"
echo "Updated $updates pull request(s)."
