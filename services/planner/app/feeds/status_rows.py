"""The live feeds as the pilot's Status page reads them (GET /api/map/ages's
sources): each weather row marked stale where the minute's watch
(app.feeds.watch) found its product not updating, and a row each for the
feeds a pilot plans by that have no row of their own yet -- the NOTAMs
(SWIM's FNS, where ingest reads it) and the NEXRAD and GOES frames.

A source that stops reads as nothing at all -- no NOTAM, no echo on the
radar -- which a pilot cannot tell from a quiet sky, so the page says
"not updating" beside its age (the owner, 2026-11-09). The watch's last
lines are read as they are, never a check made for the request.
"""

from __future__ import annotations

from wingtip import feed_health

from .. import exposure

#: The watch's lines a pilot is shown a row of their own for, by kind and
#: name, in a pilot's words. ITWS, SFDPS, STDDS and TFMS feed the map's
#: own layers, which say their age where they are drawn.
OWN_ROWS = {("swim", "FNS"): "NOTAMs", ("weather", "radar"): "Radar (NEXRAD)", ("weather", "satellite"): "Satellite (GOES)"}


def mark(sources: list[dict], lines: list[dict]) -> list[dict]:
    """The Status page's rows: `sources` (each with the weather store's
    `key` where it has one) with `stale` set from the watch's `lines`, and
    then the rows of OWN_ROWS that the lines hold, a feed not set up left
    out. ISO times in, ISO times out."""
    stale = {line["name"] for line in lines if line.get("kind") == "weather" and line.get("state") == feed_health.STALE}
    rows = [{**s, "stale": s.get("key") in stale} for s in sources]
    for line in lines:
        words = OWN_ROWS.get((line.get("kind"), line.get("name")))
        if not words or line.get("state") == feed_health.OFF:
            continue
        rows.append(
            {
                "name": words,
                "key": line["name"],
                "fetched_at": exposure.iso(line.get("last_at")),
                "kept_until": None,
                "failing": False,
                "stale": line.get("state") == feed_health.STALE,
            }
        )
    return rows
