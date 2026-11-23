"""The CI autofix bot (.github/workflows/ci-autofix.yml, scripts/ci/autofix_format.sh):
a branch's formatters are that branch's code, so they run on a machine that
holds no token, and only their diff reaches the job that pushes. The deep
security review of 2026-11-21 found them run beside MERGE_TOKEN, the owner's
own, which env -u kept out of their environment only: /proc of the script
that called them, or a .git/hooks/pre-push they wrote for the push after,
handed it over."""

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = (ROOT / ".github/workflows/ci-autofix.yml").read_text()
SCRIPT = ROOT / "scripts/ci/autofix_format.sh"


def _job(name: str) -> str:
    match = re.search(rf"^  {name}:\n(.*?)(?=^  \w|\Z)", WORKFLOW, re.M | re.S)
    assert match, name
    return match[1]


def test_the_job_that_runs_the_branchs_formatters_holds_no_token():
    job = _job("format")
    assert re.search(r"permissions: \{ contents: read \}", job)
    for token in ("secrets.", "github.token", "GH_TOKEN", "PUSH_TOKEN", "MERGE_TOKEN"):
        assert token not in job, token
    assert "persist-credentials: false" in job
    assert "autofix_format.sh format" in job


def test_the_job_that_pushes_runs_no_formatter_and_no_code_of_the_branchs():
    job = _job("push")
    assert "autofix_format.sh push" in job
    assert "format.sh" not in job.replace("autofix_format.sh", "")
    assert "setup-java" not in job


def test_the_top_permissions_are_read_only():
    top = WORKFLOW.split("\njobs:")[0]
    assert re.search(r"^permissions:\n  contents: read\n", top, re.M)


def _repo(tmp_path: Path) -> Path:
    repo = tmp_path / "branch"
    (repo / "scripts/dev").mkdir(parents=True)
    (repo / "a.py").write_text("x=1\n")
    formatter = repo / "scripts/dev/format.sh"
    # The branch's own formatter: it lays out a.py, and writes down whatever
    # token it can see in its environment.
    formatter.write_text('#!/bin/sh\nprintf "x = 1\\n" > a.py\nenv | grep -i token > "$(dirname "$0")/../../seen" || true\n')
    formatter.chmod(0o755)
    git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.com"]
    subprocess.run([*git[:3], "init", "-q"], check=True)
    subprocess.run([*git, "add", "."], check=True)
    subprocess.run([*git, "commit", "-qm", "base"], check=True)
    return repo


def test_format_writes_the_diff_and_asks_github_nothing(tmp_path):
    repo = _repo(tmp_path)
    sha = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    patch = tmp_path / "formatted.patch"
    env = {"PATH": os.environ["PATH"], "HOME": str(tmp_path), "LANGS": "python", "SHA": sha}
    subprocess.run(["bash", str(SCRIPT), "format", str(patch)], cwd=repo, env=env, check=True)
    assert "+x = 1" in patch.read_text()
    assert not (repo / "seen").read_text().strip()
