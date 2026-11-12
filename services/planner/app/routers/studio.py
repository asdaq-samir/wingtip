"""The Studio's tracks (the web's features/studio): an airplane's whole UTC
day from adsb.lol's history, kept here once read, and the airplanes whose
reports are recorded here. The developer's for now, as the Studio is
(the owner's pick, 2026-11-12: "You only for now")."""

import datetime as dt

from fastapi import APIRouter, HTTPException, Query
from wingtip import elevation, traffic
from wingtip.traffic import day_tracks

from ..gateway import DEVELOPER
from ..schemas.studio import StudioGround, StudioGroundAsk, StudioTrack, StudioWatched
from . import studio_history

router = APIRouter()
# The day's weather, the NTSB's record and the archived NOTAMs, the
# Studio's too, on this router rather than another line in app.main
# (which is at its size).
router.include_router(studio_history.router)


@router.get("/api/studio/track", response_model=StudioTrack, openapi_extra=DEVELOPER)
def studio_track(
    q: str = Query(min_length=2, max_length=12, description="N-number or ICAO address"), day: dt.date = Query(description="The UTC day")
) -> StudioTrack:
    """The airplane's reports on a UTC day (wingtip.traffic.day_tracks): a
    past day from the store, fetched from adsb.lol's history once where it
    is not there yet; today's from its recent trace. A 404 for a name the
    registry does not know, a 422 for a day to come, a 503 where adsb.lol
    cannot be read now."""
    try:
        return StudioTrack(**day_tracks.day_track(q, day))
    except day_tracks.NotAnAirplane as err:
        raise HTTPException(404, "No airplane by that N-number or ICAO address.") from err
    except traffic.TrafficUnavailable as err:
        raise HTTPException(503, "adsb.lol's history can't be read right now. Try again in a minute.") from err
    except ValueError as err:
        raise HTTPException(422, str(err)) from err


@router.get("/api/studio/watched", response_model=list[StudioWatched], openapi_extra=DEVELOPER)
def studio_watched() -> list[StudioWatched]:
    """The airplanes followed here, with the UTC days their recorded
    reports fall on, newest first (wingtip.traffic.day_tracks.watched_days)."""
    return [StudioWatched(**w) for w in day_tracks.watched_days()]


#: Feet in a metre (the international foot, 0.3048 m exactly).
_FT_PER_M = 1 / 0.3048


@router.post("/api/studio/ground", response_model=StudioGround, openapi_extra=DEVELOPER)
def studio_ground(ask: StudioGroundAsk) -> StudioGround:
    """The ground under a replayed track's points, ft MSL, for its profile
    strip (wingtip.elevation: the elevation tiles, then USGS's EPQS)."""
    points = [(lat, lon) for lat, lon in ask.points]
    found = elevation.get_elevations_m(points)
    return StudioGround(ground_ft=[round(found[p] * _FT_PER_M) for p in points])
