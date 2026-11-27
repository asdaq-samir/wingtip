"""The route planned and briefed for the Go / No-Go, and the findings
worked out from them and from what only the pilot knows: what POST
/api/go-no-go (app.routers.gonogo) and the departure window
(app.window.hours) both answer from, planned as /api/navlog and briefed
as /api/briefing are (app.plan_query, app.route_briefing)."""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel

from wingtip import flight_plan as fp
from wingtip import planning as planning_module

from . import ask as engine_ask
from . import live as live_reports
from .icing import freezing_precip, icing_at_altitude, icing_line, icing_unchecked, icing_words
from .minimums import ceiling_unknown_at, under_minimums
from .pass_times import pass_time, sua_when, tfr_when
from .runways import runway_checks
from .schemas import GoNoGoAsk
from .weight_balance import balance
from .words import gairmet_title, sigmet_hazard
from .. import route_briefing
from ..plan_query import PlanQuery, named_checkpoints

log = logging.getLogger(__name__)

#: A briefing that failed with nothing to say, as the web's useBrief says it.
BRIEFING_FAILED = "could not load the briefing"

#: PlanQuery's fields, which the ask carries first.
ROUTE_FIELDS = (
    "dep",
    "dest",
    "stops",
    "altitude_ft",
    "altitude_nearest",
    "altitude_choice",
    "aircraft",
    "cruise_tas_kt",
    "fuel_burn_gph",
    "usable_fuel_gal",
    "climb_tas_kt",
    "climb_fuel_burn_gph",
    "descent_ias_kt",
    "descent_fuel_burn_gph",
    "cruise_power_pct",
    "service_ceiling_ft",
    "climb_rate_fpm",
    "taxi_fuel_gal",
    "glide_ratio",
    "depart",
    "rules",
    "alternate",
    "altitudes",
    "altitude_starts",
    "procedures",
    "runways",
    "crossings",
    "holds",
    "ground",
    "checkpoints",
)


@dataclass
class Planned:
    """What the nav log says of the route: its altitude line (`nav`: the
    plan flown, its altitude, the four plans, the selection, the airplane
    and a pilot's own altitude's cautions), its legs and its totals; or,
    for a route with no legal altitude, the planner's line why
    (`problem`), as the web's usePlan has them."""

    nav: dict | None
    legs: list[dict]
    totals: dict | None
    problem: str | None = None


def _as_dict(value) -> dict:
    return value.model_dump() if isinstance(value, BaseModel) else value


def plan_for(q: PlanQuery, r) -> Planned:
    """The route planned as /api/plan plans it, bounded the same way."""
    asked = q.asked()
    _, _, runs, outcome = fp.plan_within_limit(r, asked, lambda: named_checkpoints(r))
    aircraft = None if asked.profile is None else {"name": q.aircraft, **asked.profile}
    if isinstance(outcome, fp.Unflyable):
        why, _ = fp.unflyable_parts(outcome, runs)
        return Planned(nav=None, legs=[], totals=None, problem=why["brief"])
    options = [_as_dict(o) for o in outcome.options]
    if isinstance(outcome, fp.NoWinds):
        # The altitude line came, then the winds failed: no legs, no totals.
        return Planned(
            nav={
                "flown": None,
                "altitude_ft": None,
                "options": options,
                "selection": outcome.selection,
                "aircraft": aircraft,
                "cautions": [],
            },
            legs=[],
            totals=None,
        )
    nav = {
        "flown": outcome.choice or "custom",
        "altitude_ft": outcome.altitude_ft,
        "options": options,
        "selection": outcome.selection,
        "aircraft": aircraft,
        "cautions": [_as_dict(c) for c in outcome.cautions],
    }
    outcome, flown = fp.flown_as_picked(r, runs, outcome, asked)
    legs = [_as_dict(leg) for leg in flown]
    totals = fp.totals_of(r, runs, outcome, asked)
    return Planned(nav=nav, legs=legs, totals=totals)


def brief_for(q: PlanQuery, ete_min: float | None) -> dict:
    """The route's briefing for the flight's hours, as /api/briefing."""
    return _as_dict(route_briefing.briefing(q.dep, q.dest, q.stops, q.depart, ete_min))


def alternate_for(dest: str, eta: datetime, tas_kt: float, filed: str) -> dict | None:
    """The IFR alternate's check (/api/alternate); None where it could not
    be made, as the web's query that failed."""
    try:
        return _as_dict(route_briefing.alternate(dest, eta, tas_kt, filed))
    except HTTPException:
        return None


def briefing_or_failure(q: PlanQuery, ete_min: float | None) -> tuple[dict | None, str | None]:
    """The route's briefing for the flight's hours, or None and why it
    failed in a line, as the web's useBrief says it."""
    try:
        return brief_for(q, ete_min), None
    except HTTPException as err:
        # The error's first line, as the web's describeError says it.
        return None, str(err.detail).split("\n")[0] or BRIEFING_FAILED
    except Exception:  # noqa: BLE001 -- the web says a briefing that failed, whatever failed it
        log.exception("briefing for the Go / No-Go")
        return None, BRIEFING_FAILED


@dataclass
class Findings:
    """What the Go / No-Go is worked out from, before the engine says what
    it comes to: the web's VerdictInput without its risk (`verdict`), the
    risk assessment's input (`risk_in`, None with no briefing, as the web
    makes none), and the loading the weight and balance counted."""

    verdict: dict
    risk_in: dict | None
    loading: dict | None
    load: dict | None
    loaded: dict | None


def findings_for(
    ask: GoNoGoAsk, q: PlanQuery, r, planned: Planned, briefing: dict | None, failed: str | None, depart: datetime, live: bool = True
) -> Findings:
    """Each tab's say about the flight leaving at `depart`, from the plan,
    the briefing for that flight and what only the pilot knows -- as the
    web's FlightBriefingView feeds lib/verdict. `live`: what SWIM says now
    (ITWS alerts, the Command Center's programs, SFDPS's status of an
    area) counts; False for a departure hours off, when what holds now
    will not (app.routers.window)."""
    nav, legs, totals = planned.nav, planned.legs, planned.totals
    # The pilot's own day is the client's to send: the planner has no
    # device and so no time zone of its own, and takes the departure's UTC
    # day, where the web takes the device's local one -- a date that
    # lapses that evening can read differently. The apps send `day`.
    day = ask.day or depart.astimezone(timezone.utc).strftime("%Y-%m-%d")
    ifr = q.rules == "ifr"
    # Every airport the flight lands at, each once; a waypoint flown
    # through has no weather of its own.
    fields = [{"ident": i, "elevation_ft": a.get("elevation_ft")} for i, a in zip(r.idents, r.airports) if not a.get("fix")]
    landings = list(dict.fromkeys(f["ident"] for f in fields))
    dest = r.idents[-1]
    selection = (nav or {}).get("selection") or {}

    def unchecked(source: str) -> bool:
        return bool(briefing) and source in (briefing.get("weather_unavailable") or [])

    # Under IFR "VFR flight not recommended" is no reason not to go: its
    # weather check is the destination's and the alternate's (14 CFR
    # 91.169), not VFR's minimums.
    vnr = [] if ifr else list((briefing or {}).get("vfr_not_recommended") or [])
    under_mine = under_minimums(ask.minimums.model_dump(), briefing, landings, dest) if briefing else []
    unknown_ceilings = ceiling_unknown_at(briefing, landings) if briefing else []

    def pass_at(along_nm: float):
        return pass_time(legs, depart, along_nm)

    # The TFRs the route goes through while they are in force: the
    # briefing's word on it where it placed the TFR on the legs
    # (`on_route`, app.exposure: in it at any time from entering to
    # leaving, half an hour either way), else in force when the flight
    # gets there, or at some time during the flight where that time is not
    # known (FlightBriefingView's tfrInForce).
    def tfr_in_force(t: dict) -> bool:
        when = (t.get("on_route") or {}).get("when")
        if when:
            return when == "during"
        at = pass_at(t["along_track_nm"])
        return not at or tfr_when(t, at) == "in-force"

    tfrs_crossed = [t for t in (briefing or {}).get("tfrs") or [] if t.get("crosses") and tfr_in_force(t)]
    special_use = []
    areas = selection.get("special_use") or []
    # SFDPS's word where it holds at the pass, as the web's Brief says it.
    status_now = live_reports.area_status([area["name"] for area in areas], now=datetime.now(timezone.utc).timestamp()) if live else {}
    for area in areas:
        at = pass_at(area["along_track_nm"])
        scheduled = sua_when(area.get("times_of_use"), at, area.get("time_zone")) if at else "unknown"
        special_use.append({"name": area["name"], "when": live_reports.live_when(scheduled, status_now.get(area["name"]), at)})

    # The route's fuel and TFR figures, the engine's one copy the web's Brief
    # asks too (gonogo_route_figures; the aviation audit's AV-12).
    route_figures = engine_ask(
        "gonogo_route_figures",
        totals=totals or None,
        tfr_count=len((briefing or {}).get("tfrs") or []),
        crossed=[t["notam_id"] for t in tfrs_crossed],
    )
    flown_ft = [leg["altitude_ft"] for leg in legs]
    icing = icing_at_altitude(selection, flown_ft, briefing.get("pireps") or []) if ifr and nav and briefing else None
    # The weather's one icing caution: under IFR, icing at an altitude flown
    # or, where the freezing level is not known, that it was not checked;
    # on any flight, freezing rain or drizzle reported or forecast on the
    # route, which ices an airplane out of cloud (AIM 7-1-20).
    icing_said = icing_words(
        icing_line(icing) if icing else (icing_unchecked(selection, flown_ft) if ifr and nav and briefing else None),
        freezing_precip(briefing) if briefing else None,
    )
    hazard_names = (
        (
            [sigmet_hazard(h.get("hazard"), h.get("type") or "SIGMET") for h in briefing.get("hazards") or []]
            + [gairmet_title(g) for g in briefing.get("gairmets") or []]
        )
        if briefing
        else []
    )
    risk_in = None
    if briefing:
        risk_in = {
            "vfr_not_recommended": bool(vnr),
            "under_minimums": under_mine,
            "tfr_on_route": bool(tfrs_crossed),
            "hazards": 0 if unchecked("hazards") and unchecked("gairmets") else len(hazard_names),
            "night": (totals or {}).get("night") is True,
            "night_passengers": (totals or {}).get("night_passengers"),
            "lights": (totals or {}).get("lights"),
            "fuel_margin_gal": route_figures["least_margin_gal"],
            "ifr": ifr,
            "currency": ask.currency.model_dump() if ask.currency else None,
            "day": day,
            "ticked": {key: True for key in ask.ticked},
        }
        if ask.own_airplane:
            own = ask.own_airplane
            risk_in["vor_check"] = own.vor_check.model_dump() if own.vor_check else None
            risk_in["inspections"] = own.inspections.model_dump() if own.inspections else None
            risk_in["squawks"] = [s.model_dump() for s in own.squawks]

    # The loading (lib/weightBalance) is balanced only with the pilot's own
    # load: the weight and balance is this flight's load against the POH's
    # limits (its section 6; 14 CFR 91.9(a), 91.103), so with none given
    # it is not worked and said so ("give your load", the engine's
    # no_load), never the POH's sample airplane answered as the flight's.
    # The runways are then read at the POH table's heaviest weight, the
    # longest distance. With no airplane there is no loading to balance.
    airplane = q.profile()
    profile = (nav or {}).get("aircraft") or ({"name": q.aircraft, **airplane} if airplane else {})
    loading = profile.get("loading")
    load = ask.load.model_dump() if ask.load else None
    loaded = balance(loading, load, (totals or {}).get("fuel_gal")) if loading and load else None
    # The row's "2,407 lb at 41.2 in" is the engine's words (gonogo_input
    # writes them); the loading's answer goes on without them.
    if loaded:
        loaded.pop("takeoff_words")
    # The verdict's balance and runways as the web's, which wait on the nav log.
    nav_loaded = loaded if nav else None
    checks = runway_checks(
        nav and nav["aircraft"],
        briefing,
        fields,
        nav_loaded["takeoff"]["weight_lb"] if nav_loaded else None,
        nav_loaded["landing"]["weight_lb"] if nav_loaded else None,
        ask.runway_picks.model_dump() if ask.runway_picks else None,
    )

    verdict = engine_ask(
        "gonogo_input",
        briefed=bool(briefing),
        failed=failed,
        ifr=ifr,
        weather_unavailable=(briefing or {}).get("weather_unavailable") or [],
        forecast=briefing["forecast"] if briefing else None,
        vfr_not_recommended=vnr,
        under_minimums=under_mine,
        icing=[icing_said] if icing_said else [],
        # A ceiling reported or forecast with no height is not checked
        # against the minimums, the pilot's or 91.155's: not met, not
        # missed (minimums.ceiling_unknown_at).
        ceilings_unknown=unknown_ceilings,
        hazards=hazard_names,
        # What SWIM says now at the route's airports (app.gonogo.live).
        terminal_alerts=live_reports.itws_lines(landings) if live else [],
        flow_programs=live_reports.program_lines(landings) if ifr and live else [],
        route_figures=route_figures,
        special_use=special_use,
        nav=nav or None,
        problem=planned.problem,
        legs_ft=flown_ft,
        totals=bool(totals),
        # The runways' tables are the nav log's airplane; with no nav log
        # the oxygen finding has the profile asked for.
        aircraft=(nav["aircraft"] or None) if nav else (profile or None),
        runway_checks=[{**c, "ident": c["field"]["ident"]} for c in checks],
        loading=bool(loading),
        loaded=loaded,
    )
    return Findings(verdict=verdict, risk_in=risk_in, loading=loading, load=load, loaded=loaded)


def departure_of(q: PlanQuery) -> datetime:
    """When the flight leaves: the ask's (UTC when naive), else now."""
    depart = q.depart if q.depart is None or q.depart.tzinfo else q.depart.replace(tzinfo=timezone.utc)
    return depart or planning_module.now()
