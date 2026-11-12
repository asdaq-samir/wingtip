"""The Flight Briefing page: adverse conditions, current conditions,
forecast, and airport/frequency info around the nav log -- the FAA's own
standard-briefing sequence (AIM/FAA-H-8083-25), minus the two pieces this
service has no real source for: NOTAMs (the official FAA NOTAM API is
gated to certain commercial/public operators, emailed credentials only --
the page links out to a real briefing service instead of faking data) and
a synoptic narrative (needs real meteorological analysis, not a data
fetch).

One plain synchronous response, not a stream like /api/navlog: every
piece here is one quick independent call (hazards, forecast, METAR,
runways/frequencies), not the slow per-leg loop that justified streaming
there. "Independent" is also why they run concurrently, not one after
another -- three separate blocking round trips to aviationweather.gov,
summed instead of overlapped, was the whole reason this page felt slow to
open even though no single piece actually is."""

import hashlib
import threading
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import TypeAdapter
from wingtip import data_cycles, tfr, weather
from wingtip import icing_forecast

from .. import exposure, route_briefing
from ..feeds import status_rows
from ..feeds import watch as feeds_watch
from ..route_briefing import read_fixes, read_numbers
from ..schemas.common import Briefing
from ..schemas.briefing import Alternates, IcingForecast, MapLayerAges, Tfrs
from ..gateway import PUBLIC, gateway

router = APIRouter()


@router.get("/api/map/ages", openapi_extra=PUBLIC)
def map_layer_ages() -> MapLayerAges:
    """When the planner fetched what the map's weather layers are drawn
    from, for the map's settings to say how old each is: the METARs
    (aviationweather.gov's METAR file, held and refreshed by wingtip.weather)
    and the TFRs (tfr.faa.gov); and each source the planner keeps
    through an outage, for the pilot's Status page, each said where it
    has stopped updating (app.feeds.status_rows); and each FAA data set's
    edition and whether it is still in its cycle."""
    sources = [
        {**s, "fetched_at": exposure.iso(s["fetched_at"]), "kept_until": exposure.iso(s["kept_until"])} for s in weather.sources_status()
    ]
    tfrs_at = exposure.iso(tfr.fetched_at())
    sources.append({"name": "TFRs", "key": "tfrs", "fetched_at": tfrs_at, "kept_until": None, "failing": tfr.failing()})
    return {
        "metars_at": exposure.iso(weather.dataset_status().get("metars")),
        "tfrs_at": tfrs_at,
        # Each marked where the minute's feed watch found it not updating,
        # with the NOTAMs and the radar and satellite frames beside them.
        "sources": status_rows.mark(sources, feeds_watch.last_lines()),
        # Each FAA data set's edition and whether it is in its cycle
        # (wingtip.data_cycles), for the pilot to see one out of date.
        "data_cycles": data_cycles.held(),
    }


# /api/tfrs' answer as FastAPI would write it (its response model's
# validate and dump_json), encoded once per list rather than at every ask:
# the shapes are the bulk of it and change every few minutes at most.
_TFRS = TypeAdapter(Tfrs)
_TFRS_HELD: dict = {}
_TFRS_LOCK = threading.Lock()
#: A minute: the map asks again as it is drawn, and the weather service
#: reads tfr.faa.gov every few minutes (wingtip.tfr.SHAPES_TTL_S).
TFRS_CACHE = "public, max-age=60"


def _tfrs_body(found: list, fetched_at: float | None) -> tuple[bytes, str]:
    """The answer's bytes and their ETag, kept by the copy of the list they
    were made from (when it was fetched) and the TFRs kept of it: a copy is
    written once and never changed (wingtip.weather_store), so the same key
    is the same bytes. None for a list with no copy behind it: made again."""
    key = None if fetched_at is None else (fetched_at, tuple(t.get("notam_id") for t in found))
    with _TFRS_LOCK:
        held = _TFRS_HELD.get("held")
    if key is not None and held is not None and held[0] == key:
        return held[1], held[2]
    body = _TFRS.dump_json(_TFRS.validate_python({"tfrs": found}, from_attributes=True), by_alias=True)
    etag = f'"{hashlib.blake2b(body, digest_size=16).hexdigest()}"'
    if key is not None:
        with _TFRS_LOCK:
            _TFRS_HELD["held"] = (key, body, etag)
    return body, etag


@router.get("/api/tfrs", response_model=Tfrs, openapi_extra=gateway("public", cache=True, headers=("ETag",)))
def tfrs(request: Request) -> Response:
    """Every temporary flight restriction in force or to come, for the
    map: each NOTAM's areas, when, how high and why (wingtip.tfr). A 502 when
    tfr.faa.gov does not answer, for the map to say so rather than draw
    a sky with none."""
    # Kept a minute (TFRS_CACHE), with an ETag: a 304 for the list held.
    fetched_at = tfr.fetched_at()
    try:
        found = tfr.all_tfrs()
    except tfr.TfrUnavailable as err:
        raise HTTPException(502, "tfr.faa.gov did not answer, so the map has no TFRs on it.") from err
    # A copy written between the two reads is not kept by the older's key.
    body, etag = _tfrs_body(found, fetched_at if tfr.fetched_at() == fetched_at else None)
    headers = {"ETag": etag, "Cache-Control": TFRS_CACHE}
    if etag in request.headers.get("if-none-match", ""):
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


@router.get("/api/briefing", openapi_extra=PUBLIC)
def briefing(
    dep: str,
    dest: str,
    stops: str = "",
    depart: datetime | None = None,
    ete_min: float | None = None,
    fixes: str = "",
    leg_min: str = "",
    ground_min: str = "",
) -> Briefing:
    """Everything the nav log's own leg math doesn't cover: adverse
    conditions (SIGMET/AIRMET), current conditions (METAR) and
    forecast (TAF-derived ceiling/visibility) along the route, and
    each airport's runways and radio frequencies, its traffic pattern
    (wingtip.pattern) and the class of the airspace over it, for its
    pattern card and the radio calls.

    The forecast is for the flight: from `depart` (now when not given;
    UTC when naive) to an hour past arrival, `ete_min` after it (two
    hours when not given). It used to be read at the moment of asking,
    whatever time the pilot was planning to go. With stops (`stops`,
    "KDSM,KLNK"), along every hop and for every airport landed at.

    Each hazard says where and when the flight meets it (`on_route`,
    app.exposure): on the nav log's legs where the page sends them --
    `fixes`, its points "lat,lon;lat,lon", `leg_min` each leg's ETE and
    `ground_min` each leg's minutes on the ground after it -- else on
    the route's own legs, the flight's time shared out by distance.
    """
    return route_briefing.briefing(dep, dest, stops, depart, ete_min, fixes, leg_min, ground_min)


@router.get("/api/alternate", openapi_extra=PUBLIC)
def alternate(dest: str, eta: datetime, tas_kt: Annotated[float, Query(gt=0, le=1000)], alternate: str = "") -> Alternates:
    """The IFR alternate for a flight arriving at `dest` at `eta` (UTC when
    naive): whether the destination needs one (14 CFR 91.169(b), the
    "1-2-3" rule, from its TAF an hour either side of the ETA), the
    pilot's `alternate` checked against its minimums at the ETA there
    (91.169(c)), and the nearest fields with a TAF that will do, each
    reached at `tas_kt` from the destination (wingtip.alternates): the
    picked airplane's cruise, asked for, never a stock airplane's."""
    return route_briefing.alternate(dest, eta, tas_kt, alternate)


@router.get("/api/icing/route", openapi_extra=PUBLIC)
def icing_on_the_route(fixes: str, alt_ft: str, leg_min: str, ground_min: str = "", depart: datetime | None = None) -> IcingForecast:
    """Under IFR, the AWC's forecast icing on each leg at the altitude it
    is flown (wingtip.icing_forecast; AIM 7-1-4, 7-1-19): the nav log's
    `fixes` ("lat,lon;lat,lon", one more than its legs), each leg's
    altitude `alt_ft` and ETE `leg_min`, and its minutes on the ground
    after it `ground_min`, the flight leaving at `depart` (now when not
    given; UTC when naive). Each leg is read for the hour of its middle."""
    path = read_fixes(fixes)
    altitudes, minutes = read_numbers(alt_ft, "alt_ft"), read_numbers(leg_min, "leg_min")
    if not path or not altitudes or not minutes:
        raise HTTPException(422, "fixes, alt_ft and leg_min are needed, one more fix than legs.")
    start = time.time() if depart is None else (depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)).timestamp()
    try:
        return icing_forecast.along(path, altitudes, minutes, read_numbers(ground_min, "ground_min"), start)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err
    except icing_forecast.IcingForecastUnavailable as err:
        raise HTTPException(502, "aviationweather.gov did not answer, so the forecast icing could not be checked.") from err
