#!/usr/bin/env python3
"""One ::error annotation per failed Android unit test and per lint error
(scripts/ci/android_build.sh, when Gradle fails): the night's red build said
only "exit code 1", and its log needs admin rights to read (CI audit
2026-11-23, H3). Reads the JUnit XML under app/build/test-results and lint's
XML report under app/build/reports, from apps/android.

  python3 scripts/ci/android_failures.py [ANDROID_DIR]
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# GitHub shows ten annotations a step: past those, one more lists the rest.
SHOWN = 9


def tests(root: Path) -> list[tuple[str, str]]:
    found = []
    for path in sorted(root.glob("app/build/test-results/**/*.xml")):
        try:
            suite = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for case in suite.iter("testcase"):
            bad = case.find("failure")
            if bad is None:
                bad = case.find("error")
            if bad is not None:
                why = (bad.get("message") or bad.text or "failed").strip().splitlines()[0]
                found.append((f"Android test failed: {case.get('classname', '').rsplit('.', 1)[-1]}.{case.get('name')}", why))
    return found


def lint(root: Path) -> list[tuple[str, str]]:
    found = []
    for path in sorted(root.glob("app/build/reports/lint-results-*.xml")):
        try:
            issues = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for issue in issues.iter("issue"):
            if issue.get("severity") not in ("Error", "Fatal"):
                continue
            where = issue.find("location")
            at = f"{where.get('file', '').split('apps/android/')[-1]}:{where.get('line', '')}" if where is not None else ""
            found.append((f"Android lint: {issue.get('id')}", f"{at} {issue.get('message', '')}".strip()))
    return found


def say(title: str, text: str) -> None:
    print(f"::error title={title}::{text.replace('%', '%25').replace(chr(10), '%0A')[:2000]}")


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    found = tests(root) + lint(root)
    for title, why in found[:SHOWN]:
        say(title, why)
    if len(found) > SHOWN:
        say(f"Android: {len(found)} failures", "\n".join(f"{t}: {w}" for t, w in found))
    if not found:
        print("android_failures: no failed test or lint error in the reports; Gradle's own error is above")
    return 0


if __name__ == "__main__":
    sys.exit(main())
