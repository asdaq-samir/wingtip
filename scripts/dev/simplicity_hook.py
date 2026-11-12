#!/usr/bin/env python3
"""Claude Code's PostToolUse hook on Edit and Write (.claude/settings.json):
the simplicity rules checked on the one file just written, so an agent
meets them while writing rather than at the push (CLAUDE.md, "Simplicity
rules"; the owner, 2026-11-12: "how do you make them hard rules so agents
know to follow them").

For a file under apps/, services/, engine/ or tools/ it runs, at once and
on that file only, the checks that take a second or two: the one-home rules
(scripts/ci/semgrep_check.py), no aviation rule outside the engine
(scripts/ci/rules_boundary.py), the file-size budget (scripts/ci/file_sizes.py),
and for a .tsx the stock-component bans (ESLint, where Node is installed).
Each runs from the edited file's own checkout, so a worktree's agent is
held to its own branch's rules. A break goes back to the agent as the
hook's "block" decision with the checks' words, for it to put right at
once; the edit itself has happened, and nothing else is stopped.

It fails open: a tool not installed, a check that errs or overruns, a file
outside those folders, or anything it cannot read lets the edit stand
quietly. The pre-push hook and CI's guards hold the same rules regardless.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

AREAS = ("apps/", "services/", "engine/", "tools/")
TIMEOUT = 8  # seconds a check may take before it is let go


def run(cmd: list[str], cwd: Path) -> str | None:
    """The check's words when it fails (exit 1), None when it passes or cannot run."""
    try:
        out = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=TIMEOUT)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode == 1:
        return (out.stdout + out.stderr).strip()[-3000:]
    return None


def main() -> int:
    try:
        call = json.load(sys.stdin)
        path = Path(call.get("tool_input", {}).get("file_path", "")).resolve()
    except (ValueError, AttributeError, OSError):
        return 0
    if not path.is_file():
        return 0
    try:
        root = Path(
            subprocess.run(
                ["git", "-C", str(path.parent), "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=3, check=True
            ).stdout.strip()
        )
        rel = path.relative_to(root).as_posix()
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0
    if not rel.startswith(AREAS):
        return 0

    py = sys.executable or "python3"
    ci = root / "scripts/ci"
    checks = []
    if (ci / "semgrep_check.py").exists():
        checks.append(("one home per constant or helper", [py, str(ci / "semgrep_check.py"), rel]))
    if (ci / "rules_boundary.py").exists():
        checks.append(("no aviation rule outside the engine", [py, str(ci / "rules_boundary.py"), rel]))
    if (ci / "file_sizes.py").exists():
        checks.append(("file size", [py, str(ci / "file_sizes.py"), rel]))
    web = root / "apps/web"
    if rel.startswith("apps/web/src/") and rel.endswith(".tsx") and shutil.which("npx") and (web / "node_modules").is_dir():
        checks.append(("stock components (ESLint)", ["npx", "--no-install", "eslint", "--max-warnings", "0", rel[len("apps/web/") :]]))

    def one(check):
        name, cmd = check
        return name, run(cmd, web if cmd[0] == "npx" else root)

    with ThreadPoolExecutor(len(checks) or 1) as pool:
        failed = [(name, words) for name, words in pool.map(one, checks) if words]
    if not failed:
        return 0
    reason = "\n\n".join(f"{name}:\n{words}" for name, words in failed)
    print(
        json.dumps(
            {
                "decision": "block",
                "reason": f"{rel} breaks the simplicity rules (CLAUDE.md, \"Simplicity rules\"). Fix it now, in this "
                f"file: never by raising a baseline or an allow list.\n\n{reason}",
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # noqa: BLE001 -- a hook that breaks must not stop the edit
        sys.exit(0)
