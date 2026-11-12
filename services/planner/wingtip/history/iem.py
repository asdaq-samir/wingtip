"""Past METARs and TAFs from the Iowa Environmental Mesonet (Iowa State
University), kept once read, for the Studio's weather as it was
(wingtip.history.weather_then).

IEM archives every station's METARs and the NWS's TAF bulletins, and
serves them by time:

- **METARs**: ``/cgi-bin/request/asos.py`` with ``station`` (ICAO, several
  at once), ``data=metar``, ``tz=Etc/UTC``, ``format=onlycomma``,
  ``latlon=yes``, ``sts``/``ets`` and ``report_type`` 3 (routine) and 4
  (specials): one CSV row a report, ``station,valid,lon,lat,metar``, the
  report as the station sent it (checked 2026-11-12, KORD and KMDW on
  2026-11-10).
- **TAFs**: ``/cgi-bin/afos/retrieve.py`` with ``pil`` (TAF and the
  station's three letters, ``TAFORD``; several comma-separated),
  ``sdate``/``edate``, ``fmt=text``, ``order=asc``: each bulletin as the
  NWS sent it, between the WMO control characters SOH and ETX (checked
  2026-11-12).

IEM's data is "in the public domain and may be used freely by anyone for
any lawful purpose", attribution appreciated
(mesonet.agron.iastate.edu/disclaimer.php): the answer carries `CREDIT`.

A past UTC day's reports no longer change, so each station's day is asked
once and kept in its own SQLite file beside the live store
(``studio_weather.sqlite``), for good, a day with none kept as none.
Today's are asked each time and not kept, as they are still coming. A
refusal or a timeout is not kept: WeatherHistoryUnavailable, asked again
next time.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import re
import sqlite3
import threading
import time
from pathlib import Path

import requests

from .. import outside
from ..config import REQUEST_HEADERS, get_settings

METAR_URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
TAF_URL = "https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py"
#: How long one ask of IEM may take, s: a day of a dozen stations' METARs
#: comes back in about a second; this leaves room for a slow moment.
TIMEOUT_S = 30.0
SOURCE = "Iowa Environmental Mesonet"
CREDIT = "METARs, TAFs and NEXRAD composite radar via the Iowa Environmental Mesonet, Iowa State University. Not for navigation."

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None
#: One fetch of a kind and day at a time: a second asker waits and reads the file.
_GATES: dict[tuple[str, str], threading.Lock] = {}
#: A TAF in its bulletin: from its "TAF" (or "TAF AMD", "TAF COR") line
#: through the "=" that ends it, newlines and indents as sent.
_TAF = re.compile(r"^TAF\b.*?=", re.MULTILINE | re.DOTALL)
#: The TAF's own station and time of issue, "KORD 100520Z", on the line
#: after its TAF line or on the same one.
_ISSUED = re.compile(r"^TAF(?:[ \t]+(?:AMD|COR))?\s+([A-Z0-9]{4})\s+(\d{2})(\d{2})(\d{2})Z")


class WeatherHistoryUnavailable(RuntimeError):
    """IEM did not answer, or answered with an error: nothing kept."""


def _store_path() -> Path:
    """The kept days' file, beside the live store on the data volume."""
    return get_settings().live_store.parent / "studio_weather.sqlite"


def _connection() -> sqlite3.Connection:
    global _db
    if _db is None:
        path = _store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path, check_same_thread=False, timeout=10.0, isolation_level=None)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute(
            "CREATE TABLE IF NOT EXISTS days (kind TEXT, station TEXT, day TEXT, fetched_at REAL, reports TEXT, "
            "PRIMARY KEY (kind, station, day))"
        )
        _db = db
    return _db


def reset() -> None:
    """Forgets the connection (the tests' store is a new file each)."""
    global _db
    with _LOCK:
        if _db is not None:
            _db.close()
        _db = None


def _kept(kind: str, stations: list[str], day: str) -> dict[str, list[dict]]:
    marks = ",".join("?" * len(stations))
    with _LOCK:
        rows = (
            _connection()
            .execute(f"SELECT station, reports FROM days WHERE kind = ? AND day = ? AND station IN ({marks})", (kind, day, *stations))
            .fetchall()
        )
    return {station: json.loads(reports) for station, reports in rows}


def _keep(kind: str, day: str, found: dict[str, list[dict]]) -> None:
    now = time.time()
    with _LOCK:
        _connection().executemany(
            "INSERT OR REPLACE INTO days VALUES (?, ?, ?, ?, ?)", [(kind, s, day, now, json.dumps(r)) for s, r in found.items()]
        )


def _get(url: str, params: list[tuple[str, str]]) -> str:
    try:
        resp = outside.get(url, params=params, headers=REQUEST_HEADERS, timeout=TIMEOUT_S)
        resp.raise_for_status()
    except requests.RequestException as err:
        raise WeatherHistoryUnavailable(f"The Iowa Environmental Mesonet could not be read: {err}") from err
    return resp.text


def _span(day: dt.date) -> tuple[str, str]:
    """The UTC day as IEM's start and end times."""
    nxt = day + dt.timedelta(days=1)
    return f"{day.isoformat()}T00:00Z", f"{nxt.isoformat()}T00:00Z"


def _named(iem_id: str, raw: str, asked: list[str]) -> str | None:
    """The asked station a row is: IEM names a US station by its three
    letters (ORD for KORD), the report by its four."""
    first = raw.split(" ", 1)[0]
    if first in asked:
        return first
    return next((s for s in asked if iem_id in (s, s[1:])), None)


def read_metars(text: str, asked: list[str]) -> dict[str, list[dict]]:
    """IEM's METAR CSV as {station: [{"station", "lat", "lon", "time" (ISO
    UTC), "raw" (as sent)}]}, each asked station there, with none where it
    sent nothing."""
    found: dict[str, list[dict]] = {s: [] for s in asked}
    for row in csv.DictReader(io.StringIO(text)):
        raw = (row.get("metar") or "").strip()
        station = _named((row.get("station") or "").strip(), raw, asked)
        if not raw or station is None:
            continue
        try:
            when = dt.datetime.strptime(row["valid"], "%Y-%m-%d %H:%M")
            lat, lon = float(row["lat"]), float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        found[station].append({"station": station, "lat": lat, "lon": lon, "time": when.strftime("%Y-%m-%dT%H:%M:00Z"), "raw": raw})
    return found


def _issued_on(day: dt.date, dom: int) -> dt.date | None:
    """The date of a TAF's day of the month: the bulletin's day or one
    either side of it (a TAF issued just before midnight is filed after)."""
    for d in (day, day - dt.timedelta(days=1), day + dt.timedelta(days=1)):
        if d.day == dom:
            return d
    return None


def read_tafs(text: str, asked: list[str], day: dt.date) -> dict[str, list[dict]]:
    """IEM's TAF bulletins as {station: [{"station", "issued" (ISO UTC),
    "raw" (the TAF as sent, from its TAF line to its "=")}]}, oldest
    first, each asked station there."""
    found: dict[str, list[dict]] = {s: [] for s in asked}
    for bulletin in text.split("\x01"):
        bulletin = bulletin.split("\x03", 1)[0].replace("\r", "")
        for match in _TAF.finditer(bulletin):
            raw = match.group(0)
            issued = _ISSUED.match(raw)
            if issued is None or issued.group(1) not in found:
                continue
            date = _issued_on(day, int(issued.group(2)))
            if date is None:
                continue
            stamp = f"{date.isoformat()}T{issued.group(3)}:{issued.group(4)}:00Z"
            found[issued.group(1)].append({"station": issued.group(1), "issued": stamp, "raw": raw})
    return found


def _ask_metars(stations: list[str], day: dt.date) -> dict[str, list[dict]]:
    sts, ets = _span(day)
    params = [("station", s) for s in stations] + [
        ("data", "metar"),
        ("tz", "Etc/UTC"),
        ("format", "onlycomma"),
        ("latlon", "yes"),
        ("missing", "empty"),
        ("report_type", "3"),
        ("report_type", "4"),
        ("sts", sts),
        ("ets", ets),
    ]
    return read_metars(_get(METAR_URL, params), stations)


def _ask_tafs(stations: list[str], day: dt.date) -> dict[str, list[dict]]:
    sts, ets = _span(day)
    # A TAF's product name is TAF and the station's last three letters
    # (TAFORD for KORD, TAFANC for PANC), as the NWS files it.
    pils = ",".join(f"TAF{s[1:]}" for s in stations)
    params = [("pil", pils), ("sdate", sts), ("edate", ets), ("fmt", "text"), ("limit", "9999"), ("order", "asc")]
    return read_tafs(_get(TAF_URL, params), stations, day)


_ASK = {"metar": _ask_metars, "taf": _ask_tafs}


def day_reports(kind: str, stations: list[str], day: dt.date, today: dt.date | None = None) -> dict[str, list[dict]]:
    """The stations' reports of `kind` ("metar" or "taf") on a UTC day, by
    station: a past day's from the file, the stations not there yet asked
    of IEM at once and kept; today's asked each time and not kept.
    WeatherHistoryUnavailable where IEM cannot be read now."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    if not stations or day > today:
        return {s: [] for s in stations}
    if day == today:
        return _ASK[kind](stations, day)
    key = day.isoformat()
    have = _kept(kind, stations, key)
    missing = [s for s in stations if s not in have]
    if missing:
        with _LOCK:
            gate = _GATES.setdefault((kind, key), threading.Lock())
        with gate:
            have = _kept(kind, stations, key)
            missing = [s for s in stations if s not in have]
            if missing:
                found = _ASK[kind](missing, day)
                _keep(kind, key, found)
                have.update(found)
    return {s: have.get(s, []) for s in stations}


__all__ = ["CREDIT", "SOURCE", "WeatherHistoryUnavailable", "day_reports", "read_metars", "read_tafs", "reset"]
