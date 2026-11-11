#!/usr/bin/env python3
"""Checks the built site (apps/site/dist, from build.py): every page
parses with each element closed in order, every image has its alt, every
link and file a page names inside the site is there, and no page loads
a script or a stylesheet from another host. The standard library alone,
in seconds.

    python3 apps/site/check.py [DIST]

Paths under /app/ and /api/ are the gateway's (the web app, its legal
pages, the API), not files of this site, so they are not looked for.
Images under /assets/ are written by scripts/build/app-icons.sh and the
store framer; one missing is reported, and fails with --strict.
"""

from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parent
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
# /delete-account is the gateway's own page (DeleteAccountController), which
# the privacy policy and support page link to.
GATEWAY = ("/app/", "/api/", "/delete-account")


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.problems: list[str] = []
        self.refs: list[tuple[str, str]] = []  # (attribute, url)
        self.ids: set[str] = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "img" and "alt" not in a:
            self.problems.append(f"line {self.getpos()[0]}: <img> without alt")
        for key in ("href", "src"):
            if a.get(key):
                self.refs.append((f"{tag}.{key}", a[key]))
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            opened = self.stack[-1] if self.stack else ("nothing", 0)
            self.problems.append(f"line {self.getpos()[0]}: </{tag}> closes <{opened[0]}> of line {opened[1]}")
            return
        self.stack.pop()


def target(dist: Path, page: Path, url: str) -> Path | None:
    """The file a link inside the site names, or None for one outside it."""
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or url.startswith(("mailto:", "tel:")):
        return None
    path = parts.path
    if not path:
        return page
    if path.startswith(GATEWAY):
        return None
    base = dist if path.startswith("/") else page.parent
    found = (base / path.lstrip("/")).resolve()
    return found / "index.html" if path.endswith("/") or found.is_dir() else found


def check(dist: Path, strict: bool) -> int:
    pages = sorted(dist.rglob("*.html"))
    if not pages:
        print(f"check.py: no pages in {dist}: run apps/site/build.py first")
        return 1
    errors, missing_assets = [], []
    parsed = {}
    for page in pages:
        p = Page()
        p.feed(page.read_text(encoding="utf-8"))
        p.close()
        parsed[page] = p
        rel = page.relative_to(dist)
        errors += [f"{rel}: {m}" for m in p.problems]
        errors += [f"{rel}: <{t}> left open from line {n}" for t, n in p.stack if t not in ("html", "body", "head")]
    for page, p in parsed.items():
        rel = page.relative_to(dist)
        for attr, url in p.refs:
            outside = urlsplit(url).netloc
            if outside and attr in ("script.src", "link.href"):
                errors.append(f"{rel}: {attr} from another host ({url}): the site loads nothing from one")
            found = target(dist, page, url)
            if found is None:
                continue
            if not found.exists():
                if urlsplit(url).path.startswith("/assets/"):
                    missing_assets.append(url)
                else:
                    errors.append(f"{rel}: {url} is not in the site")
                continue
            fragment = urlsplit(url).fragment
            if fragment and found in parsed and fragment not in parsed[found].ids:
                errors.append(f"{rel}: {url}: no id {fragment!r} there")
    missing_assets = sorted(set(missing_assets))
    for url in missing_assets:
        print(f"check.py: note: {url} is not in assets/ yet (scripts/build/app-icons.sh and the store framer write it)")
    for line in errors:
        print(f"check.py: {line}")
    failed = errors or (strict and missing_assets)
    print(f"check.py: {len(pages)} pages, {'failed' if failed else 'ok'}")
    return 1 if failed else 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--strict"]
    sys.exit(check(Path(args[0]) if args else SITE / "dist", "--strict" in sys.argv))
