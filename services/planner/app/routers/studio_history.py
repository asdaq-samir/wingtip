"""What was so on the day of a flight the Studio replays: the weather as
it was (IEM's archive), the NTSB's record of the airplane, and the NOTAMs
and TFRs archived here that day (wingtip.history). The developer's for
now, as the Studio is; on app.routers.studio's router."""

import datetime as dt

from fastapi import APIRouter, HTTPException, Query
from wingtip.history import iem, notam_archive, ntsb, weather_then

from ..gateway import DEVELOPER
from ..schemas.studio_history import NtsbEvent, StudioNotams, StudioWeather, StudioWeatherAsk

router = APIRouter()

#: The longest span asked at once, s: two days, a long day's flying with
#: room either side; a longer one is several asks of IEM a station.
_LONGEST_SPAN_S = 2 * 86400


@router.post("/api/studio/weather", response_model=StudioWeather, openapi_extra=DEVELOPER)
def studio_weather(ask: StudioWeatherAsk) -> StudioWeather:
    """The METARs, TAFs and radar frames over a replayed flight
    (wingtip.history.weather_then): a 422 for a span that ends before it
    starts or is longer than two days, a 503 where IEM cannot be read now."""
    if ask.end < ask.start:
        raise HTTPException(422, "The span ends before it starts.")
    if ask.end - ask.start > _LONGEST_SPAN_S:
        raise HTTPException(422, "Ask for two days of weather at most.")
    try:
        return StudioWeather(**weather_then.weather_then(ask.start, ask.end, [(lat, lon) for lat, lon in ask.points]))
    except iem.WeatherHistoryUnavailable as err:
        raise HTTPException(503, "The Iowa Environmental Mesonet's archive can't be read right now. Try again in a minute.") from err


@router.get("/api/studio/ntsb", response_model=list[NtsbEvent], openapi_extra=DEVELOPER)
def studio_ntsb(
    registration: str = Query(min_length=2, max_length=12, description="The registration, N-number or other"),
    day: dt.date = Query(description="The UTC day of the flight"),
) -> list[NtsbEvent]:
    """The NTSB's cases of the airplane dated within a day either side
    (wingtip.history.ntsb); none where there are none, or the store is not
    built yet."""
    return [NtsbEvent(**e) for e in ntsb.events(registration, day.isoformat())]


@router.get("/api/studio/notams", response_model=StudioNotams, openapi_extra=DEVELOPER)
def studio_notams(
    at: float = Query(description="The moment, s since 1970"),
    lat_min: float = Query(ge=-90, le=90),
    lat_max: float = Query(ge=-90, le=90),
    lon_min: float = Query(ge=-180, le=180),
    lon_max: float = Query(ge=-180, le=180),
) -> StudioNotams:
    """The NOTAMs and TFRs in force at `at` inside the box, from that UTC
    day's archive (wingtip.history.notam_archive); `archived` false where
    none was kept that day."""
    return StudioNotams(**notam_archive.as_it_was(at, lat_min, lat_max, lon_min, lon_max))
