"""The US slice of OurAirports' table and the search over it: the table
the map, the Stops and the nearest list are read from (built once, under
one lock), and the one search box's ranked matches and its phone-side
index."""

import bisect
import gzip
import json
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from . import field_status, field_use, geo, nasr_fields
from .airport_tables import DEFAULT_CACHE_PATH, OURAIRPORTS_URL, _ensure_cached, _faa_key, _read_table
from .single_flight import once

#: One build of the US table at a time. lru_cache keeps a built one, but
#: every caller that comes while it is being built builds it too: after a
#: restart the warm-up's build and some twenty requests' (the map's
#: airports in view, each card's place, the Stops along a route) were
#: building it at once, each its own copy of the 80,000-row table and a
#: pandas isin over it, and the planner answered nothing -- not even its
#: health check -- for twelve minutes (py-spy, 2026-10-28: every request
#: thread in _us_airports_of's isin). Held for a cache hit too, which is a
#: dictionary lookup.
_US_AIRPORTS_LOCK = threading.Lock()


def _us_airports(cache_path: Path) -> pd.DataFrame:
    path = _ensure_cached(OURAIRPORTS_URL, cache_path)
    with _US_AIRPORTS_LOCK:
        return _us_airports_of(str(path), path.stat().st_mtime, *_faa_key(cache_path))


@lru_cache(maxsize=2)
def _us_airports_of(path: str, _mtime: float, faa_path: str = "", _faa_mtime: float = 0.0) -> pd.DataFrame:
    """The US-only, pre-uppercased slice `search_airports` filters, keyed
    by path and mtime like `_read_table`, so it is built once per file, not
    on every keystroke: built per call, a burst of searches (every DEP/DEST
    field firing one on mount) cost real, measurable CPU."""
    df = _read_table(path, _mtime)
    # FAA charts and aviationweather.gov alone: a non-US field would be a
    # dead end once picked, not a suggestion.
    us = df[df["iso_country"] == "US"]
    # Only the fields the FAA lists (the owner, 2026-10-27: "I would take
    # it out if it's not showing with FAA"): OurAirports keeps some 3,300
    # strips and airports the FAA no longer lists -- closed, or never
    # registered -- such as LL97 at Round Lake, drawn as a public field
    # beside C81. A field is the FAA's by any ident it goes by, and carries
    # NASR's status and the engine's label where closed (decision 0043).
    # With no FAA file to hand, all of them, as before.
    us = field_use.named(field_status.listed(us, faa_path, _faa_mtime), faa_path, _faa_mtime)  # NASR's name and use too
    # The FAA's reference point (NASR APT_BASE's ARP) over OurAirports',
    # 190 m off at KDEN: the map's marks are NASR's (owner, 2026-11-12); and
    # its ELEV, where OurAirports' was another field's at times (AV-1).
    us = nasr_fields.overlay(us, faa_path, _faa_mtime)
    us["_ident_upper"] = us["ident"].astype(str).str.upper()
    us["_local_upper"] = us["local_code"].astype(str).str.upper()
    us["_name_upper"] = us["name"].astype(str).str.upper()
    # Every word of the name and the town, each after a space, so a
    # search finds a word's start anywhere: "oshkosh" is Wittman
    # Regional's town, not the start of its name.
    us["_words_upper"] = " " + us["_name_upper"] + " " + us["municipality"].astype(str).fillna("").str.upper()
    us["_size_rank"] = us["type"].map({"large_airport": 0, "medium_airport": 1, "small_airport": 2}).fillna(3)
    # OurAirports' own `ident` column is a synthesized ICAO-style
    # code (usually "K" + `local_code`) it assigns even to airports
    # that were never actually issued one -- C81 (a real, local-use
    # FAA identifier, no K) shows up there as "KC81". `icao_code` is
    # how OurAirports itself marks the difference: populated when
    # `ident` is a real, assigned code (KDLH, a towered airport
    # pilots do call that), empty when `ident` is its own guess --
    # `local_code` (the one pilots, and the rest of this app, use
    # for those) wins only in that second case. Except that it leaves
    # `icao_code` empty for some real ones too -- KPWK, KBUU, KDKB, each
    # with a METAR under that name, came out PWK, BUU, DKB beside KMDW
    # and KMWC on the map -- so a three-letter FAA identifier, which a
    # US field's ICAO code is K and, counts as one when `ident` is that
    # K form. One with a digit in it (C81, 57C, 1D2) never has one.
    has_icao = us["icao_code"].notna() & (us["icao_code"] != "")
    has_local = us["local_code"].notna() & (us["local_code"] != "")
    k_form = us["local_code"].astype(str).str.fullmatch(r"[A-Z]{3}") & (us["ident"] == "K" + us["local_code"].astype(str))
    us["_display_ident"] = us["ident"].where(has_icao | k_form, us["local_code"].where(has_local, us["ident"]))
    return us


def _nearness_nm(lats, lons, near: list[tuple[float, float]]) -> np.ndarray:
    """How far each field is from the nearest of `near`, nm along the
    great circle (geo.distance_nm, every field against every point at
    once), as a sort key; 0 with nothing to be near, or no position."""
    lats, lons = np.asarray(lats, dtype=float), np.asarray(lons, dtype=float)
    if not near or not lats.size:
        return np.zeros(lats.shape)
    to = np.asarray(near, dtype=float)
    nm = geo.distance_nm(lats[:, None], lons[:, None], to[None, :, 0], to[None, :, 1]).min(axis=1)
    return np.where(np.isfinite(nm), nm, 0.0)


def search_airports(
    query: str, limit: int = 8, cache_path: Path = DEFAULT_CACHE_PATH, near: list[tuple[float, float]] | None = None
) -> list[dict]:
    """Airports whose ident or local code starts with `query`, or a word of
    whose name or town does -- the route form's pickers and the panel's
    search bar, so a pilot who doesn't have an ident memorized can find
    it by the airport's name, or its town's.

    An ident typed whole comes first, then idents that start with it,
    then the names and towns -- typing "KDL" is almost always hunting
    for an ident, not a name that happens to start the same way. Within
    each, the bigger fields first, then by ident: "oshkosh" is Wittman
    Regional (KOSH) before a private strip named for the town, which
    was the only answer while names had to start with what was typed.
    A field NASR lists as closed comes after the open ones of its rank,
    labelled (`closed`, decision 0043): found, never put first.
    Among fields of a size, one whose name starts with it first, then the
    nearest to `near` (the pilot, or the route): "campbell" is Campbell
    Airport (C81) at Grayslake for a pilot there, where eight strips
    named or towned Campbell from Texas to Nebraska came first, by their
    idents, and C81 not at all (the owner's ask, 2026-10-22).
    """
    query = query.strip().upper()
    if not query:
        return []
    df = _us_airports(cache_path)
    if " " not in query:
        # One word -- every keystroke of an ident or a town -- from the index
        # (_search_index_of), not a scan of 20,000 rows' strings per letter.
        path = _ensure_cached(OURAIRPORTS_URL, cache_path)
        index = _search_index_of(str(path), path.stat().st_mtime, *_faa_key(cache_path))
        return _rows(df, _indexed_matches(index, query, limit, near or []))
    exact = (df["_ident_upper"] == query) | (df["_local_upper"] == query) | (df["_display_ident"] == query)
    ident_hit = ~exact & (df["_ident_upper"].str.startswith(query) | df["_local_upper"].str.startswith(query))
    word_hit = ~exact & ~ident_hit & df["_words_upper"].str.contains(" " + query, regex=False)
    matches = pd.concat([df[exact].assign(_rank=0), df[ident_hit].assign(_rank=1), df[word_hit].assign(_rank=2)])
    matches = matches.assign(
        _shut=matches["_closed"].notna(),
        _named=~matches["_name_upper"].str.startswith(query),
        _near=_nearness_nm(matches["latitude_deg"], matches["longitude_deg"], near or []),
    )
    matches = matches.sort_values(["_rank", "_shut", "_size_rank", "_named", "_near", "_display_ident"]).head(limit)
    return _rows(df, [df.index.get_loc(i) for i in matches.index])


def search_index(cache_path: Path = DEFAULT_CACHE_PATH) -> bytes:
    """Every US airport `search_airports` can answer with, as the phone's
    own copy for searching as a pilot types (web lib/airportIndex), gzipped
    JSON: `{"airports": [[ident, name, town, state, size, lat, lon, *other
    idents]]}` -- the ident pilots use, the name and town every word of
    which is searched, the state without "US-", the size rank the answers
    are ordered by (0 large to 3 other), where it is (to a hundredth of a
    degree), and OurAirports' ident and the local code where either is not
    the ident shown (KC81 for C81). 32,600 rows. Made once per file. `closed`:
    each closed field's ident and label, never offered to land (decision 0043)."""
    path = _ensure_cached(OURAIRPORTS_URL, cache_path)
    return _search_index_bytes(str(path), path.stat().st_mtime, *_faa_key(cache_path))


@once(maxsize=2)
def _search_index_bytes(path: str, _mtime: float, faa_path: str = "", _faa_mtime: float = 0.0) -> bytes:
    us = _us_airports_of(path, _mtime, faa_path, _faa_mtime)
    rows = []
    columns = zip(
        us["_display_ident"].astype(str),
        us["_ident_upper"],
        us["_local_upper"],
        us["name"],
        us["municipality"],
        us["iso_region"],
        us["_size_rank"],
        us["latitude_deg"],
        us["longitude_deg"],
    )
    for display, ident, local, name, town, region, size, lat, lon in columns:
        # A missing local code is "NAN" once upper-cased (_us_airports_of).
        others = sorted({key for key in (ident, local) if isinstance(key, str) and key not in ("NAN", display.upper())})
        rows.append(
            [
                display,
                name if isinstance(name, str) else "",
                town if isinstance(town, str) else "",
                region.removeprefix("US-") if isinstance(region, str) else "",
                int(size),
                # Where it is, to a hundredth of a degree, for the nearest of a
                # name first (searchIndex's `near`).
                round(float(lat), 2) if lat == lat else 0.0,
                round(float(lon), 2) if lon == lon else 0.0,
                *others,
            ]
        )
    closed = {d: label for d, label in zip(us["_display_ident"].astype(str), us["_closed"]) if label}
    uses = field_use.index_uses(us)  # "private", "military" or "joint" by ident: the rows' marks (engine airport_use_words)
    return gzip.compress(json.dumps({"airports": rows, "closed": closed, "use": uses}, separators=(",", ":")).encode(), mtime=0)


def _rows(df: pd.DataFrame, positions: list[int]) -> list[dict]:
    """The search's answers, in order, from the US table's rows."""
    rows = df.iloc[positions]
    return [
        {
            "ident": row["_display_ident"],
            "name": row["name"],
            "municipality": row["municipality"] if pd.notna(row.get("municipality")) else None,
            "region": row["iso_region"] if pd.notna(row.get("iso_region")) else None,
            "closed": row["_closed"],
            "use": row.get("_use"),
        }
        for _, row in rows.iterrows()
    ]


@once(maxsize=2)
def _search_index_of(path: str, _mtime: float, faa_path: str = "", _faa_mtime: float = 0.0) -> dict:
    """The US table's idents and words, sorted, for `search_airports` to
    find a prefix by bisection: an ident or local code whole (`exact`),
    every ident and local code, and every word of a name and its town,
    each with its row. Built once per file, as the table is. The scan it
    replaced -- three string columns' startswith and contains over 20,000
    rows -- was 50 to 100 ms of every keystroke's answer."""
    us = _us_airports_of(path, _mtime, faa_path, _faa_mtime)
    exact: dict[str, set[int]] = {}
    idents: list[tuple[str, int]] = []
    words: list[tuple[str, int]] = []
    columns = zip(us["_ident_upper"], us["_local_upper"], us["_display_ident"].astype(str), us["_words_upper"])
    # A missing local code is a missing value, not a string (pandas keeps
    # it one through astype(str)): nothing to find it by.
    known = lambda *keys: {key for key in keys if isinstance(key, str)}  # noqa: E731
    for row, (ident, local, display, text) in enumerate(columns):
        for key in known(ident, local, display):
            exact.setdefault(key, set()).add(row)
        idents.extend((key, row) for key in known(ident, local))
        words.extend((word, row) for word in set(text.split()) if isinstance(text, str))
    idents.sort()
    words.sort()
    return {
        "exact": exact,
        "idents": idents,
        "words": words,
        "size": us["_size_rank"].tolist(),
        "closed": us["_closed"].notna().tolist(),
        "display": us["_display_ident"].astype(str).tolist(),
        "names": us["_name_upper"].tolist(),
        "lat": us["latitude_deg"].astype(float).tolist(),
        "lon": us["longitude_deg"].astype(float).tolist(),
    }


def _indexed_matches(index: dict, query: str, limit: int, near: list[tuple[float, float]] | None = None) -> list[int]:
    """The rows `search_airports` answers a one-word query with, in its
    order: the ident whole, then idents that start with it, then names and
    towns with a word that does; the bigger fields first in each, then a
    name that starts with it, then the nearest to `near`, then by ident."""

    def prefixed(keys: list[tuple[str, int]]) -> set[int]:
        found, at = set(), bisect.bisect_left(keys, (query,))
        while at < len(keys) and keys[at][0].startswith(query):
            found.add(keys[at][1])
            at += 1
        return found

    exact = index["exact"].get(query, set())
    ident = prefixed(index["idents"]) - exact
    word = prefixed(index["words"]) - exact - ident
    ranks = [(rank, row) for rank, rows in enumerate((exact, ident, word)) for row in rows]
    nearness = _nearness_nm([index["lat"][row] for _, row in ranks], [index["lon"][row] for _, row in ranks], near or [])
    ranked = [
        (rank, index["closed"][row], index["size"][row], not index["names"][row].startswith(query), float(nm), index["display"][row], row)
        for (rank, row), nm in zip(ranks, nearness)
    ]
    return [row for *_, row in sorted(ranked)[:limit]]
