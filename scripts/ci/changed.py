"""The source files a change touches, for the guards that look at only those
(scripts/ci/semgrep_check.py, jscpd_check.py; docs/CI.md, "Rules": only
what a change touches). The standard library only, for the Mac's python3.

Files given on the command line are taken as they are (the edit-time hook
passes one); otherwise `--base REF` names the commit to compare with: CI's
guards fetch the pull request's base one deep and pass FETCH_HEAD, the
pre-push hook passes origin/main. The working tree's uncommitted changes
count too, so a check on the Mac sees what is about to be committed.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Not code a rule could hide in: tests, fixtures, what a generator writes
# (its generator is checked instead), and the planner's hashed detection.py.
SKIP = re.compile(
    r"(\.test\.|\.spec\.|/e2e/|/tests?/|tests_wingtip/|/test_[^/]*\.py$|Tests?/|UITests/|androidTest/|/fixtures/"
    r"|/[Gg]enerated/|\.d\.ts$|lib/engine/contract\.ts$|lib/engine/pkg/|node_modules/|/dist/|/build/"
    r"|services/planner/app/detection\.py$|planner_client\.py$|planner_models\.py$)"
)
# Where the code these guards read lives (CLAUDE.md: apps/, services/,
# engine/, tools/).
AREAS = ("apps/", "services/", "engine/", "tools/")


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout


def changed(base: str | None) -> list[str]:
    """Files added or modified against `base` (committed or not), or every tracked file without one."""
    if base is None:
        names = git("ls-files").splitlines()
    else:
        names = git("diff", "--name-only", "--diff-filter=AMR", base).splitlines()
        names += git("ls-files", "--others", "--exclude-standard").splitlines()
    return sorted({n for n in names if (ROOT / n).is_file()})


def sources(names: list[str], suffixes: tuple[str, ...]) -> list[str]:
    """Those of `names` in the code areas, with one of `suffixes`, and not skipped."""
    return [n for n in names if n.startswith(AREAS) and n.endswith(suffixes) and not SKIP.search(n)]


def pick(argv: list[str], suffixes: tuple[str, ...]) -> tuple[list[str], str | None]:
    """The files to check from argv ([--base REF] [--all] [files...]) and the base named."""
    base = argv[argv.index("--base") + 1] if "--base" in argv else None
    files = [a for a in argv if not a.startswith("--") and a != base]
    if files:
        rel = [Path(f).resolve().relative_to(ROOT).as_posix() if Path(f).is_absolute() else f for f in files]
        return sources(rel, suffixes), base
    return sources(changed(None if "--all" in argv else base), suffixes), base


def raised(base: str | None, path: str, now: dict) -> list[str]:
    """The entries of a JSON baseline (a flat or one-deep map of counts) above
    what it holds at `base`: a baseline only shrinks, and a pull request that
    raises one fails (CLAUDE.md, "Simplicity rules")."""
    if not base:
        return []
    shown = subprocess.run(["git", "-C", str(ROOT), "show", f"{base}:{path}"], capture_output=True, text=True)
    if shown.returncode != 0:
        return []
    before = json.loads(shown.stdout)

    def flat(d: dict) -> dict:
        out = {}
        for k, v in d.items():
            if isinstance(v, dict):
                out.update({f"{k} {k2}": v2 for k2, v2 in v.items()})
            else:
                out[k] = v
        return out

    old, new = flat(before), flat(now)
    return [f"{k}: {old.get(k, 0)} at {base}, {v} now" for k, v in sorted(new.items()) if v > old.get(k, 0)]
