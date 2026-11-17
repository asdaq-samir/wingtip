"""One leg of a route and its procedure, hold and alternate, for app.schemas.plan's Plan and the nav log's stream."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .common import Wind
from .leg_points import TopOfClimb, TopOfDescent


class MissedApproachPath(BaseModel):
    """An approach's missed approach as it is flown, from its missed
    approach point and round its hold once (wingtip.procedure_paths.missed_path),
    and the altitude it climbs to: the highest its fixes set."""

    path: list[list[float]]
    ft: float | None


class LegProcedure(BaseModel):
    """A leg flown by the procedures picked -- out by a departure, in by an
    arrival and an approach (wingtip.procedure_paths.flown) -- rather than as
    the route goes: its path from the leg's start, [lat, lon] pairs; the
    altitude the chart sets at each point (None where it sets none); its
    length; whether it comes down to a runway; where its final starts, the
    index in `path` of its final approach fix; where its missed approach
    point is, the index in `path` the missed approach is flown from (short
    of the runway's threshold, where the path ends, on a VOR's or a LOC's
    approach); and the approach's missed approach. The miles it is more than the leg's own, and the time and
    fuel they take at the leg's ground speed and cruise burn, are in the
    leg's `ete_min` and `fuel_gal` (wingtip.flight_plan.with_procedures);
    with no airplane, the time and fuel None."""

    path: list[list[float]]
    ft: list[float | None]
    nm: float
    landing: bool
    final_at: int | None = None
    map_at: int | None = None
    missed: MissedApproachPath | None = None
    more_nm: float
    more_min: float | None
    more_gal: float | None


class AirwayAltitudes(BaseModel):
    """An airway segment's published altitudes, feet MSL (NASR AWY_SEG_ALT):
    the MEA, the GNSS MEA, the MOCA and the MAA; `from_` the fix it starts
    at."""

    id: str
    from_: str = Field(alias="from")
    mea_ft: float | None = None
    gnss_mea_ft: float | None = None
    moca_ft: float | None = None
    maa_ft: float | None = None

    model_config = ConfigDict(populate_by_name=True)


class LegHold(BaseModel):
    """A hold the pilot put at a point of the route (wingtip.holds), on the
    leg that leaves it -- `at_end`, the leg into the destination it is
    held at: its inbound course (magnetic), its turns, its legs by time or
    distance, how long (turns, or minutes), the minutes and fuel it takes,
    already in the leg's `ete_min` and `fuel_gal` (plan.with_holds), one
    turn round its racetrack's minutes, the entry from the course flown to
    it (AIM 5-3-8), and that one turn as [lat, lon] pairs from the point."""

    fix: str
    inbound_deg: int
    right: bool
    leg_min: float | None
    leg_nm: float | None
    turns: int | None
    minutes: float
    lap_min: float
    gal: float
    entry: Literal["direct", "teardrop", "parallel"]
    path: list[list[float]]
    at_end: bool = False


class Leg(BaseModel):
    """One dead-reckoning leg. `wind` is None when no winds-aloft station
    is near enough, which is not the same as calm: groundspeed then falls
    back to true airspeed. groundspeed/ETE/fuel are None when the wind
    exceeds true airspeed, i.e. the leg cannot be flown.

    The true airspeed and fuel flow are the aeroplane's in the leg's own
    air (wingtip.performance): its cruise figures are at a reference
    altitude on a standard day, and the forecast temperature at this
    altitude gives the density altitude they are flown at, at the power
    it allows -- the cruise power, or less where full throttle cannot
    make it; `power_pct` None where the profile names no cruise power, its
    TAS and burn then as given. `oat_c` is None where no forecast
    temperature was near: a standard day is assumed there."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    distance_nm: float
    altitude_ft: float
    true_course_deg: float
    wind: Wind | None
    wca_deg: float | None
    true_heading_deg: float | None
    magnetic_variation_deg: float
    magnetic_heading_deg: float | None
    # The true course less the variation (east is least, west is best,
    # FAA-H-8083-25C ch. 16), the engine's: what the map's Route Leg sheet shows.
    magnetic_course_deg: float
    groundspeed_kt: float | None
    ete_min: float | None
    fuel_gal: float | None
    tas_kt: float | None
    fuel_burn_gph: float | None
    power_pct: float | None
    oat_c: float | None = None
    density_altitude_ft: float | None
    # How much of the leg's time is climb -- from the field on the first
    # leg, and up to a new level where a plan steps -- flown at climb
    # speed and burn, and already in `ete_min` and `fuel_gal`.
    climb_min: float = 0.0
    # True where the leg has climb minutes and the airplane's profile gives
    # no climb fuel flow: the climb's gallons are not in `fuel_gal`, and the
    # app asks for the figure; no multiple of the cruise burn is assumed
    # (the owner's rule of 2026-11-09). None or False otherwise.
    climb_fuel_unknown: bool | None = None
    # The one phase the leg is flown in whole, the climb or the descent,
    # its figures then that phase's; None for the cruise or a leg cut by a
    # top of climb or descent (the engine's NavLogLeg `phase`).
    phase: Literal["climb", "descent"] | None = None
    # The top of the climb, on the leg it is reached on, and the top of
    # the descent, on the leg it starts on.
    toc: TopOfClimb | None = None
    tod: TopOfDescent | None = None
    # Flown by the procedures picked, the time and fuel of their miles
    # more already in `ete_min` and `fuel_gal` (plan.with_procedures).
    procedure: LegProcedure | None = None
    # A hold the pilot put at its start (or, into the destination, its
    # end), its time and fuel already in `ete_min` and `fuel_gal`.
    hold: LegHold | None = None
    # Into a stop the route lands at and leaves again: the minutes on the
    # ground there before the next leg (the pilot's own, else the
    # planner's TURNAROUND_MIN), not in `ete_min`. None on every other
    # leg.
    ground_min: float | None = None
    # Along an airway (wingtip.airways, the route's "BAE V191 OSH"): the
    # segment flown and its published altitudes, the MEA the floor under
    # IFR (14 CFR 91.177(a)(1)), for the nav log's route column as a paper
    # IFR log has one. None off an airway.
    airway: AirwayAltitudes | None = None


class AlternateLeg(BaseModel):
    """The leg from the destination on to the IFR alternate: flown at the
    route's last altitude in its winds, or in still air where they could
    not be read (`still_air`). With no airplane, its miles alone: the
    time and fuel None."""

    ident: str
    distance_nm: float
    ete_min: float | None
    fuel_gal: float | None
    altitude_ft: float
    still_air: bool = False
