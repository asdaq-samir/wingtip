#!/usr/bin/env bash
# claude-review.yml's approve job, after the address job: when the
# branch's newest commit is the review's fix ("Address review:"), turn the
# pull request's auto-merge off, so the owner looks at it before it merges
# (security review 2026-11-23, M6: the review that wrote the fix's
# instructions may have fetched pages), and approve the fix's checks,
# which GitHub holds for a workflow's push (action_required). The runs
# appear a few seconds after the push, so the commit is asked after for
# two minutes. Runs on a machine that never ran the branch's code, with
# the owner's token (H1). Env: GH_TOKEN, GH_REPO, BRANCH, PR.
set -uo pipefail
sha=$(gh api "repos/$GH_REPO/branches/$BRANCH" --jq .commit.sha) || exit 0
subject=$(gh api "repos/$GH_REPO/commits/$sha" --jq '.commit.message | split("\n")[0]') || exit 0
case "$subject" in
  "Address review"*) ;;
  *) echo "the branch ends at ${sha:0:7}, not a review fix; nothing to do"; exit 0 ;;
esac
if gh pr merge "$PR" --disable-auto; then
  gh pr comment "$PR" --body "Auto-merge is off: ${sha:0:7} is the review's own fix, so it merges once the owner has looked (\`gh pr merge $PR --auto --merge\`)."
else
  echo "::warning title=Auto-merge still on::could not turn it off for #$PR"
fi
for _ in 1 2 3 4 5 6; do
  for id in $(gh api "repos/$GH_REPO/actions/runs?head_sha=$sha&status=action_required" --jq '.workflow_runs[].id'); do
    gh api -X POST "repos/$GH_REPO/actions/runs/$id/approve" > /dev/null && echo "approved run $id on ${sha:0:7}" \
      || echo "::warning title=Checks held::run $id on ${sha:0:7} waits for approval, and this token cannot give it"
  done
  sleep 20
done
