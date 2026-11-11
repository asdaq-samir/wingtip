"""aviationweather.gov's national cache files, fetched on the schedule
(app.main) and stored parsed (wingtip.weather_store) for the planner to
read (wingtip.weather): the METARs, TAFs, SIGMETs and AIRMETs, PIREPs and
G-AIRMETs, each the complete current national set, gzipped, regenerated
every minute (TAFs every ten). Moved from the planner's wingtip.weather
(#535), which fetched them on its own requests' way.

The cache files rather than per-route API queries: that is what the
site's API terms ask heavy users to do -- a bounding-box query per route
is exactly the "large query" the rate limit and the results cap exist
for, and one download every few minutes replaces all of them. Each is
asked for only if it has changed since the copy held (its ETag and
Last-Modified): an unchanged one (the SIGMETs and G-AIRMETs most of the
time) is a 304, neither downloaded nor parsed again.

Each copy is stored with the time to which it may be served when a
later fetch fails, by its product's own validity: a TAF to the end of
its valid period, an advisory to the end of its own, a METAR set for as
long as it is the latest heard. A fetch that fails leaves the stored
copy in place and says so beside it (weather_store.write_attempt); only a
parsed product is ever stored, so a body that does not parse is a
failed fetch.

The reading of each file and how long its copy is held are the engine's
(engine/crates/weather/src/forecast/awc.rs, #482 phase 2), the same rules
the planner and the phones read: this module fetches, asks the engine
(wingtip_native) to read what came, and stores the engine's typed form.
"""

from __future__ import annotations

import gzip
import logging
import time

from wingtip import weather_store
from wingtip.engine import ask as _ask
from wingtip.weather import RECENT_WIND_HOURS, _unix

from . import fetch

log = logging.getLogger(__name__)

CACHE_BASE_URL = "https://aviationweather.gov/data/cache"


def _reader(product: str):
    """The engine's reader of one cache file (awc_<product>_read): the XML
    in, the shape the weather store keeps out. A body that is not XML
    raises ValueError, a failed fetch."""
    return lambda body: _ask(f"awc_{product}_read", text=body.decode("utf-8-sig"))


def _held_until(product: str):
    """To when a copy may still be served when later fetches fail, by its
    product's own validity (the engine's weather_held_until; FAA-H-8083-28B):
    METARs no limit, each report carrying its own time; TAFs and SIGMETs to
    the end of their valid times; PIREPs and G-AIRMETs as long as the
    briefing still tells the newest of them."""
    return lambda data, fetched: _ask("weather_held_until", product=product, data=data, fetched=fetched)


# name -> (url, parse(body), held_until(copy, fetched at)).
SOURCES = {
    name: (f"{CACHE_BASE_URL}/{file}.cache.xml.gz", _reader(name), _held_until(name))
    for name, file in (
        ("metars", "metars"),
        ("tafs", "tafs"),
        ("airsigmets", "airsigmets"),
        ("pireps", "aircraftreports"),
        ("gairmets", "gairmets"),
    )
}


def fetch_source(name: str) -> None:
    """Source `name` fetched and stored, if it has changed since the copy
    stored (its validators, kept in the record's meta); an unchanged one is
    stored again as fetched now, so its age is when it was last confirmed.
    The METARs also update each station's last wind (recent-winds). Raises
    fetch.FetchFailed, ValueError (a body the engine cannot read) or
    OSError where the copy could not be had, the stored one left in place."""
    url, parse, held_until = SOURCES[name]
    held = weather_store.read(name)
    validators = (held.meta.get("validators") if held else None) or None
    now = time.time()
    resp = fetch.get(url, validators=validators)
    if held is not None and getattr(resp, "status_code", None) == 304:
        data = held.data
    else:
        data = parse(gzip.decompress(resp.content))
        validators = fetch.validators_of(resp)
    until = held_until(data, now)
    weather_store.write(name, data, fetched_at=now, until=until, meta={"validators": validators})
    if name == "metars":
        keep_recent_winds(data, now)


def keep_recent_winds(metars: dict, now: float) -> None:
    """Each station's newest report with a direction and some speed, kept
    RECENT_WIND_HOURS ("recent-winds"): the runway it favoured is the one
    in use when the wind has since dropped calm (wingtip.runway_wind). The
    METAR file holds only each station's latest report, so the service
    keeps the last windy one as it fetches, where the planner asked the
    METAR API for each field's last three hours on a card's way."""
    held = weather_store.read("recent-winds")
    winds = dict(held.data) if held and isinstance(held.data, dict) else {}
    for ident, report in metars.items():
        direction, speed = report.get("wind_dir_true_deg"), report.get("wind_speed_kt")
        observed = _unix(report.get("observed_at"))
        if direction is None or not speed or speed <= 0 or observed is None:
            continue
        if ident not in winds or winds[ident]["observed"] < observed:
            winds[ident] = {"wind_dir_true_deg": direction, "wind_speed_kt": speed, "observed": observed}
    oldest = now - RECENT_WIND_HOURS * 3600
    winds = {ident: w for ident, w in winds.items() if w["observed"] >= oldest}
    weather_store.write("recent-winds", winds, fetched_at=now, until=None)
