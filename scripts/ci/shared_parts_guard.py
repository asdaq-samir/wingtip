#!/usr/bin/env python3
"""Every card's head, section title and close drawn by its shared
component, never by hand (docs/design/rules.md, the card rule's 8: "The
same thing is the same component").

Settings drew its own title at a drawer's 17 points under its own pages'
22, a card's head typed out again beside the shared one (the owner,
2026-11-11: "Why is the title smaller, isn't it shared code?"). This
finds the two shapes such a copy takes in the web app (apps/web/src):

- A raw heading element (<h1> to <h6>) given a head's or a section's type
  role -- TEXT.hero, TEXT.card, TEXT.title, TEXT.heading, SECTION_TITLE or
  their --type- sizes. A card's or a page's name is CardHeadRow's (or
  CardHead, CardTitle, SheetCard, ListPageHead, all drawn by it); a
  section's title is SectionTitle (ListGroup's, PillSection's,
  AccordionSection's and SectionPane's are).
- A cross (lucide's X, ICON.close) inside a button: a panel's close is
  CloseButton (CardClose on a card held by a device's Back).

What is rightly its own -- a form sheet's Cancel, title and Done (iOS's
own form header), a page's content heading (About's app name, the error
page's), a name the shared head's slot is given (MapCard) -- is listed in
scripts/ci/shared_parts_guard_allow.txt as "<path> <count> <why>". A file
with more hits than its count fails; fewer is said, so the list shrinks.

The standard library only.

  python3 scripts/ci/shared_parts_guard.py          check
  python3 scripts/ci/shared_parts_guard.py --list   print every hit, the allowed too
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/web/src"
ALLOW = ROOT / "scripts/ci/shared_parts_guard_allow.txt"

# Tests, and the stock components as shadcn writes them.
SKIP = re.compile(r"(\.test\.|\.spec\.|/test/|/e2e/|/fixtures/|^apps/web/src/components/ui/)")
# The shared components themselves.
SHARED = {"apps/web/src/components/CardHead.tsx", "apps/web/src/components/SectionTitle.tsx", "apps/web/src/components/CloseButton.tsx"}

HEADING = re.compile(r"<h[1-6]\b")
ROLE = re.compile(r"TEXT\.(?:hero|card|title|heading)\b|\bSECTION_TITLE\b|--type-(?:hero|card|title|heading)\b")
CROSS = re.compile(r"<(?:X|ICON\.close)\b")
BUTTON = re.compile(r"<(button|Button|IconButton|RoundButton|ToolbarButton)\b")
# How far back a cross's button may open.
REACH = 800


def tag_end(text: str, at: int) -> int:
    """Where the tag opened at `at` closes: its first `>` outside braces."""
    depth = 0
    for i in range(at, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == ">" and depth == 0:
            return i
    return len(text)


def strip_comments(text: str) -> str:
    """The source with its comments blanked, its lines kept where they were."""

    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))

    return re.sub(r"/\*.*?\*/|(?<![:\"'])//[^\n]*", blank, text, flags=re.S)


def in_button(text: str, at: int) -> bool:
    """Whether a button opened before `at` is still open there."""
    start = max(0, at - REACH)
    opened = list(BUTTON.finditer(text, start, at))
    if not opened:
        return False
    last = opened[-1]
    return f"</{last.group(1)}>" not in text[last.end() : at]


def scan_file(path: Path) -> list:
    text = strip_comments(path.read_text(errors="replace"))
    found = []
    line_of = lambda at: text.count("\n", 0, at) + 1  # noqa: E731
    for m in HEADING.finditer(text):
        tag = text[m.start() : tag_end(text, m.start())]
        if ROLE.search(tag):
            found.append(
                (line_of(m.start()), "a heading drawn by hand: CardHeadRow for a card's or a page's name, SectionTitle for a section's")
            )
    for m in CROSS.finditer(text):
        if in_button(text, m.start()):
            found.append((line_of(m.start()), "a close drawn by hand: CloseButton (CardClose on a card)"))
    return sorted(found)


def scan() -> dict:
    out = {}
    for path in sorted(SRC.rglob("*.tsx")):
        rel = path.relative_to(ROOT).as_posix()
        if SKIP.search(rel) or rel in SHARED:
            continue
        found = scan_file(path)
        if found:
            out[rel] = found
    return out


def allowed() -> dict:
    out = {}
    for line in ALLOW.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            rel, count, *_ = line.split(None, 2)
            out[rel] = int(count)
    return out


def main() -> int:
    found = scan()
    if "--list" in sys.argv:
        for rel, items in found.items():
            for n, what in items:
                print(f"{rel}:{n}: {what}")
        return 0
    allow = allowed()
    failed = False
    for rel, items in found.items():
        if len(items) > allow.get(rel, 0):
            failed = True
            print(
                f"::error file={rel}::{len(items)} part(s) drawn by hand here, {allow.get(rel, 0)} allowed "
                "(scripts/ci/shared_parts_guard_allow.txt). Use the shared component, or list the file with why."
            )
            for n, what in items:
                print(f"  {rel}:{n}: {what}")
    for rel, count in allow.items():
        have = len(found.get(rel, []))
        if have < count:
            print(f"{rel}: {have} now, {count} allowed: lower its count in shared_parts_guard_allow.txt.")
    total = sum(len(v) for v in found.values())
    kept = sum(min(len(found.get(k, [])), c) for k, c in allow.items())
    print(f"shared parts guard: {total} hit(s), {kept} allowed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
