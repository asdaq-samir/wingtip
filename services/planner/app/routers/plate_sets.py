"""The plates a device keeps for flying with no signal (wingtip.plate_sets):
a flight's for Keep for the Air, with its size before it is fetched, and a
state's for Downloads, as the charts' regions are offered."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from wingtip import airports, plate_sets

from ..gateway import PUBLIC, SHARED
from ..route_briefing import read_fixes
from ..router_basics import SHARED_CACHE
from ..schemas.plate_sets import FlightPlates, PlateStateCharts, PlateStates

router = APIRouter()


def _point(ident: str) -> tuple[float, float]:
    try:
        found = airports.get_airport(ident)
    except ValueError as err:
        raise HTTPException(404, f"No airport goes by {ident!r}.") from err
    return found["lat"], found["lon"]


@router.get("/api/plates/flight", response_model=FlightPlates, openapi_extra=PUBLIC)
def flight_plates(
    route: str = Query(description='The flight\'s fields in order, departure to destination: "KSFO,KPRB,KSBA".'),
    fixes: str = Query("", description='The route flown, "lat,lon;lat,lon" (the nav log\'s); straight legs between the fields where none.'),
    alternate: str = "",
    eta: datetime | None = None,
    tas_kt: float | None = None,
    usable_gal: float | None = None,
    burn_gph: float | None = None,
) -> FlightPlates:
    """The plates Keep for the Air keeps for a flight, and their size,
    about, said before they are fetched: the departure's, the
    destination's, each stop's and the alternate's -- `alternate` filed,
    or the engine's pick of those that will do at `eta` (UTC; now where
    not given) at the airplane's cruise `tas_kt` (14 CFR 91.169(c)) --
    and those of the fields within diversion range of the route (the
    engine's `diversion_range_nm`, from `tas_kt`, `usable_gal` and
    `burn_gph`, the picked airplane's own; none with no airplane)."""
    fields = [f.strip().upper() for f in route.split(",") if f.strip()]
    if len(fields) < 2:
        raise HTTPException(422, "route is the flight's fields, at least a departure and a destination.")
    path = read_fixes(fixes) or [_point(f) for f in fields]
    when = eta or datetime.now(timezone.utc)
    arrival = (when if when.tzinfo else when.replace(tzinfo=timezone.utc)).timestamp()
    return plate_sets.for_flight(fields, path, alternate.strip().upper() or None, arrival, tas_kt, usable_gal, burn_gph)


@router.get("/api/plates/states", response_model=PlateStates, openapi_extra=SHARED)
def plate_states() -> JSONResponse:
    """The states whose plates Downloads offers, each with its size,
    about, of the d-TPP cycle in force, and when the next takes over
    (0901Z on its AIRAC date), when a kept state is fetched again."""
    return JSONResponse(PlateStates(**plate_sets.by_state()).model_dump(), headers={"Cache-Control": SHARED_CACHE})


@router.get("/api/plates/states/{cycle}/{state}", response_model=PlateStateCharts, openapi_extra=SHARED)
def plate_state(cycle: str, state: str) -> JSONResponse:
    """A state's plates of `cycle`: each open field and its charts, which
    the device fetches as the card's Charts tab does (/api/faa-chart).
    404 for a cycle not served or a state with no plates."""
    found = plate_sets.state_charts(cycle, state)
    if found is None:
        raise HTTPException(404, f"No plates for {state!r} in d-TPP cycle {cycle!r}.")
    return JSONResponse(PlateStateCharts(**found).model_dump(), headers={"Cache-Control": SHARED_CACHE})
