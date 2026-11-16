#!/usr/bin/env python3
"""A pull request that conflicts with its base says so, in one comment
(the owner, 2026-11-15: "a scheduled check flags any open PR that is
CONFLICTING with one comment"). .github/workflows/update-branches.yml runs
this on main's push, where most conflicts are made, and a few times a day.

GitHub starts no pull-request workflow on a pull request that conflicts,
so it shows no failing check at all: #579 conflicted with main for a day
under the one label needs-merge, and nobody saw it.

Every open pull request is asked for GitHub's `mergeable`:

- CONFLICTING: it carries exactly one comment from this check, known by
  the hidden MARK in its body. None there, one is written; one there,
  nothing is.
- MERGEABLE: a marked comment is removed, so a later conflict is flagged
  afresh.
- UNKNOWN: GitHub works `mergeable` out in the background, only once it
  is asked. It is asked again RETRIES times, RETRY_SECONDS apart, and a
  pull request still unknown then is left for the next run.

Gently, as CLAUDE.md's "write to GitHub gently" says: at most one write a
pull request a run, GAP_SECONDS before each (the first too, since the
step before this one may have just written), at most MAX_WRITES a run,
none when nothing changed, and a 403 or a 429 ends the run's writes.

Env: GH_TOKEN and GH_REPO; GAP_SECONDS (10), MAX_WRITES (10), RETRIES (3)
and RETRY_SECONDS (5) where another figure is wanted; DRY_RUN=1 is
--dry-run, which says what it would write and writes nothing. The
standard library and gh only.

  python3 scripts/ci/pr_conflicts.py [--dry-run]
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

MARK = "<!-- pr-conflicts -->"


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def words(base: str) -> str:
    """The comment. CLAUDE.md, "Branches": merge to bring a branch up to date, never rebase a pushed one."""
    return (
        f"{MARK}\n"
        f"This branch conflicts with `{base}`. GitHub starts no CI on a pull request that conflicts, so no check "
        f"will run or fail here, and nothing merges, until it is resolved: merge `{base}` into the branch "
        f"(`git merge origin/{base}`) and push. Never rebase a pushed branch. "
        "This comment is taken off once the branch merges cleanly again."
    )


def open_prs(retries: int, wait: float) -> list[dict]:
    """The open pull requests, each with its number, base and `mergeable`, the unknown ones asked again."""
    prs = json.loads(gh("pr", "list", "--state", "open", "--limit", "100", "--json", "number,baseRefName,mergeable"))
    for attempt in range(1, retries + 1):
        unknown = [pr for pr in prs if pr["mergeable"] == "UNKNOWN"]
        if not unknown:
            break
        print(f"{len(unknown)} pull request(s) GitHub has not worked out yet; asked again in {wait:g} s ({attempt} of {retries})")
        time.sleep(wait)
        for pr in unknown:
            pr["mergeable"] = gh("pr", "view", str(pr["number"]), "--json", "mergeable", "--jq", ".mergeable").strip()
    return sorted(prs, key=lambda pr: pr["number"])


def marked(repo: str, number: int) -> list[str]:
    """The ids of this check's comments on a pull request, oldest first."""
    mine = f'.[] | select(.body | contains("{MARK}")) | .id'
    return gh("api", f"repos/{repo}/issues/{number}/comments?per_page=100", "--paginate", "--jq", mine).split()


def wanted(repo: str, pr: dict) -> tuple[str, tuple[str, ...]] | None:
    """The one write a pull request needs, as what to say of it and gh's arguments; None when it needs none."""
    number, base, state = pr["number"], pr["baseRefName"], pr["mergeable"]
    if state == "UNKNOWN":
        print(f"#{number}: GitHub has not said whether it merges; left for the next run")
        return None
    ids = marked(repo, number)
    if state == "CONFLICTING" and not ids:
        body = words(base)
        return f"conflicts with {base}; comment:\n{body}", ("-X", "POST", f"repos/{repo}/issues/{number}/comments", "-f", f"body={body}")
    if state == "CONFLICTING" and len(ids) == 1:
        print(f"#{number}: conflicts with {base}, and its comment says so already")
        return None
    if ids:
        # Not conflicting any more, or more than the one comment: the newest goes.
        why = "more than one comment" if state == "CONFLICTING" else "merges cleanly now"
        return f"{why}; remove comment {ids[-1]}", ("-X", "DELETE", f"repos/{repo}/issues/comments/{ids[-1]}")
    print(f"#{number}: merges cleanly")
    return None


def main() -> int:
    dry = "--dry-run" in sys.argv[1:] or os.environ.get("DRY_RUN") == "1"
    repo = os.environ["GH_REPO"]
    gap = float(os.environ.get("GAP_SECONDS", "10"))
    most = int(os.environ.get("MAX_WRITES", "10"))
    writes = failed = 0
    for pr in open_prs(int(os.environ.get("RETRIES", "3")), float(os.environ.get("RETRY_SECONDS", "5"))):
        write = wanted(repo, pr)
        if write is None:
            continue
        what, call = write
        if writes >= most:
            print(f"#{pr['number']}: {what.splitlines()[0]}; this run's {most} writes are spent")
            continue
        writes += 1
        if dry:
            print(f"#{pr['number']}: would write: {what}")
            continue
        time.sleep(gap)
        try:
            gh("api", *call)
            print(f"#{pr['number']}: {what.splitlines()[0]}; written")
        except subprocess.CalledProcessError as error:
            failed += 1
            said = (error.stderr or error.stdout).strip()
            print(f"::warning title=Pull request conflicts::#{pr['number']}: {said}")
            # A 403 or a 429 is GitHub asking for fewer writes: stop.
            if "HTTP 403" in said or "HTTP 429" in said:
                break
    print(f"{'Would make' if dry else 'Made'} {writes - failed} write(s).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as error:
        print(f"pr_conflicts: gh {' '.join(error.cmd[1:4])} failed: {(error.stderr or '').strip()}", file=sys.stderr)
        sys.exit(1)
