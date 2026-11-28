#!/usr/bin/env bash
# claude-review.yml's approve job, after the address job: when the
# branch has moved past the commit the review ran on (the address job's fix), turn the
# pull request's auto-merge off, so the owner looks at it before it merges
# (security review 2026-11-23, M6: the review that wrote the fix's
# instructions may have fetched pages), and approve the fix's checks,
# which GitHub holds for a workflow's push (action_required). The runs
# appear a few seconds after the push, so the commit is asked after for
# two minutes. Runs on a machine that never ran the branch's code, with
# the owner's token (H1). Whether the address job pushed is told by the
# head moving from BEFORE, the sha the review ran on, not by the newest
# commit's subject, which another subject or a later commit would hide
# (the safety audit of 2026-11-23, L11). Env: GH_TOKEN, GH_REPO, BRANCH,
# PR, BEFORE.
set -uo pipefail
sha=$(gh api "repos/$GH_REPO/branches/$BRANCH" --jq .commit.sha) || exit 0
if [ "$sha" = "${BEFORE:-}" ]; then
  echo "the branch is still at ${sha:0:7}, where the review ran; nothing to do"
  exit 0
fi
if gh pr merge "$PR" --disable-auto; then
  gh pr comment "$PR" --body "Auto-merge is off: ${sha:0:7} came after the review ran (its fix), so it merges once the owner has looked (\`gh pr merge $PR --auto --merge\`)."
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
