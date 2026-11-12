#!/usr/bin/env python3
"""No new aviation rule outside the engine (CLAUDE.md, issue #482).

Every aviation rule or figure lives once in the Rust engine (engine/), named
in engine/facade/src/call.rs; the apps, the gateway and the planner's app
ask it by name. This finds the shape a rule written outside it takes: a
constant set to a number, in code, with a regulatory source cited on its
line or in the comment just above it (14 CFR, a part 61/91/71/73/95/97
section, the AIM, an AC, the ACS, an FAA Order) -- "the 30-minute reserve
(14 CFR 91.151)  const RESERVE_MIN = 30". And a few rule names the engine
owns, defined again (`func flightLevel`, `def is_night` ...).

What is there today and is not a rule -- a display bound, a unit, a
parser's own limit -- is listed in scripts/ci/rules_boundary_allow.txt as
a count per file, with why. A file with more than its count, or a file not
listed with any, fails: move the rule into the engine (engine/README.md,
"adding a rule") and ask it by name; or, where it is not a rule, add the
file with its reason. A file with fewer than its count is said, so the
list shrinks as #482 does.

  python3 scripts/ci/rules_boundary.py              check
  python3 scripts/ci/rules_boundary.py --list       print every hit
  python3 scripts/ci/rules_boundary.py FILE...      only those files (the edit-time hook)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOW = ROOT / "scripts/ci/rules_boundary_allow.txt"

# Where rules must not be written, and the files there that are not code
# the rule could hide in (generated types, tests, fixtures).
# The planner's wingtip/ too: its 91.169 window was a figure the engine
# also judged by (the simplicity measure of 2026-11-10).
# Every service and tool since 2026-11-12: the crash pipeline's and Model
# Weather's figures went unchecked in weather/, jobs/ and ingest/ (the
# simplicity audit of that day, finding 7).
AREAS = [
    "apps/web/src",
    "apps/ios/Wingtip",
    "apps/ios/WingtipWidgets",
    "apps/ios/WingtipWatch",
    "apps/android/app/src/main",
    "services/gateway/src/main",
    "services/planner/app",
    "services/planner/wingtip",
    "services/weather/app",
    "services/ingest/ingest",
    "services/jobs",
    "services/assistant/app",
    "tools",
]
SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".swift", ".kt", ".java", ".py", ".cs"}
SKIP = re.compile(
    r"(\.test\.|\.spec\.|/fixtures/|/Generated/|/generated/|apps/ios/WingtipAPI/|lib/engine/contract\.ts|lib/api/types\.ts|"
    r"EngineContract\.(swift|kt)|/tests?/|/test_[^/]*\.py$|Tests?/|/bin/|/obj/|node_modules/|"
    r"planner_client\.py$|planner_models\.py$|services/planner/app/detection\.py)"
)

# A source of an aviation figure, as this repo's comments cite one: the
# FAA's handbooks too (FAA-H-8083-28B took AC 00-45H's place in 2022).
CITATION = re.compile(r"14 CFR|\bCFR\b|§|\bAIM\b|\bAC \d{2,3}-\d|\bACS\b|FAA Order|FAA-H-\d{4}|\b(61|91|71|73|95|97|135)\.\d{2,3}\b")
# A constant set to a number, or to a list of numbers (a cited table of
# steps: `RUNWAY_STEPS = [2000, 3000]`, `listOf(1, 2)`, a tuple): TS/JS
# const, Swift let/var, Kotlin val/const val, Java static final, C# const,
# a Python module constant.
VALUE = r"=\s*(?:\[\s*|\(\s*|(?:listOf|arrayOf|setOf|doubleArrayOf|intArrayOf|floatArrayOf)\(\s*)?-?\(?\s*[\d][\d_.]*\b"
CONSTANT = re.compile(
    r"^\s*(?:export\s+)?(?:(?:private|internal|public|static|const|final|let|var|val|override|readonly)\s+)*"
    r"(?:const|let|var|val|final\s+\w+|static\s+final\s+\w+|const\s+\w+)\s+[A-Za-z_]\w*\s*(?::\s*[\w.<>?\[\]]+\s*)?"
    + VALUE
    + r"|^[A-Z_][A-Z0-9_]+\s*(?::\s*[\w\[\], .]+)?"
    + VALUE
)
COMMENT = re.compile(r"^\s*(//|/\*|\*|#|///)")
# The engine's rules by name, defined again outside it.
RULE_NAMES = re.compile(
    r"\b(?:function|func|fun|def)\s+(flightLevel|flight_level|isNight|is_night|cruisingAltitudes|"
    r"cruising_altitudes|reserveMinutes|reserve_min|vfrMinimums|vfr_minimums|holdEntry|hold_entry|"
    r"windTriangle|wind_triangle|descentFtPerNm|descent_ft_per_nm|"
    # The small rules each app once wrote for itself: the paperwork's tone,
    # the drills' boxes, the aircraft form's limits, the sphere's figures.
    r"dueTone|due_tone|drillNext|drill_next|aircraftProblems|aircraft_problems|bearingDeg|bearing_deg)\s*[(<]"
)


def hits(path: Path) -> list[tuple[int, str]]:
    found = []
    lines = path.read_text(errors="replace").splitlines()
    for i, line in enumerate(lines):
        if RULE_NAMES.search(line):
            found.append((i + 1, line.strip()))
            continue
        if COMMENT.match(line) or not CONSTANT.search(line):
            continue
        # The constant's own line and the comment block right above it.
        above = []
        j = i - 1
        while j >= 0 and COMMENT.match(lines[j]) and len(above) < 6:
            above.append(lines[j])
            j -= 1
        if CITATION.search(line) or any(CITATION.search(a) for a in above):
            found.append((i + 1, line.strip()))
    return found


def scanned(rel: str) -> bool:
    return rel.startswith(tuple(a + "/" for a in AREAS)) and Path(rel).suffix in SUFFIXES and not SKIP.search(rel)


def scan(only: list[str] | None = None) -> dict[str, list[tuple[int, str]]]:
    out = {}
    if only is None:
        paths = [p for area in AREAS for p in sorted((ROOT / area).rglob("*"))]
    else:
        paths = [ROOT / p for p in only]
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        if scanned(rel) and path.is_file():
            found = hits(path)
            if found:
                out[rel] = found
    return out


def allowed() -> dict[str, int]:
    out = {}
    for line in ALLOW.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            rel, count = line.rsplit(" ", 1)
            out[rel.strip()] = int(count)
    return out


def main() -> int:
    # Files given (the edit-time hook passes one): only those, against the
    # same allow list.
    only = [Path(a).resolve().relative_to(ROOT).as_posix() for a in sys.argv[1:] if not a.startswith("--")]
    found = scan(only or None)
    if "--list" in sys.argv:
        for rel, items in found.items():
            for n, text in items:
                print(f"{rel}:{n}: {text}")
        return 0
    allow = allowed()
    failed = False
    for rel, items in found.items():
        if len(items) > allow.get(rel, 0):
            failed = True
            print(
                f"::error file={rel}::{len(items)} aviation figure(s) or rule(s) here, {allow.get(rel, 0)} allowed "
                "(scripts/ci/rules_boundary_allow.txt). Move the rule into the engine and ask it by name (engine/README.md), "
                "or, where it is not a rule, list the file with why."
            )
            for n, text in items:
                print(f"  {rel}:{n}: {text}")
    for rel, count in allow.items():
        if only and rel not in only:
            continue
        have = len(found.get(rel, []))
        if have < count:
            print(f"{rel}: {have} now, {count} allowed: lower its count in rules_boundary_allow.txt.")
    if not failed:
        print(f"rules boundary: {sum(len(v) for v in found.values())} known figure(s) in {len(found)} file(s), none new.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
