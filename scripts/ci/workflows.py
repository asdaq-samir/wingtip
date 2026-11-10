"""The workflows in .github/workflows, read line by line for the CI guards
(scripts/ci/test_tiers.py, scripts/ci/workflow_rules.py).

Not a YAML parser: the workflows are written in one layout (two-space
indents, a job's keys four spaces in, its steps under `steps:` as `- `
items), and this reads that layout. The standard library only, so the
guards run on the Mac's python3 (3.9) and a bare runner in seconds.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"

_JOB = re.compile(r"^  ([A-Za-z0-9_-]+):\s*$")
_KEY = re.compile(r"^    ([a-z-]+):\s*(.*)$")
_STEP = re.compile(r"^(\s*)- ")
_RUN = re.compile(r"^(\s*)(?:- )?run:\s*(.*)$")
_WD = re.compile(r"^\s*(?:- )?working-directory:\s*(.*)$")
_NAME = re.compile(r"^\s*- name:\s*(.*)$")


@dataclass
class Run:
    """One step's `run:`, its lines as written and where it starts."""

    line: int
    lines: list[str]
    name: str
    working_directory: str

    @property
    def text(self) -> str:
        return "\n".join(self.lines)


@dataclass
class Job:
    file: str
    id: str
    line: int
    keys: dict[str, str] = field(default_factory=dict)
    runs: list[Run] = field(default_factory=list)
    body: list[str] = field(default_factory=list)

    @property
    def nightly_only(self) -> bool:
        """A job a pull request never runs: its `if:` asks for the night
        (or a run by hand) and nothing else."""
        cond = self.keys.get("if", "")
        return "schedule" in cond and "pull_request" not in cond


@dataclass
class Workflow:
    path: Path
    lines: list[str]
    jobs: list[Job]

    @property
    def name(self) -> str:
        return self.path.name


def _clean(value: str) -> str:
    value = value.split("  #", 1)[0].strip()
    return _unquote(value)


def _unquote(value: str) -> str:
    if len(value) > 1 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def _block(lines: list[str], start: int, indent: int) -> list[str]:
    """The lines of a `key: |` block: those indented past the key."""
    out = []
    for text in lines[start + 1 :]:
        if text.strip() and len(text) - len(text.lstrip()) <= indent:
            break
        out.append(text.strip())
    while out and not out[-1]:
        out.pop()
    return out


def _step(lines: list[str], i: int) -> tuple[str, str]:
    """A step's name and working-directory, read from its first line on."""
    name, wd = "", ""
    for later in lines[i : i + 60]:
        if later is not lines[i] and later.strip() and len(later) - len(later.lstrip()) <= 6:
            break
        n = _NAME.match(later)
        if n:
            name = _clean(n.group(1))
        w = _WD.match(later)
        if w:
            wd = _clean(w.group(1))
    return name, wd


def read(path: Path) -> Workflow:
    lines = path.read_text().splitlines()
    jobs: list[Job] = []
    in_jobs = in_steps = False
    job: Job | None = None
    default_wd = step_name = step_wd = ""
    for i, text in enumerate(lines):
        if text and not text.startswith(" ") and not text.startswith("#"):
            in_jobs = text.startswith("jobs:")
            job = None
            continue
        if not in_jobs:
            continue
        m = _JOB.match(text)
        if m:
            job = Job(path.name, m.group(1), i + 1)
            jobs.append(job)
            in_steps, default_wd = False, ""
            continue
        if job is None:
            continue
        job.body.append(text)
        m = _KEY.match(text)
        if m:
            job.keys[m.group(1)] = _clean(m.group(2))
            in_steps = m.group(1) == "steps"
        m = _WD.match(text)
        if m and not in_steps:
            default_wd = _clean(m.group(1))
        m = _STEP.match(text)
        if in_steps and m and len(m.group(1)) == 6:
            step_name, step_wd = _step(lines, i)
        m = _RUN.match(text)
        if in_steps and m and len(m.group(1)) >= 6:
            value = m.group(2).strip()
            indent = len(m.group(1)) + (2 if text.lstrip().startswith("- ") else 0)
            body = _block(lines, i, indent) if value in ("|", ">", "|-", ">-") else [_unquote(value)]
            job.runs.append(Run(i + 1, body, step_name, step_wd or default_wd))
    return Workflow(path, lines, jobs)


def all_workflows() -> list[Workflow]:
    return [read(p) for p in sorted(WORKFLOWS.glob("*.yml"))]
