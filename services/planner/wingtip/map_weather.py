"""A field's weather as the map marks it (the owner's pick, 2026-11-10,
the airport weather marks): the parts of its METAR the station model
writes -- the wind, the visibility and the weather with it, the ceiling --
and, where the wind earns an arrow, the least crosswind its runways leave
(the engine's least_crosswind and wind_arrow, the rules the web's and the
phones' maps ask too). Nothing about an airplane: the app holds the
crosswind against the picked airplane's demonstrated figure itself.

The METAR is the national cache already in memory (wingtip.weather), as
read by the engine (awc_metars_read); the runways OurAirports'
runways.csv, open ones only, each end's true heading where the table has
it and else its number turned true with the field's magnetic variation
(the engine's runway_end_heading, inside least_crosswind).
"""

from __future__ import annotations

import math

import pandas as pd

from . import airports
from .engine import ask
from .magnetic import magnetic_variation_deg
from .single_flight import once

#: The METAR's members the map's marks read, as the engine read them.
METAR_KEYS = (
    "wind_dir_true_deg",
    "wind_speed_kt",
    "wind_gust_kt",
    "visibility_sm",
    "visibility_plus",
    "wx",
    "ceiling_ft",
    "ceiling_cover",
    "ceiling_unknown",
)


def load_runways() -> pd.DataFrame:
    """OurAirports' runways table, held in memory after the first read
    (wingtip.airports' own cache of its tables). Read-only."""
    return airports._load_table(airports.RUNWAYS_URL, airports.RUNWAYS_CACHE_PATH)


def _heading(value) -> float | None:
    return None if value is None or (isinstance(value, float) and math.isnan(value)) else float(value)


@once(maxsize=2)
def _end_headings_of(_path: str, _mtime: float) -> dict[str, list[list]]:
    """Each field's open runways' ends, [[ident, true heading or None], ...]
    a runway, by the field's ident upper-cased: one pass over the table per
    file on disk (keyed as wingtip.airports' tables are), where get_runways
    scans the whole table for each field."""
    frame = load_runways()
    out: dict[str, list[list]] = {}
    for row in frame.itertuples(index=False):
        if getattr(row, "closed", 0) == 1 or not isinstance(row.airport_ident, str):
            continue
        ends = [
            [str(end), _heading(heading)]
            for end, heading in ((row.le_ident, row.le_heading_degT), (row.he_ident, row.he_heading_degT))
            if isinstance(end, str) and end
        ]
        if ends:
            out.setdefault(row.airport_ident.upper(), []).append(ends)
    return out


def end_headings(ident: str) -> list[list]:
    """A field's open runways, each its ends as [ident, true heading]."""
    load_runways()
    path = airports.RUNWAYS_CACHE_PATH
    return _end_headings_of(str(path), path.stat().st_mtime).get(ident.upper(), [])


def marks_of(place: dict, metar: dict | None) -> dict:
    """The METAR's members the station model and the wind arrow read, and
    `crosswind_kt`, the least crosswind on the place's runways (by its
    ident, else its source ident, whichever the runways table knows), where the engine's wind_arrow shows
    the wind an arrow; None where it does not, or no runway end has a
    heading. Nothing at all with no METAR."""
    if not metar:
        return {}
    out = {key: metar.get(key) for key in METAR_KEYS}
    out["ceiling_unknown"] = bool(out["ceiling_unknown"])
    out["visibility_plus"] = bool(out["visibility_plus"])
    out["wx"] = out["wx"] or None
    shown = ask("wind_arrow", speed_kt=metar.get("wind_speed_kt"), gust_kt=metar.get("wind_gust_kt"))["shown"]
    least = None
    if shown:
        idents = (place.get("ident"), place.get("source_ident"))
        runways = next((r for r in (end_headings(i) for i in idents if i) if r), [])
        if runways:
            least = ask(
                "least_crosswind",
                runways=[{"end_headings": ends} for ends in runways],
                metar={k: metar.get(k) for k in ("wind_dir_true_deg", "wind_speed_kt", "wind_gust_kt")},
                variation_deg=magnetic_variation_deg(place["lat"], place["lon"]),
            )
    out["crosswind_kt"] = least["crosswind_kt"] if least else None
    return out
