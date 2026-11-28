"""Writes a generator's files, or checks them, the one loop every design
generator ends in (design_tokens, map_style, card_actions, wording,
screens): each output written where its text differs, or with --check
each that differs named and the run failed, the command to run said.
The generators themselves are scripts/areas.yml's `generators` table,
which CI's paths, regen-all.sh and web_generated.sh read.

Standard library only.
"""

import sys
from pathlib import Path


def write_or_check(outputs: dict[Path, str], root: Path, source: str, command: str, argv=None) -> int:
    """`outputs`, {path: text}, made so (0), or with --check in `argv`
    (sys.argv's by default) each that differs named and 1 returned, as
    "Out of date with <source> (run <command> and commit)"."""
    check = "--check" in (sys.argv[1:] if argv is None else argv)
    stale = []
    for path, text in outputs.items():
        if (path.read_text() if path.exists() else None) == text:
            continue
        if check:
            stale.append(str(path.relative_to(root)))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f"wrote {path.relative_to(root)}")
    if stale:
        print(f"Out of date with {source} (run {command} and commit):", *stale, sep="\n  ", file=sys.stderr)
        return 1
    return 0
