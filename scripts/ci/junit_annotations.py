"""Each failing JUnit test as a GitHub annotation, which anyone can read
(a job's log takes admin rights): ci.yml's test-gateway, on failure, from
services/gateway. Its title is `Class.method`, which failure_summary.py
turns into the narrow `mvn test -Dtest=Class` that reproduces it. The
JUnit reading (`failures`) and the annotation (`say`) are also
android_failures.py's and ios_failures.py's.

  python3 scripts/ci/junit_annotations.py [REPORTS_GLOB]
"""

from __future__ import annotations

import glob
import sys
import xml.etree.ElementTree as ET
from collections.abc import Iterable, Iterator


def say(title: str, text: str) -> None:
    """One ::error annotation, its title and text escaped as GitHub's
    workflow commands want them (a title's ":" and "," end it)."""
    title = title.replace("%", "%25").replace(":", "%3A").replace(",", "%2C")
    text = text.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    print(f"::error title={title}::{text[:2000]}")


def failures(paths: Iterable[str]) -> Iterator[tuple[str, list[str]]]:
    """Each failed or erred test case in JUnit XML reports: its
    `Class.method` and the problem's lines (its text, else its message).
    A report that is not XML is passed over."""
    for path in paths:
        try:
            suite = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for case in suite.iter("testcase"):
            for problem in [*case.iter("failure"), *case.iter("error")]:
                test = (case.get("classname") or "").rsplit(".", 1)[-1] + "." + (case.get("name") or "")
                yield test, (problem.text or problem.get("message") or "failed").strip().splitlines()


def main(pattern: str = "target/surefire-reports/TEST-*.xml") -> None:
    for test, lines in failures(sorted(glob.glob(pattern))):
        say(test, "\n".join(lines[:6] + [line for line in lines[6:] if line.startswith("Caused by")]))


if __name__ == "__main__":
    main(*sys.argv[1:2])
