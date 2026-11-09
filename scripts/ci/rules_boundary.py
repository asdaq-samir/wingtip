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

  python3 scripts/ci/rules_boundary.py         check
  python3 scripts/ci/rules_boundary.py --list  print every hit
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOW = ROOT / "scripts/ci/rules_boundary_allow.txt"

# Where rules must not be written, and the files there that are not code
# the rule could hide in (generated types, tests, fixtures).
AREAS = ["apps/web/src", "apps/ios/Wingtip", "apps/android/app/src/main", "services/gateway/src/main", "services/planner/app"]
SUFFIXES = {".ts", ".tsx", ".swift", ".kt", ".java", ".py"}
SKIP = re.compile(r"(\.test\.|\.spec\.|/fixtures/|/Generated/|/generated/|lib/engine/contract\.ts|lib/api/types\.ts|"
                  r"EngineContract\.(swift|kt)|/tests?/|services/planner/app/detection\.py)")

# A source of an aviation figure, as this repo's comments cite one.
CITATION = re.compile(r"14 CFR|\bCFR\b|§|\bAIM\b|\bAC \d{2,3}-\d|\bACS\b|FAA Order|\b(61|91|71|73|95|97|135)\.\d{2,3}\b")
# A constant set to a number: TS/JS const, Swift let/var, Kotlin val/const
# val, Java static final, a Python module constant.
CONSTANT = re.compile(
    r"^\s*(?:export\s+)?(?:(?:private|internal|public|static|const|final|let|var|val|override)\s+)*"
    r"(?:const|let|var|val|final\s+\w+|static\s+final\s+\w+)\s+[A-Za-z_]\w*\s*(?::\s*[\w.<>?]+\s*)?=\s*-?\(?\s*[\d][\d_.]*\b"
    r"|^[A-Z][A-Z0-9_]+\s*(?::\s*[\w\[\], ]+)?=\s*-?[\d][\d_.]*\b")
COMMENT = re.compile(r"^\s*(//|/\*|\*|#|///)")
# The engine's rules by name, defined again outside it.
RULE_NAMES = re.compile(r"\b(?:function|func|fun|def)\s+(flightLevel|flight_level|isNight|is_night|cruisingAltitudes|"
                        r"cruising_altitudes|reserveMinutes|reserve_min|vfrMinimums|vfr_minimums|holdEntry|hold_entry|"
                        r"windTriangle|wind_triangle|descentFtPerNm|descent_ft_per_nm)\s*[(<]")


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


def scan() -> dict[str, list[tuple[int, str]]]:
    out = {}
    for area in AREAS:
        for path in sorted((ROOT / area).rglob("*")):
            rel = path.relative_to(ROOT).as_posix()
            if path.suffix in SUFFIXES and path.is_file() and not SKIP.search(rel):
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
    found = scan()
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
            print(f"::error file={rel}::{len(items)} aviation figure(s) or rule(s) here, {allow.get(rel, 0)} allowed "
                  "(scripts/ci/rules_boundary_allow.txt). Move the rule into the engine and ask it by name (engine/README.md), "
                  "or, where it is not a rule, list the file with why.")
            for n, text in items:
                print(f"  {rel}:{n}: {text}")
    for rel, count in allow.items():
        have = len(found.get(rel, []))
        if have < count:
            print(f"{rel}: {have} now, {count} allowed: lower its count in rules_boundary_allow.txt.")
    if not failed:
        print(f"rules boundary: {sum(len(v) for v in found.values())} known figure(s) in {len(found)} file(s), none new.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
