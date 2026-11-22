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
Last-Modified, kept beside the record: weather_store.write_validators).
A 304 is neither downloaded nor parsed again. The site's ETags are
nginx's mtime-size and its Last-Modified moves every minute as the file
is regenerated, so 304s are rare (measured 2026-11-21): a body that comes
back the same as the copy held (its digest in the record's meta, "body")
is not parsed by the engine again either. Either way an unchanged copy
is not written again unless the time it may be held to moves
(weather_store.write_if_changed), so the planner does not decode it
again; the try's attempt file confirms it, which is the age said.

Each copy is stored with the time to which it may be served when a
later fetch fails, by its product's own validity: a TAF to the end of
its valid period, an advisory to the end of its own, a METAR set for as
long as it is the latest heard. A fetch that fails leaves the stored
copy in place and says so beside it (weather_store.write_attempt); only a
parsed product is ever stored, so a body that does not parse is a
failed fetch.

Alaska's AIRMETs are the one product here not in a cache file: the
data API's /api/data/airmet ("Decoded domestic AIRMETs (Alaska only)",
its OpenAPI document read 2026-11-21), every one in a single answer of
about 28 KB, which the API's terms allow (aviationweather.gov/data/api,
"Using the API": a custom User-Agent, at most 100 requests a minute,
asked no more often than the product changes). The answer says it may
be cached three minutes (Cache-Control max-age=180), which is its pace
here (app.settings, airmets_every_s); an unchanged answer is not read
again, as with the files (its weak ETag, then its digest).

The reading of each file and how long its copy is held are the engine's
(engine/crates/weather/src/forecast/awc.rs, #482 phase 2), the same rules
the planner and the phones read: this module fetches, asks the engine
(wingtip_native) to read what came, and stores the engine's typed form.
"""

from __future__ import annotations

import gzip
import logging
import time

from wingtip import utc, weather_store
from wingtip.engine import ask as _ask
from wingtip.weather import RECENT_WIND_HOURS

from . import fetch

log = logging.getLogger(__name__)

CACHE_BASE_URL = "https://aviationweather.gov/data/cache"
#: Alaska's AIRMETs as GeoJSON, the one format with each zone's polygon
#: (engine/crates/weather/src/forecast/awc/airmets.rs).
AIRMET_URL = "https://aviationweather.gov/api/data/airmet?format=geojson"


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


# Alaska's AIRMETs (above): kept apart from the SIGMETs, so either can
# fail alone, and read beside them by the planner (wingtip.weather.advisories).
SOURCES["airmets"] = (AIRMET_URL, _reader("airmets"), _held_until("airmets"))


def fetch_source(name: str) -> None:
    """Source `name` fetched and stored, if it has changed since the copy
    stored (its validators; then its body's digest); an unchanged one is
    left as written and confirmed by the try's attempt file
    (weather_store.confirmed_at), so its age is when it was last confirmed.
    The METARs also update each station's last wind (recent-winds). Raises
    fetch.FetchFailed, ValueError (a body the engine cannot read) or
    OSError where the copy could not be had, the stored one left in place."""
    url, parse, held_until = SOURCES[name]
    held = weather_store.read(name)
    validators = weather_store.validators(name) if held else None
    now = time.time()
    resp = fetch.get(url, validators=validators)
    if held is not None and getattr(resp, "status_code", None) == 304:
        data, digest = held.data, held.meta.get("body")
    else:
        # The cache files are gzipped files (their first two bytes gzip's
        # magic number, RFC 1952); the API's answer is not.
        body = gzip.decompress(resp.content) if resp.content[:2] == b"\x1f\x8b" else resp.content
        digest = weather_store.body_hash(body)
        same = held is not None and held.meta.get("body") == digest
        data = held.data if same else parse(body)
        fresh = fetch.validators_of(resp)
        if fresh != validators:
            weather_store.write_validators(name, fresh)
    until = held_until(data, now)
    written = weather_store.write_if_changed(name, data, fetched_at=now, until=until, meta={"body": digest})
    if name == "metars" and written:
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
        observed = utc.epoch_or_none(report.get("observed_at"))
        if direction is None or not speed or speed <= 0 or observed is None:
            continue
        if ident not in winds or winds[ident]["observed"] < observed:
            winds[ident] = {"wind_dir_true_deg": direction, "wind_speed_kt": speed, "observed": observed}
    oldest = now - RECENT_WIND_HOURS * 3600
    winds = {ident: w for ident, w in winds.items() if w["observed"] >= oldest}
    # Written only when a wind came or went: this runs at each new METAR
    # set, and the 385 KB record is otherwise the same as the one held.
    if held is None or winds != held.data:
        weather_store.write("recent-winds", winds, fetched_at=now, until=None)
