"""The figures four of the web app's pages work out in the browser, worked
out here for the native app so the phone computes no aviation figure
(docs/NATIVE.md; app.figures): the debrief of a flown track, the
diversion drill, a hold's entry and wind, and lost communications'
altitudes. The web app works them out with the same engine, in the
browser (lib/debrief, lib/diversion, lib/holdEntry, lib/lostComms, through
its WebAssembly)."""

import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from wingtip import airports, navlog, pattern
from wingtip.weather import WeatherServiceError

from wingtip.engine import ask as engine

from ..figures.schemas import DebriefAnswer, DebriefAsk, Diversion, Holding, LostComms, LostCommsAsk
from wingtip.aircraft import aircraft_profile
from wingtip.winds_aloft import winds_key_for
from ..gateway import PUBLIC, PUBLIC_READ_BY_POST
from ..plan_query import CruisePower, CruiseTas

router = APIRouter()
log = logging.getLogger(__name__)

#: The fields a flight takes off from and lands at, among its checkpoints.
FIELD_CATEGORIES = ("departure", "stop", "destination")


def _pattern_altitudes(idents: list[str]) -> dict[str, float]:
    """Each field's pattern altitude, ft MSL, as its card gives it
    (wingtip.pattern.pattern_at: the FAA's published one, else AC 90-66C's
    1,000 ft above the field), by the ident the flight saved; a field not
    found, or with no elevation, has none and is not graded."""
    out = {}
    for ident in dict.fromkeys(idents):
        try:
            place = airports.find_place(ident)
            if place is None:
                continue
            altitude = pattern.pattern_at(place["ident"], place["elevation_ft"])["altitude_ft"]
        except Exception:  # noqa: BLE001 -- one field's data missing leaves that field ungraded, not the debrief
            log.exception("pattern altitude for %s", ident)
            continue
        if altitude is not None:
            out[ident] = altitude
    return out


@router.post("/api/debrief", openapi_extra=PUBLIC_READ_BY_POST)
def debrief(ask: DebriefAsk) -> DebriefAnswer:
    """A saved flight debriefed against its flown track (apps/web/src/lib/debrief,
    ACS PA.VI.A): leg by leg the altitude and the course held, each
    checkpoint's time against its estimate, and the altitude entering
    each field's pattern -- each with its mark against the tolerance --
    the profile, the line for the map and notes on what does not fit.
    `debrief` is null where the track never flew faster than taxiing.
    The fields' pattern altitudes are the planner's own (the card's)."""
    checkpoints = [c.model_dump() for c in ask.checkpoints]
    points = sorted((p.model_dump() for p in ask.points), key=lambda p: p["t"])
    patterns = _pattern_altitudes([c["name"] for c in checkpoints if c["category"] in FIELD_CATEGORIES])
    # The debrief, marked, and its tolerances: the engine's whole answer.
    return DebriefAnswer.model_validate(engine("debrief", checkpoints=checkpoints, points=points, patterns=patterns))


@router.get("/api/diversion", openapi_extra=PUBLIC)
def diversion(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    to: Annotated[str, Query(min_length=2, max_length=8)],
    altitude_ft: Annotated[float, Query(gt=0, le=17_999)],
    aircraft: str | None = None,
    cruise_tas_kt: CruiseTas = None,
    fuel_burn_gph: Annotated[float | None, Query(gt=0, le=100)] = None,
    cruise_power_pct: CruisePower = None,
    depart: datetime | None = None,
    mh: float | None = None,
    gs: float | None = None,
    ete: float | None = None,
    fuel: float | None = None,
) -> Diversion:
    """The diversion drill (apps/web/src/lib/diversion, ACS PA.VI.C): from a point
    to a field, in the planner's air on the way there at `altitude_ft` --
    the winds and temperature aloft for the hour (wingtip.weather, the FD
    period for `depart`, now by default), the airplane's true airspeed and
    burn in that air (wingtip.performance) and the variation (wingtip.magnetic,
    the WMM) -- the true course and distance, the wind triangle, the
    magnetic heading, ground speed, time and fuel, each step in words;
    and the student's estimates (`mh`, `gs`, `ete`, `fuel`) checked
    against it, each within the drill's allowance or not. With no
    `aircraft` a 422: the heading, ground speed, time and fuel are all
    worked at an airplane's speed and burn, and no stock airplane's is
    assumed (the owner, 2026-11-09)."""
    if not aircraft:
        raise HTTPException(422, "Pick an airplane: the diversion's heading, ground speed, time and fuel are worked at its speed and burn.")
    place = airports.find_place(to)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {to.strip().upper()!r}.")
    profile = aircraft_profile(aircraft, cruise_tas_kt, fuel_burn_gph, cruise_power_pct=cruise_power_pct)
    try:
        leg = navlog.leg_from((lat, lon), (place["lat"], place["lon"]), altitude_ft, profile, winds_key_for(depart))
    except WeatherServiceError as err:
        raise HTTPException(503, "The winds aloft could not be fetched for the diversion.") from err
    # The solution, its steps and the estimates checked, all in the
    # engine's words (wingtip_engine::figures::diversion).
    worked = engine(
        "diversion",
        true_course_deg=leg["true_course_deg"],
        distance_nm=leg["distance_nm"],
        tas_kt=leg["tas_kt"],
        fuel_burn_gph=leg["fuel_burn_gph"],
        magnetic_variation_deg=leg["magnetic_variation_deg"],
        wind=leg["wind"],
        to=place["ident"],
        mh=mh,
        gs=gs,
        ete=ete,
        fuel=fuel,
    )
    return Diversion(
        to=place["ident"],
        name=place.get("name") or place["ident"],
        altitude_ft=altitude_ft,
        tas_kt=leg["tas_kt"],
        fuel_burn_gph=leg["fuel_burn_gph"],
        magnetic_variation_deg=leg["magnetic_variation_deg"],
        wind=leg["wind"] and {"wind_dir_true_deg": leg["wind"]["wind_dir_true_deg"], "wind_speed_kt": leg["wind"]["wind_speed_kt"]},
        solved=worked["solved"],
        steps=worked["steps"],
        problem=worked["problem"],
        checks=worked["checks"],
    )


@router.get("/api/holding", openapi_extra=PUBLIC)
def holding(
    inbound: Annotated[float, Query(ge=0, le=360)],
    heading: Annotated[float, Query(ge=0, le=360)],
    turns: Literal["right", "left"] = "right",
    tas_kt: Annotated[float | None, Query(gt=0, le=1000)] = None,
    wind_from: Annotated[float | None, Query(ge=0, le=360)] = None,
    wind_kt: Annotated[float | None, Query(ge=0, le=300)] = None,
    altitude_ft: Annotated[float | None, Query(ge=0, le=60_000)] = None,
) -> Holding:
    """A hold's entry (apps/web/src/lib/holdEntry, AIM 5-3-8): for an airplane
    heading `heading` to the fix of a hold on the inbound course `inbound`
    with `turns`, the entry by the AIM's sectors and its steps in words,
    and the other entry where the heading is within 5 degrees of a
    sector's edge; given a true airspeed, a wind (both the course's
    reference, magnetic as a clearance gives it) and the altitude, the
    inbound and outbound headings and the outbound time that make the
    inbound leg a minute (a minute and a half above 14,000 ft MSL)."""
    return Holding.model_validate(
        engine(
            "holding",
            inbound=inbound,
            heading=heading,
            turns=turns,
            tas_kt=tas_kt,
            wind_from=wind_from,
            wind_kt=wind_kt,
            altitude_ft=altitude_ft,
        )
    )


@router.post("/api/lost-comms", openapi_extra=PUBLIC_READ_BY_POST)
def lost_comms(ask: LostCommsAsk) -> LostComms:
    """Two-way radio failure under IFR (apps/web/src/lib/lostComms, 14 CFR
    91.185): the routes in the rule's order, the altitude on each segment
    -- the highest of assigned, the minimum for IFR operations and
    expected, expected only from the segment it applies from -- and when
    to leave the clearance limit. A POST for the segments' list; it
    changes nothing."""
    segments = [{"name": s.name or "Segment", "minimum_ft": s.minimum_ft} for s in ask.segments]
    return LostComms.model_validate(
        engine(
            "lost_comms",
            segments=segments,
            assigned_ft=ask.assigned_ft,
            expected_ft=ask.expected_ft,
            expected_from=ask.expected_from,
            approach_fix=ask.approach_fix,
            efc=ask.efc.strip(),
            eta=ask.eta.strip(),
        )
    )
