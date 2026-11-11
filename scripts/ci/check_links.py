#!/usr/bin/env python3
"""Check the relative links and anchors in the repository's Markdown.

Every tracked *.md file is read; each link to another file in the
repository must name a file or folder that exists, and each #anchor must
name a heading (or an <a id>/<a name>) in the file it points to, slugged
as GitHub slugs them. External links (http, https, mailto) are not
fetched: they would make the check slow and flaky, and a moved web page
is no fault of the change being checked.

    python3 scripts/ci/check_links.py            every tracked *.md
    python3 scripts/ci/check_links.py a.md b.md  only these

Exits 1 and lists each broken link as file:line: target -- why.
Standard library only, so CI runs it with no install.
"""

from __future__ import annotations

import re
import subprocess
import sys
import unicodedata
from functools import cache
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]

# [text](target "title"), ![alt](target), allowing one level of nested
# brackets in the text (a badge inside a link).
INLINE = re.compile(r"!?\[(?:[^\[\]]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
REFDEF = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+\"[^\"]*\")?\s*$")
HTMLREF = re.compile(r"""<(?:a|img|source)\b[^>]*?\b(?:href|src)=["']([^"']+)["']""", re.I)
HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
HTMLANCHOR = re.compile(r"""<a\b[^>]*\b(?:id|name)=["']([^"']+)["']""", re.I)
FENCE = re.compile(r"^\s{0,3}(```|~~~)")
SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)


def slug(heading: str) -> str:
    """GitHub's anchor for a heading: its text, lower case, without
    punctuation other than - and _, spaces made hyphens."""
    text = re.sub(r"<[^>]+>", "", heading)  # inline HTML
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)  # links keep their text
    text = text.replace("`", "").lower()
    out = []
    for ch in text:
        if ch in " -":
            out.append("-")
        elif ch == "_" or ch.isalnum():
            out.append(ch)
        elif unicodedata.category(ch).startswith(("L", "N", "M")):
            out.append(ch)
    return "".join(out)


def lines_outside_code(text: str):
    """(line number, line) for each line not in a fenced block, with
    inline code spans blanked so a `[x](y)` in code is not a link."""
    fenced = False
    for n, line in enumerate(text.splitlines(), 1):
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        yield n, re.sub(r"`+[^`]*`+", "", line)


@cache
def anchors(path: Path) -> frozenset[str]:
    seen: dict[str, int] = {}
    found = set()
    for _, line in lines_outside_code(path.read_text(encoding="utf-8")):
        for a in HTMLANCHOR.findall(line):
            found.add(a)
        m = HEADING.match(line)
        if not m:
            continue
        base = slug(m.group(2))
        count = seen.get(base, 0)
        seen[base] = count + 1
        found.add(base if count == 0 else f"{base}-{count}")
    return frozenset(found)


def targets(text: str):
    for n, line in lines_outside_code(text):
        for rx in (INLINE, HTMLREF):
            for t in rx.findall(line):
                yield n, t
        m = REFDEF.match(line)
        if m:
            yield n, m.group(1)


def check(md: Path) -> list[str]:
    problems = []
    rel = md.relative_to(ROOT)
    for n, target in targets(md.read_text(encoding="utf-8")):
        if SCHEME.match(target) or target.startswith("//"):
            continue  # external: not fetched
        path_part, _, anchor = target.partition("#")
        path_part = unquote(path_part.split("?")[0])
        # The legal pages are served by the app and the site, where a link
        # like /privacy is a page there, not a file in the repository.
        if rel.parts[:2] == ("docs", "legal") and path_part.startswith("/") and "." not in path_part:
            continue
        if path_part:
            dest = (ROOT / path_part.lstrip("/")) if path_part.startswith("/") else (md.parent / path_part)
            dest = dest.resolve()
            if not dest.exists():
                problems.append(f"{rel}:{n}: {target} -- no such file")
                continue
        else:
            dest = md
        if anchor and dest.is_file() and dest.suffix.lower() == ".md":
            if unquote(anchor) not in anchors(dest):
                problems.append(f"{rel}:{n}: {target} -- no heading #{anchor} in {dest.relative_to(ROOT)}")
    return problems


def tracked_markdown() -> list[Path]:
    out = subprocess.run(["git", "ls-files", "-z", "--", "*.md"], cwd=ROOT, check=True, capture_output=True).stdout.decode()
    return [ROOT / p for p in out.split("\0") if p and "node_modules/" not in p]


def main(argv: list[str]) -> int:
    files = [Path(a).resolve() for a in argv] or tracked_markdown()
    problems = [p for f in files if f.exists() for p in check(f)]
    for p in problems:
        print(p)
    print(f"check_links: {len(files)} files, {len(problems)} broken link(s)", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
