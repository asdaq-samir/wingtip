---
name: ship
description: Commit, push and land a change in this repo. Covers which branch, what never to stage, how a commit message here reads, pulling before a push, the auto-merge path to main, and following CI through the public API until the change is merged. Use whenever committing, pushing or opening a pull request, and when CI fails.
---

# Ship

A change is shipped when it is merged to `main` with CI green. Until then, say exactly where it stands.

**The standing rule (the owner, 2026-11-08): code first, validation at the end.** During a wave of work, a change is a branch pushed once with no pull request, after only a compile or type check. The branches are merged into `claude/integration`. At the end of the wave, the `checks` skill runs in full there, its fixes are made, and only then are a few grouped pull requests opened (section 4). Don't wait on CI or chase CI failures push by push.

## 1. Before committing
- **Branch:** `claude/<topic>`, from `main` (not `claude/native-*`, which starts the phone workflows on push). Never commit to `main`, never force-push, never tag a commit.
- **During the wave:** a compile or type check of what changed, and the generated files it needs. Tests are written, not run.
- **For the grouped pull requests at the end:** the `checks` skill in full on the integration branch. A green run against a stale image or a container that loaded old code is not evidence.

## 2. Stage by name
```sh
git add <path> <path>
git status --short && git diff --cached --stat
```
- Never `git add -A` or `git add .`.
- Never stage `data/labels/` or `data/processed/`. They hold the owner's ratings and features, changed locally on purpose.
- Never stage `.env`, `infra/local-https/certs/`, `data/raw/` or anything else the user keeps locally.
- If generated files changed (OpenAPI documents, `apps/web/src/lib/api/*.d.ts`), commit them with the change that caused them.

## 3. The message
One paragraph, in plain sentences:
- what changed for the pilot or the developer;
- why;
- the evidence: the tests run, with counts, and any measurement, with its numbers and how it was taken.

Write "airplane". Read `git log -3 --format=%B` first to match the voice. End with the Co-Authored-By trailer.

## 4. Push
During the wave, push the branch once when its code is done, with no pull request (no CI runs):
```sh
git push -u origin claude/<topic>
```
At the end of the wave, after the full checks pass on `claude/integration`, open the grouped pull requests (a few, each a coherent area), one at a time and ten seconds apart:
```sh
gh pr create --base main --head <branch> --title "..." --body-file <file>
```
To bring a branch up to date, `git merge origin/main` (never rebase a pushed branch). auto-merge-agents.yml turns auto-merge on as the pull request opens, and it merges by itself once the "CI passed" check is green: tier 1, about three minutes (docs/CI.md, "The tiers"). The browser smoke, the image builds and the iPhone's UI smoke run after the merge, on main's push; a failure there opens or updates the one issue "Main CI failed (after merge)", labelled `ready`, which is fixed before new feature work. Claude's review runs only when the "review" label is put on it (the owner, 2026-11-06). Nothing merges red.

## 5. Follow CI
- **One push at a time when it matters.** On a pull request, ci.yml cancels the running CI on the same branch when a new push arrives (main's runs queue instead), and the cancelled run's path-filtered jobs never run again on that pull request. Main's push runs what changed since its last green commit, so nothing is lost after the merge.
- **In CI,** `gh` is installed and signed in, so use `gh run view`, `gh pr checks` and the rest.
- **On the owner's Mac there's no `gh` CLI.** Use the public API with `curl`, every three minutes at most (CI takes about two): it allows 60 requests an hour unauthenticated, and a poller that runs while you wait on something else is still polling. Don't use Python's `urllib`, because the host's Python has no CA bundle.
  ```sh
  curl -s "https://api.github.com/repos/asdaq-samir/wingtip/actions/runs?head_sha=$(git rev-parse HEAD)"   # the run
  curl -s "https://api.github.com/repos/asdaq-samir/wingtip/actions/runs/<run id>/jobs"                       # its jobs
  curl -s "https://api.github.com/repos/asdaq-samir/wingtip/check-runs/<job id>/annotations"                 # why one failed
  ```
- **Read the annotations before guessing.** test-gateway turns each failing Java test into an annotation, guards one per failed check ("Guard failed: <name>", its last lines), and e2e (main's push) posts one per failed test plus the planner's data and log. Job logs themselves need authentication.
- **Rerunning a failed job** needs the GitHub login that git keeps in the keychain (`git credential fill`): `POST /actions/runs/<id>/rerun-failed-jobs`. The user has allowed this. Never print the token.
- **Write to GitHub gently.** GitHub suspended the owner's account in October 2026, most likely for nine issues opened through the API in ten seconds. With the owner's login, through the API or `gh`:
  - one write at a time, at least ten seconds apart, never in a loop or several calls in one command;
  - at most five new issues or pull requests in a session: put a longer list in one issue as a checklist;
  - no writes the task doesn't need (no label tidying, no re-runs to see if a flake repeats; read the annotations first);
  - a 403 or 429 stops all writes for the session, and tell the owner.
- **Pull requests opened by github-actions[bot]** leave their runs at "action_required". Approve them with `POST /actions/runs/<id>/approve`.
- **The Claude review job** isn't part of the "CI passed" gate. When it fails for lack of API credit, that is the user's to top up, not a reason to hold the merge.

## 6. Report
Give the commit, the PR, CI's result per job, and whether it merged. If something is still running or failed, say which and what you did about it.
