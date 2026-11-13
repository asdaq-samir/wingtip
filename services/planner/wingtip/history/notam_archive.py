"""The NOTAMs and TFRs as they were on a day, for the Studio's replay
(app.routers.studio_history). No public archive of past NOTAMs exists
(the FAA's NOTAM Search gives those in force now), so from now on ingest
keeps one of its own: each hour (ingest.history) the NOTAM store
(wingtip.notams, SWIM's FNS) and the TFR list (wingtip.tfr, tfr.faa.gov's)
are merged into that UTC day's file, ``archive/notams/YYYY-MM-DD.json.gz``
and ``archive/tfrs/YYYY-MM-DD.json.gz`` beside the live store, each item
kept by its id with only what the replay shows. A NOTAM issued and
cancelled between two hours is not kept. KEEP_DAYS of days are kept.

A NOTAM is placed at its location's field (wingtip.airports), as the
store keeps no position; one at no field (a centre's, an FDC NOTAM) has
none, and is not in any box. A TFR is kept with its areas, rounded to
about ten metres, and their box.
"""

from __future__ import annotations

import datetime as dt
import functools
import gzip
import json
from pathlib import Path

from .. import airports, notams, weather_store
from .. import tfr as tfrs_now
from ..atomic import atomic_path
from ..config import get_settings

#: How many days' files are kept: a year and a month, for a flight
#: replayed the next year.
KEEP_DAYS = 400
#: Decimal places a TFR's area is kept to: 1e-4 degrees, about 11 m.
_PLACES = 4


def archive_dir() -> Path:
    """The archive, beside the live store on the data volume."""
    return get_settings().live_store.parent / "archive"


def _file(kind: str, day: dt.date) -> Path:
    return archive_dir() / kind / f"{day.isoformat()}.json.gz"


def _read(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return {item["id"]: item for item in json.load(f)}


def _write(path: Path, items: dict[str, dict]) -> None:
    """The day's file written whole and put in place at once, so a reader
    never sees half of it."""
    with atomic_path(path) as fresh, gzip.open(fresh, "wt", encoding="utf-8") as f:
        json.dump(sorted(items.values(), key=lambda i: i["id"]), f, separators=(",", ":"))


def _rounded(coords):
    if isinstance(coords, (int, float)):
        return round(float(coords), _PLACES)
    return [_rounded(c) for c in coords]


def _box(geometry: dict | None) -> list[float] | None:
    """[lon_min, lat_min, lon_max, lat_max] of a GeoJSON (Multi)Polygon."""
    points: list = []

    def walk(c):
        if c and isinstance(c[0], (int, float)):
            points.append(c)
        else:
            for part in c or []:
                walk(part)

    walk((geometry or {}).get("coordinates"))
    if not points:
        return None
    lons, lats = [p[0] for p in points], [p[1] for p in points]
    return [min(lons), min(lats), max(lons), max(lats)]


def _notam_items() -> dict[str, dict]:
    return {
        n["id"]: {
            "id": n["id"],
            "location": n.get("icao_location") or n.get("location"),
            "start": n.get("starts"),
            "end": n.get("ends"),
            # The NOTAM as sent, in the domestic form a briefing reads
            # where it has one.
            "text": n.get("raw") or n.get("text") or "",
        }
        for n in notams.every()
    }


def _tfr_items() -> dict[str, dict]:
    record = weather_store.read("tfrs")
    out = {}
    for t in record.data if record and isinstance(record.data, list) else []:
        if not t.get("notam_id"):
            continue
        geometry = t.get("geometry")
        if geometry:
            geometry = {"type": geometry.get("type"), "coordinates": _rounded(geometry.get("coordinates") or [])}
        out[t["notam_id"]] = {
            "id": t["notam_id"],
            "name": t.get("title") or t["notam_id"],
            "start": t.get("effective"),
            "end": t.get("expires"),
            "text": t.get("text"),
            "box": _box(geometry),
            "geometry": geometry,
        }
    return out


def snapshot(now: dt.datetime | None = None) -> dict[str, int]:
    """The NOTAM store and the TFR list merged into today's files (UTC),
    each item by its id, the newest word of it winning; the files past
    KEEP_DAYS removed. Safe to run as often as wanted. How many items each
    day's file holds."""
    day = (now or dt.datetime.now(dt.timezone.utc)).date()
    counts = {}
    for kind, items in (("notams", _notam_items()), ("tfrs", _tfr_items())):
        path = _file(kind, day)
        merged = {**_read(path), **items}
        _write(path, merged)
        counts[kind] = len(merged)
    forget_before(day - dt.timedelta(days=KEEP_DAYS))
    return counts


def forget_before(day: dt.date) -> None:
    """The archive's files of days before `day` removed."""
    for kind in ("notams", "tfrs"):
        for path in (archive_dir() / kind).glob("*.json.gz"):
            try:
                if dt.date.fromisoformat(path.name[:10]) < day:
                    path.unlink(missing_ok=True)
            except ValueError:
                continue


@functools.lru_cache(maxsize=4)
def _day_items(path: str, _mtime: float) -> list[dict]:
    return list(_read(Path(path)).values())


def _items(kind: str, day: dt.date) -> list[dict] | None:
    path = _file(kind, day)
    try:
        return _day_items(str(path), path.stat().st_mtime)
    except FileNotFoundError:
        return None


@functools.lru_cache(maxsize=4096)
def _position(location: str) -> tuple[float, float] | None:
    try:
        place = airports.find_place(location)
    except Exception:  # noqa: BLE001 -- OurAirports' table not to hand: the NOTAM is placed nowhere
        return None
    return (place["lat"], place["lon"]) if place else None


def _in_force(start: str | None, end: str | None, at: dt.datetime) -> bool:
    """In force at `at`: from its start to its end, by the engine's reading
    of a hazard's window (wingtip.tfr.in_force), one with no end until
    further notice."""
    return tfrs_now.in_force({"effective": start, "expires": end}, at, at)


def as_it_was(at: float, lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> dict:
    """The NOTAMs and TFRs in force at `at` (s since 1970) inside the box,
    from that UTC day's files: {"archived" (False where no file covers the
    day), "day", "notams" ([{"id", "text", "start", "end", "lat", "lon"}]),
    "tfrs" ([{"id", "name", "start", "end", "text", "geometry"}])}."""
    when = dt.datetime.fromtimestamp(at, dt.timezone.utc)
    day = when.date()
    kept_notams, kept_tfrs = _items("notams", day), _items("tfrs", day)
    answer = {"archived": kept_notams is not None or kept_tfrs is not None, "day": day.isoformat(), "notams": [], "tfrs": []}
    for n in kept_notams or []:
        where = _position(n["location"]) if n.get("location") else None
        if where is None or not (lat_min <= where[0] <= lat_max and lon_min <= where[1] <= lon_max):
            continue
        if _in_force(n.get("start"), n.get("end"), when):
            answer["notams"].append(
                {"id": n["id"], "text": n["text"], "start": n.get("start"), "end": n.get("end"), "lat": where[0], "lon": where[1]}
            )
    for t in kept_tfrs or []:
        box = t.get("box")
        if box is None or box[0] > lon_max or box[2] < lon_min or box[1] > lat_max or box[3] < lat_min:
            continue
        if _in_force(t.get("start"), t.get("end"), when):
            answer["tfrs"].append({k: t.get(k) for k in ("id", "name", "start", "end", "text", "geometry")})
    answer["notams"].sort(key=lambda n: (n["start"] or "", n["id"]))
    answer["tfrs"].sort(key=lambda t: (t["start"] or "", t["id"]))
    return answer


__all__ = ["KEEP_DAYS", "archive_dir", "as_it_was", "forget_before", "snapshot"]
