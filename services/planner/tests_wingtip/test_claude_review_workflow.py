"""The review workflow's two Claude runs (.github/workflows/claude-review.yml):
the review reads the web for a regulation's own text, and the job that puts
its comments right, which may push and run commands, reads no page at all,
so nothing a fetched page says reaches a run that can act on it (the first
security review's L11, closed by the deep one of 2026-11-21)."""

import re
from pathlib import Path

WORKFLOW = (Path(__file__).resolve().parents[3] / ".github/workflows/claude-review.yml").read_text()


def _tools(job: str) -> set[str]:
    block = re.search(rf"^  {job}:\n(.*?)(?=^  \w|\Z)", WORKFLOW, re.M | re.S)[1]
    return set(re.search(r'--allowedTools "([^"]+)"', block)[1].split(","))


def test_the_job_that_can_push_fetches_no_page():
    tools = _tools("address")
    assert "Edit" in tools and "Bash(git:*)" in tools
    assert not {t for t in tools if t.startswith(("WebFetch", "WebSearch"))}


def test_the_review_that_fetches_cannot_write_code():
    tools = _tools("review")
    assert "WebFetch" in tools
    assert not tools & {"Edit", "MultiEdit", "Write", "Bash(git:*)", "Bash(gh:*)"}
