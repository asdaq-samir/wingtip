#!/usr/bin/env python3
"""One ::error annotation per failed iOS test (scripts/ci/ios_test.sh, after
the test step): its class and name and its first failure line, where the
step's own annotation named no test and the log needs admin rights to read
(CI audit 2026-11-23, H3). Reads `xcrun xcresulttool get test-results tests
--path <bundle>`'s JSON on stdin; with none (the bundle never written), the
xcodebuild log, LOG, for its "Test Case '-[Class test]' failed" lines.

  xcrun xcresulttool get test-results tests --path B.xcresult | python3 scripts/ci/ios_failures.py
  LOG=xcodebuild.log python3 scripts/ci/ios_failures.py < /dev/null
"""

from __future__ import annotations

import json
import os
import re
import sys

from junit_annotations import say

# GitHub shows ten annotations a step: past those, one more lists the rest.
SHOWN = 9


def failures(node: dict, where: tuple[str, ...] = ()) -> list[tuple[str, str]]:
    """(test, first failure line) for each failed test case under node."""
    kind, name = node.get("nodeType"), node.get("name", "")
    if kind == "Test Case" and node.get("result") == "Failed":
        messages = [c.get("name", "") for c in node.get("children", []) if c.get("nodeType") == "Failure Message"]
        return [(".".join([*where[-1:], name]), (messages or ["failed, with no message"])[0])]
    inner = (*where, name) if kind in ("Unit test bundle", "UI test bundle", "Test Suite") else where
    return [f for child in node.get("children", []) for f in failures(child, inner)]


def from_log(path: str) -> list[tuple[str, str]]:
    try:
        text = open(path, errors="replace").read()
    except OSError:
        return []
    found = []
    for test in dict.fromkeys(re.findall(r"Test Case '-\[\S+ (\S+)\]' failed|✘ Test (\S+)", text)):
        name = test[0] or test[1]
        why = re.search(rf"error: .*{re.escape(name)}.*?: (.*)", text)
        found.append((name, why[1] if why else "failed (xcodebuild's log)"))
    return found


def main() -> int:
    raw = sys.stdin.read().strip()
    try:
        found = [f for plan in json.loads(raw).get("testNodes", []) for f in failures(plan)] if raw else []
    except ValueError:
        found = []
    if not found and os.environ.get("LOG"):
        found = from_log(os.environ["LOG"])
    for test, why in found[:SHOWN]:
        say(f"iOS test failed: {test}", why)
    if len(found) > SHOWN:
        say(f"iOS: {len(found)} tests failed", "\n".join(f"{t}: {w}" for t, w in found))
    return 0


if __name__ == "__main__":
    sys.exit(main())
