"""What /api/plan and /api/navlog are asked (PlanQuery), read and checked
before any planning, and the route's named checkpoints: shared by the
routers that plan a route (plan, gonogo, figures, route_options) and the
departure window, so no router imports another for them."""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated

from fastapi import HTTPException, Query
from wingtip import airports, fixes, procedures
from wingtip import flight_plan as fp

# As vfr_holds: PlanQuery's own `holds` is the address's.
from wingtip import holds as vfr_holds
from wingtip.engine import ask as engine
from wingtip.aircraft import aircraft_profile

from . import foreflight
from .checkpoint_scoring import route_checkpoints
from .router_basics import Route
from .schemas.common import AltitudeChoice, FlightRules

# A pilot's own cruise speed: above zero, since every leg's time divides
# by it -- zero was a ZeroDivisionError and a 500 rather than a 422.
CruiseTas = Annotated[float | None, Query(gt=0, le=1000)]
# The power a pilot's own cruise figures are at, in percent: from the
# lowest a handbook's cruise table goes, about 40, to full power.
CruisePower = Annotated[float | None, Query(ge=40, le=100)]
#: An airplane's own service ceiling, ft, as the pilot sets it for their
#: N-number: from a powered glider's to past a piston single's highest.
ServiceCeiling = Annotated[float | None, Query(ge=1000, le=30000)]
#: An airplane's own sea-level best rate of climb, fpm, from its
#: handbook: above zero, and under any piston single's or twin's.
ClimbRate = Annotated[float | None, Query(gt=0, le=5000)]
#: Its own fuel for start, taxi and takeoff, gal, from its handbook.
TaxiFuel = Annotated[float | None, Query(ge=0, le=50)]
#: Its own still-air glide ratio, from its handbook's Section 3: a
#: light airplane's is about 7 to 12 to 1, a glider's past 40.
GlideRatio = Annotated[float | None, Query(gt=1, le=80)]
#: Its own descent's indicated airspeed, kt, as a handbook gives it (the
#: engine turns it to true at the altitudes the descent passes through),
#: and the descent's fuel flow, gal/h: above zero, and in the range a
#: light piston airplane's, a twin's or a single turboprop's descent covers.
DescentIas = Annotated[float | None, Query(ge=30, le=300)]
DescentBurn = Annotated[float | None, Query(ge=1, le=150)]


@dataclass
class PlanQuery:
    """What /api/plan and /api/navlog are asked, read from the query by
    FastAPI (`Depends()`): the route, a pilot's own altitude or the plan
    chosen, the aeroplane -- a stock profile, a pilot's own figures laid
    over it -- and the departure time. One list where the two routes each
    spelled out all twelve, and one `profile()` built from it."""

    dep: str
    dest: str
    #: The stops landed at on the way, in order: "KDSM,KLNK".
    stops: str = ""
    altitude_ft: float | None = None
    #: `altitude_ft` was picked on the altitude wheel: flown on each leg
    #: where that leg may fly it, else at the leg's own legal altitude
    #: nearest it (14 CFR 91.159, 91.119), as the wheel's figures were
    #: worked out -- where a typed altitude is flown on every leg, legal or
    #: not, with its cautions.
    altitude_nearest: bool = False
    altitude_choice: AltitudeChoice = "fastest"
    #: A stock profile's name, or "own" (wingtip.aircraft.OWN_AIRPLANE)
    #: for a pilot's own airplane of no stock type, flown on the figures
    #: below alone; none asked, no airplane is picked: the
    #: plan is the route's own figures (its course, miles, legs,
    #: checkpoints, altitudes, weather and airspace) and none that needs an
    #: airplane (times, ground speeds, fuel, the tops of climb and
    #: descent), never a stock airplane's in its place, the pilot's own
    #: figures below then unread. The owner (2026-11-09): "If no airplane
    #: is entered, only show the distance and the things you can without
    #: airplane profile, don't assume."
    aircraft: str | None = None
    cruise_tas_kt: CruiseTas = None
    fuel_burn_gph: float | None = None
    usable_fuel_gal: float | None = None
    climb_tas_kt: CruiseTas = None
    climb_fuel_burn_gph: float | None = None
    descent_ias_kt: DescentIas = None
    descent_fuel_burn_gph: DescentBurn = None
    cruise_power_pct: CruisePower = None
    #: The airplane's own ceiling over its profile's, where the pilot has
    #: set one for their N-number (the owner's "give users a way to change
    #: these specs for their n-number").
    service_ceiling_ft: ServiceCeiling = None
    #: Its own sea-level climb rate, start and taxi fuel and glide ratio,
    #: from its handbook, where the pilot's record has them.
    climb_rate_fpm: ClimbRate = None
    taxi_fuel_gal: TaxiFuel = None
    glide_ratio: GlideRatio = None
    depart: datetime | None = None
    #: The pilot will have a Class B clearance: its shelves are no
    #: ceiling, and the route is planned through it (wingtip.altitude).
    class_b_clearance: bool = False
    #: The flight rules: "ifr" plans it under IFR -- 14 CFR 91.177's
    #: minimum altitudes, 91.179's by direction of flight, 91.167's
    #: reserve (wingtip.ifr) -- where "vfr", the default, plans it as before.
    rules: FlightRules = "vfr"
    #: Under IFR, the alternate filed: the fuel on to it after the
    #: destination (14 CFR 91.167(a)(2)), in the totals.
    alternate: str = ""
    #: Points' own altitudes, feet above sea level: "VPBNG:4500,KMSN:1900".
    #: A waypoint's is flown to it, the hop into it at that altitude (where
    #: a pilot crosses it); an airport's is its pattern, which a flight
    #: landing there comes down to. The rest of the route as planned.
    altitudes: str = ""
    #: The waypoints among `altitudes` whose change of altitude begins at
    #: them (Start At), "VPBNG,DLH090030"; the rest are reached by their
    #: point (Cross At). The profile's per-leg altitude on the web and the
    #: phones (the owner's pick, 2026-11-10).
    altitude_starts: str = ""
    #: The instrument procedures picked at the route's fields, as the
    #: address has them: "KDLH:I09:ANDOE,KORD:BENKY6:BYLAW", the field, the
    #: procedure and any transition -- approaches, arrivals and
    #: departures alike -- and a fix ATC sent the airplane direct to, after
    #: a fourth colon ("KELD:I22::BXCMB"), the procedure flown from there. A leg flown by them is the longer by their path
    #: (with_procedures), and a flight landing by an approach comes down
    #: to the altitude of its first fix rather than to the pattern
    #: (approach_end).
    procedures: str = ""
    #: The runway each field is left from, where the pilot picked one, as
    #: "KSTL:30R,KMSN:36": a departure picked there flown by its runway
    #: transition for it (wingtip.procedure_paths.procedure_path), or with no
    #: departure there, out along it and its upwind (with_procedures).
    runways: str = ""
    #: The runway each field is landed on, where the pilot picked one (or
    #: it was picked into the wind), as "KUGN:23,KMSN:36": with no approach
    #: there, the leg in is flown by its traffic pattern (with_procedures).
    patterns: str = ""
    #: With no runway picked at a field, the runway into its own report's
    #: wind (wind_picks), for the first plan to fly the patterns the page
    #: picks a moment later: planned without them, its time jumped as they
    #: came (KOSH-KGRB 20.8 min, then 33 with both patterns, 2026-10-28).
    wind_runways: bool = False
    #: Altitudes ATC gave the pilot to cross the procedures' fixes at,
    #: feet above sea level: "BXCMB:3000". Each stands for the chart's at
    #: that fix wherever a procedure picked passes it -- the descent planned
    #: to it and the path's heights (drawn_procedures).
    crossings: str = ""
    #: Holds the pilot put on the route's points (wingtip.holds): the point,
    #: its inbound course, R or L, its legs and how long, as
    #: "VPBNG/090/30:270:R:1M:2T"; several joined by commas.
    holds: str = ""
    #: Minutes on the ground at the route's stops: "KJVL:45". A stop not
    #: named turns around in TURNAROUND_MIN, at the owner's pick (2026-10-20):
    #: the flights after it leave that much later, for their winds, their
    #: night and their times.
    ground: str = ""
    #: Checkpoints between the route's own points, as the planner picks
    #: them off the chart. False, the legs run from point to point alone
    #: -- the departure, the stops, the destination -- as a pilot whose
    #: map shows no waypoints flies it; and nothing is scored for them.
    checkpoints: bool = True

    def profile(self) -> dict | None:
        """The airplane: a stock profile with the pilot's own figures over
        it; None for no airplane (no `aircraft` asked), which plans the
        route's own figures and none that needs one."""
        if self.aircraft is None:
            return None
        return aircraft_profile(
            self.aircraft,
            self.cruise_tas_kt,
            self.fuel_burn_gph,
            self.usable_fuel_gal,
            self.climb_tas_kt,
            self.climb_fuel_burn_gph,
            self.descent_ias_kt,
            self.descent_fuel_burn_gph,
            self.cruise_power_pct,
            self.service_ceiling_ft,
            self.climb_rate_fpm,
            self.taxi_fuel_gal,
            self.glide_ratio,
        )

    @property
    def aircraft_key(self) -> str:
        """The profile's name, and its own ceiling where one is set: what the
        altitude selection is cached by, as the ceiling decides it; "" for
        no airplane, whose own ceiling is unread."""
        if self.aircraft is None:
            return ""
        return self.aircraft if self.service_ceiling_ft is None else f"{self.aircraft}@{self.service_ceiling_ft:.0f}"

    def own_altitudes(self) -> dict[str, float]:
        """`altitudes` by ident; a 422 for one that is not "IDENT:FEET",
        or not a VFR altitude: under 18,000 ft MSL, the floor of Class A
        (14 CFR 71.33), where no flight is VFR (14 CFR 91.135). Under IFR,
        up to FL410, the top of RVSM airspace (14 CFR part 91, Appendix G,
        section 1; 91.179(b)(4))."""
        top = 41_000 if self.rules == "ifr" else 17_999
        out = {}
        for part in filter(None, (p.strip() for p in self.altitudes.split(","))):
            ident, _, feet = part.partition(":")
            if not point_figure(part) or not 0 < float(feet) <= top:
                raise HTTPException(422, f"{part!r} is not a point's altitude: an ident and feet, as VPBNG:4500.")
            out[point_key(ident)] = float(feet)
        return out

    def own_starts(self) -> frozenset[str]:
        """`altitude_starts` as idents (point_key); a 422 for one that is
        not a point of a route."""
        out = set()
        for ident in filter(None, (p.strip() for p in self.altitude_starts.split(","))):
            if not point_figure(f"{ident}:0"):
                raise HTTPException(422, f"{ident!r} is not a point of the route for Start At: an ident, as VPBNG.")
            out.add(point_key(ident))
        return frozenset(out)

    def procedure_picks(self) -> list[tuple[str, str, str | None, str | None]]:
        """`procedures`, each the field, the procedure, its transition
        (None, an approach from vectors) and the fix flown direct to (None,
        as charted); a 422 for one that is not
        "FIELD:PROCEDURE[:TRANSITION[:DIRECT]]" -- the engine's reading
        (wingtip_engine::route::picks), the web app's lib/procedures too."""
        out = []
        for read in engine("procedures_read", text=self.procedures):
            if not read["exact"]:
                raise HTTPException(422, f"{read['part']!r} is not a procedure: a field, a procedure and a transition, as KDLH:I09:ANDOE.")
            pick = read["pick"]
            out.append((pick["ident"], pick["id"], pick["transition"], pick["direct"]))
        return out

    def own_crossings(self) -> dict[str, float]:
        """`crossings` by fix; a 422 for one that is not "FIX:FEET", or
        over the altitudes' top (own_altitudes)."""
        top = 41_000 if self.rules == "ifr" else 17_999
        out = {}
        for part in filter(None, (p.strip() for p in self.crossings.split(","))):
            ident, _, feet = part.partition(":")
            if not point_figure(part) or not 0 < float(feet) <= top:
                raise HTTPException(422, f"{part!r} is not a fix's crossing altitude: a fix and feet, as BXCMB:3000.")
            out[ident.upper()] = float(feet)
        return out

    def own_holds(self) -> list[vfr_holds.Hold]:
        """`holds`, each as wingtip.holds.parse reads it; a 422 for one that is
        not a hold."""
        out = []
        for part, hold in vfr_holds.parse_all(self.holds):
            if hold is None:
                raise HTTPException(
                    422, f"{part!r} is not a hold: a point, its inbound course, R or L, its legs and how long, as VPBNG:270:R:1M:2T."
                )
            out.append(hold)
        return out

    def own_ground(self) -> dict[str, float]:
        """`ground` by ident; a 422 for one that is not "IDENT:MINUTES", or
        a stop of more than a day."""
        out = {}
        for part in filter(None, (p.strip() for p in self.ground.split(","))):
            ident, _, minutes = part.partition(":")
            if not point_figure(part) or not 0 <= float(minutes) <= 24 * 60:
                raise HTTPException(422, f"{part!r} is not a stop's time on the ground: an ident and minutes, as KJVL:45.")
            out[point_key(ident)] = float(minutes)
        return out

    def departure_runways(self) -> dict[str, str]:
        """The runway each field is left from (`runways`), by its ident."""
        return runway_picks(self.runways, "is not a runway left from: an ident and a runway, as KSTL:30R.")

    def landing_runways(self) -> dict[str, str]:
        """The runway each field is landed on (`patterns`), by its ident."""
        return runway_picks(self.patterns, "is not a runway landed on: an ident and a runway, as KUGN:23.")

    def drawn_procedures(self) -> list[tuple[str, dict]]:
        """The procedures picked (procedure_picks), each its field and its
        drawing (wingtip.procedures.procedure_drawing), read once for the
        request; one the CIFP does not have, or cannot be had, left out:
        its leg is flown as the route goes. A fix the pilot was given an
        altitude to cross at (own_crossings) is crossed at it, in place of
        the chart's window, for the descent and the path alike."""
        own = self.own_crossings()
        out = []
        for ident, procedure, transition, direct in self.procedure_picks():
            try:
                drawn = procedures.procedure_drawing(ident, procedure, transition)
            except RuntimeError:
                continue
            if drawn:
                fixes_ = [
                    {**f, "min_ft": own[f["ident"]], "max_ft": own[f["ident"]]} if f["ident"] in own and not f["missed"] else f
                    for f in drawn.get("fixes", [])
                ]
                drawn = {**drawn, "fixes": fixes_, **({"direct": direct} if direct else {})}
                out.append((ident, drawn))
        return out

    def alternate_airport(self) -> dict | None:
        """Under IFR, the alternate filed (`alternate`) as the airports
        table has it, with its ident; None under VFR or with none filed. A
        404 for one that is not an airport, before any planning (and
        before the nav log's stream starts, where it was an error line)."""
        if self.rules != "ifr" or not self.alternate.strip():
            return None
        try:
            alt = airports.get_airport(self.alternate)
        except ValueError as err:
            raise HTTPException(404, f"No airport goes by {self.alternate!r}.") from err
        return {**alt, "ident": self.alternate.strip().upper()}

    def asked(self) -> fp.Asked:
        """The request read for wingtip.flight_plan: each part that is not
        one refused now, a 422 (or a 404 for an alternate that is not an
        airport), before any of the planning is done for it."""
        return fp.Asked(
            profile=self.profile(),
            aircraft_key=self.aircraft_key,
            altitude_ft=self.altitude_ft,
            altitude_nearest=self.altitude_nearest,
            altitude_choice=self.altitude_choice,
            class_b_clearance=self.class_b_clearance,
            rules=self.rules,
            depart=self.depart,
            own_altitudes=self.own_altitudes(),
            altitude_starts=self.own_starts(),
            drawn=self.drawn_procedures(),
            leave_runways=self.departure_runways(),
            land_runways=self.landing_runways(),
            wind_runways=self.wind_runways,
            ground=self.own_ground(),
            holds=self.own_holds(),
            checkpoints=self.checkpoints,
            alternate=self.alternate_airport(),
        )


def point_figure(part: str) -> bool:
    """Whether `part` is a point of the route and a figure, "VPBNG:4500":
    an ident, or the pilot's own point off a fix, "VPBNG/090/30" or packed
    "DLH090030", by the engine's form of one (wingtip_engine::route::points,
    which the web app's lib/identSchema asks too, either case here) -- as the
    saved flight's SaveFlightRequest.POINT takes it, where an altitude set
    on such a point was a 422 for the whole log -- and up to five figures."""
    ident, _, figure = part.partition(":")
    return ident.isascii() and engine("point_kind", text=ident.upper()) is not None and re.fullmatch(r"\d{1,5}", figure) is not None


def point_key(ident: str) -> str:
    """A point's ident as the route has it (Route.idents): a point off a
    fix in its one written form (wingtip.fixes.frd_ident), packed or not."""
    parts = fixes.parse_frd(ident)
    return fixes.frd_ident(*parts) if parts else ident.upper()


def runway_picks(text: str, not_one: str) -> dict[str, str]:
    """The runways picked at fields, "KSTL:30R,KMSN:36", by the field's FAA
    ident (_bare_field), as the engine reads them
    (wingtip_engine::route::picks); a 422 for one that is not "IDENT:RUNWAY",
    `not_one` saying what it is not."""
    out = {}
    for read in engine("runways_read", text=text):
        if read["pick"] is None:
            raise HTTPException(422, f"{read['part']!r} {not_one}")
        out[read["pick"]["field"]] = read["pick"]["runway"]
    return out


def named_checkpoints(r: Route) -> tuple[list, list, list]:
    """The route's checkpoints scored and picked (route_checkpoints), each
    selected one named as the route's ForeFlight pack names it, the pack's
    own naming (app.foreflight), for the web app's flight plan link to name
    them by (CONTPACK@LAKE_ZURICH): scored, selected and each hop's."""
    scored, selected, by_hop = route_checkpoints(r)
    names = foreflight.waypoint_names(r.dep_ident, r.dest_ident, foreflight.from_candidates(selected))
    for c, name in zip(selected, names):
        c["waypoint"] = name
    return scored, selected, by_hop
