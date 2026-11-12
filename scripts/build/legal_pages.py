#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py==4.3.0"]
# ///
"""The privacy policy, terms and support page, from docs/legal to the web.

docs/legal/{privacy,terms,support}.md are the one source the owner edits
and reviews; this writes each as a plain HTML page into apps/web/public,
which the web build copies to /app/<name>.html and the gateway serves at
/privacy, /terms and /support (WebMvcConfig). Plain pages, so they open
without the app's JavaScript, as App Review and Google Play ask of the
links in a listing.

The Markdown is read by markdown-it-py (CommonMark with tables, raw HTML
escaped); <!-- notes --> for the owner are left out of the page. Run by uv,
which installs it at the version pinned in the script's own header.

  scripts/build/legal_pages.py           write the pages
  scripts/build/legal_pages.py --check   fail if a page is stale (CI)
"""

import html
import re
import sys
from pathlib import Path

from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/legal"
OUT = ROOT / "apps/web/public"
PAGES = ("privacy", "terms", "support")

# The short addresses the gateway redirects to the pages, so a link inside
# a page works on the site and in a store's listing alike.
NAV = (("/privacy", "Privacy policy"), ("/terms", "Terms of use"), ("/support", "Support"), ("/app/plan", "Back to the app"))

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>{title} — Wingtip Maps</title>
<link rel="icon" href="/app/favicon.svg" type="image/svg+xml">
<!-- Written by scripts/build/legal_pages.py from docs/legal/{name}.md: edit that, then run it. -->
<style>
  :root {{ --fg: #111; --muted: #555; --bg: #fff; --tint: #0066cc; --rule: #ddd; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --fg: #f2f2f2; --muted: #aaa; --bg: #000; --tint: #4da3ff; --rule: #333; }} }}
  body {{ margin: 0 auto; max-width: 40rem; padding: 1.5rem 1.25rem 3rem; color: var(--fg); background: var(--bg); }}
  body {{ font: 17px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif; }}
  h1 {{ font-size: 1.75rem; margin: 0 0 .25rem; }}
  h2 {{ font-size: 1.15rem; margin: 2rem 0 .25rem; }}
  h3 {{ font-size: 1rem; margin: 1.5rem 0 .25rem; }}
  p, li {{ margin: .5rem 0; }}
  a {{ color: var(--tint); }}
  em:first-child:last-child {{ color: var(--muted); font-size: .9rem; }}
  blockquote {{ margin: 1rem 0; padding-left: 1rem; border-left: 3px solid var(--rule); }}
  table {{ border-collapse: collapse; width: 100%; font-size: .9rem; }}
  th, td {{ text-align: left; vertical-align: top; padding: .4rem .5rem .4rem 0; border-bottom: 1px solid var(--rule); }}
  nav {{ margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--rule); font-size: .95rem; }}
  nav a {{ margin-right: 1rem; }}
</style>
</head>
<body>
{body}
<nav>
{nav}
</nav>
</body>
</html>
"""


def slug(heading: str) -> str:
    """An id from the heading's words, so a page can link to a section (the
    site's link is /terms/#a-planning-aid-not-for-navigation)."""
    return "-".join(re.sub(r"[^a-z0-9 ]", "", heading.lower()).split())


def render(markdown: str) -> str:
    """The Markdown's body as HTML: CommonMark and tables by markdown-it-py,
    raw HTML escaped, the owner's <!-- notes --> left out."""
    text = re.sub(r"<!--.*?-->", "", markdown, flags=re.S)
    md = MarkdownIt("commonmark", {"html": False}).enable("table")
    tokens = md.parse(text.strip())
    for i, token in enumerate(tokens):
        if token.type == "heading_open":
            token.attrSet("id", slug(tokens[i + 1].content))
    return md.renderer.render(tokens, md.options, {}).strip()


def page(name: str) -> str:
    markdown = (SOURCE / f"{name}.md").read_text(encoding="utf-8")
    title = re.match(r"# (.*)", markdown)[1].strip()
    nav = "\n".join(f'<a href="{href}">{label}</a>' for href, label in NAV)
    return TEMPLATE.format(title=html.escape(title), name=name, body=render(markdown), nav=nav)


def main(argv: list) -> int:
    check = "--check" in argv
    stale = []
    for name in PAGES:
        target = OUT / f"{name}.html"
        wanted = page(name)
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != wanted:
                stale.append(str(target.relative_to(ROOT)))
        else:
            target.write_text(wanted, encoding="utf-8")
    if stale:
        print("legal pages out of date with docs/legal; run scripts/build/legal_pages.py:", *stale, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
