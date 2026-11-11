#!/usr/bin/env python3
"""The privacy policy, terms and support page, from docs/legal to the web.

docs/legal/{privacy,terms,support}.md are the one source the owner edits
and reviews; this writes each as a plain HTML page into apps/web/public,
which the web build copies to /app/<name>.html and the gateway serves at
/privacy, /terms and /support (WebMvcConfig). Plain pages, so they open
without the app's JavaScript, as App Review and Google Play ask of the
links in a listing.

The Markdown is the small part these documents use: headings, paragraphs,
"- " lists, "> " quotes, tables, **bold**, *italic*, `code`, [links](url)
and <!-- notes --> for the owner, which are left out of the page. The
standard library only, for the Mac's python3 and CI's.

  python3 scripts/build/legal_pages.py           write the pages
  python3 scripts/build/legal_pages.py --check   fail if a page is stale (CI)
"""

import html
import re
import sys
from pathlib import Path

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


def inline(text: str) -> str:
    """A line's emphasis, code and links, the rest escaped."""
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])", r"<em>\1</em>", out)
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{html.escape(m[2])}">{m[1]}</a>', out)


def cells(row: str) -> list:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def render(markdown: str) -> str:
    """The Markdown's body as HTML."""
    text = re.sub(r"<!--.*?-->", "", markdown, flags=re.S)
    blocks = [b for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    out = []
    for block in blocks:
        lines = block.splitlines()
        first = lines[0]
        heading = re.match(r"(#{1,3}) (.*)", first)
        if heading and len(lines) == 1:
            level = len(heading[1])
            # An id from the heading's words, so a page can link to a section
            # (the site's link is /terms/#a-planning-aid-not-for-navigation).
            slug = "-".join(re.sub(r"[^a-z0-9 ]", "", heading[2].lower()).split())
            out.append(f'<h{level} id="{slug}">{inline(heading[2])}</h{level}>')
        elif first.startswith("- "):
            items, current = [], []
            for line in lines:
                if line.startswith("- "):
                    if current:
                        items.append(" ".join(current))
                    current = [line[2:].strip()]
                else:
                    current.append(line.strip())
            items.append(" ".join(current))
            out.append("<ul>\n" + "\n".join(f"<li>{inline(i)}</li>" for i in items) + "\n</ul>")
        elif first.startswith(">"):
            quoted = " ".join(line.lstrip(">").strip() for line in lines)
            out.append(f"<blockquote><p>{inline(quoted)}</p></blockquote>")
        elif first.startswith("|") and len(lines) > 1 and re.match(r"^\|[\s|:-]+\|$", lines[1].strip()):
            head = "".join(f"<th>{inline(c)}</th>" for c in cells(first))
            rows = "\n".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells(r)) + "</tr>" for r in lines[2:])
            out.append(f"<table>\n<thead><tr>{head}</tr></thead>\n<tbody>\n{rows}\n</tbody>\n</table>")
        else:
            out.append(f"<p>{inline(' '.join(line.strip() for line in lines))}</p>")
    return "\n".join(out)


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
        print("legal pages out of date with docs/legal; run python3 scripts/build/legal_pages.py:", *stale, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
