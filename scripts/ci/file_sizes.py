#!/usr/bin/env python3
"""No source file grows past 400 lines (the modular-architecture rule).

A file that does one thing is short; the god files (a 2,250-line hook, a
3,100-line schemas module) made every change touch many places. This holds
the budget without a big-bang split: every tracked source file -- TypeScript,
Python, Rust, Swift, Kotlin, Java -- is at most BUDGET lines, except those in
scripts/ci/file_sizes_allow.txt, each listed at the lines it had when it was
listed, which it may not pass. A new file over the budget, or a listed one
that grew, fails: split it (or take what grew out). A listed file that
shrank is said, and `--write` lowers its count (and drops it once it is
within the budget), so the list only shrinks. With `--base REF` (CI passes
main's), an entry added to the list or raised against REF's list fails too:
the list is not a way round the budget.

Generated files are left out (their generators are checked elsewhere):
anything under a generated/ or Generated/ folder, the web's types from the
API documents and the engine's contract, and *.d.ts.

The standard library only, for the Mac's python3 (3.9) and CI's.

  python3 scripts/ci/file_sizes.py                  check
  python3 scripts/ci/file_sizes.py --base origin/main
  python3 scripts/ci/file_sizes.py --write          rewrite the list's counts down
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOW = ROOT / "scripts/ci/file_sizes_allow.txt"
BUDGET = 400
SUFFIXES = (".ts", ".tsx", ".py", ".rs", ".swift", ".kt", ".java")
GENERATED = re.compile(
    r"(^|/)(generated|Generated)/|\.d\.ts$|^apps/web/src/lib/engine/contract\.ts$")
HEADER = """\
# Source files over scripts/ci/file_sizes.py's budget (400 lines) when the
# budget came in, each at the lines it had then: "<path> <lines>". A file
# here may not grow past its count, and none is added; split one and lower
# its count (`python3 scripts/ci/file_sizes.py --write`), and it leaves the
# list once it is within the budget.
"""


def tracked() -> list:
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z"], capture_output=True, check=True).stdout
    return [p for p in out.decode().split("\0") if p.endswith(SUFFIXES) and not GENERATED.search(p)]


def lines_of(path: str) -> int:
    try:
        with open(ROOT / path, "rb") as f:
            return sum(1 for _ in f)
    except FileNotFoundError:
        return 0


def read_allow(text: str) -> dict:
    allowed = {}
    for raw in text.splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            path, count = line.rsplit(None, 1)
            allowed[path] = int(count)
    return allowed


def write_allow(allowed: dict) -> None:
    body = "".join(f"{p} {n}\n" for p, n in sorted(allowed.items()))
    ALLOW.write_text(HEADER + "\n" + body)


def main(argv: list) -> int:
    allowed = read_allow(ALLOW.read_text()) if ALLOW.exists() else {}
    sizes = {p: lines_of(p) for p in tracked()}
    over = {p: n for p, n in sizes.items() if n > BUDGET}

    if "--write" in argv:
        kept = {p: min(n, allowed[p]) if p in allowed else n for p, n in over.items()
                if p in allowed or "--seed" in argv}
        write_allow(kept)
        print(f"file sizes: {len(kept)} file(s) listed over {BUDGET} lines")
        return 0

    errors, notes = [], []
    for path, n in sorted(over.items()):
        if path not in allowed:
            errors.append((path, f"{n} lines, over the {BUDGET}-line budget: split it into files that each do one thing"))
        elif n > allowed[path]:
            errors.append((path, f"{n} lines, grown past the {allowed[path]} it is allowed (scripts/ci/file_sizes_allow.txt): "
                                 f"take what grew into a file of its own"))
    for path, count in sorted(allowed.items()):
        n = sizes.get(path, 0)
        if n < count:
            notes.append(f"{path}: {n} lines now, {count} allowed: `python3 scripts/ci/file_sizes.py --write` lowers it")

    if "--base" in argv:
        ref = argv[argv.index("--base") + 1]
        shown = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{ALLOW.relative_to(ROOT).as_posix()}"],
                               capture_output=True, text=True)
        if shown.returncode == 0:
            before = read_allow(shown.stdout)
            for path, count in sorted(allowed.items()):
                if path not in before:
                    errors.append((path, f"added to scripts/ci/file_sizes_allow.txt against {ref}: the list only shrinks"))
                elif count > before[path]:
                    errors.append((path, f"raised from {before[path]} to {count} in scripts/ci/file_sizes_allow.txt "
                                         f"against {ref}: the list only shrinks"))
        else:
            notes.append(f"no scripts/ci/file_sizes_allow.txt at {ref}: the list is not compared")

    for note in notes:
        print(note)
    for path, why in errors:
        print(f"::error file={path}::{why}")
    if errors:
        return 1
    print(f"file sizes: {len(sizes)} source files, none new or grown over {BUDGET} lines ({len(allowed)} listed)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
