"""Each departure hour's Go / No-Go input, gathered as POST /api/go-no-go
gathers it for one (app.gonogo.flight), and the engine's
departure_window over them all, asked once.

For each hour the route is planned for that departure -- its winds aloft
period and, through the night's 45-minute reserve (14 CFR 91.151(a)(2)),
whether it is flown at night -- and briefed for that flight's own hours:
the TAFs, G-AIRMETs and TFRs over its window. What holds only now is left
to the hours it holds in: an hour more than LIVE_WITHIN_S off does not
read today's METARs (a field's weather then is its TAF's), today's ITWS
alerts, the Command Center's programs or SFDPS's status of an area."""

import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from wingtip import departure_window as forecast, runway_wind, weather, winds_aloft

from wingtip import planning as planning_module
from ..gonogo import ask as engine
from ..router_basics import load_route
from ..gonogo.flight import ROUTE_FIELDS, PlanQuery, Planned, alternate_for, briefing_or_failure, findings_for, plan_for
from .schemas import DepartureWindowAsk

#: How near now a departure reads what is reported now -- the METARs, the
#: ITWS alerts, flow programs and SFDPS -- as the Go / No-Go does for a
#: flight about to leave. The planner's own figure: a METAR is a report
#: of the hour it was made, and the next one is due within the hour.
LIVE_WITHIN_S = 3600

#: Hours briefed at once: each briefing reads the weather store with its
#: own few threads (app.route_briefing).
WORKERS = 4


def _hours(ask: DepartureWindowAsk, now: datetime, reach: float | None) -> list[datetime]:
    """The departure hours asked, from `start` (the next whole hour) one an
    hour, those that leave before the TAFs along the route end."""
    first = ask.start if ask.start is not None else now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    first = first if first.tzinfo else first.replace(tzinfo=timezone.utc)
    hours = [first + timedelta(hours=k) for k in range(ask.hours)]
    return [h for h in hours if reach is not None and h.timestamp() < reach]


def _ete(planned: Planned) -> float | None:
    return (planned.totals or {}).get("ete_min")


class Plans:
    """The route planned for each departure, kept by what changes the plan
    across the hours: its winds aloft (winds_aloft.winds_key_for: the
    map's grid at the hour where its timeline holds it, so each hour flies
    its own winds; the GFS stations' period past it) and,
    with an airplane, whether the flight is at night, which sets its
    reserve. A dozen hours share a plan or two."""

    def __init__(self, q: PlanQuery, r, now: datetime, airplane: bool):
        self.q, self.r, self.now, self.airplane, self.kept = q, r, now, airplane, {}
        # One plan at a time: two hours wanting the same plan wait for it
        # rather than both working it out.
        self.lock = threading.Lock()

    def _planned(self, key, depart: datetime) -> Planned:
        with self.lock:
            if key not in self.kept:
                self.kept[key] = plan_for(replace_depart(self.q, depart), self.r)
            return self.kept[key]

    def for_hour(self, depart: datetime) -> Planned:
        period = winds_aloft.winds_key_for(depart)
        planned = self._planned((period, None), depart)
        ete = _ete(planned)
        if not self.airplane or ete is None:
            return planned
        night = engine(
            "night_on_the_way",
            start=list(self.r.start),
            end=list(self.r.end),
            depart_s=depart.timestamp(),
            minutes=ete + ((planned.totals or {}).get("ground_min") or 0),
        )
        if bool((planned.totals or {}).get("night")) == night:
            return planned
        return self._planned((period, night), depart)


def replace_depart(q: PlanQuery, depart: datetime) -> PlanQuery:
    return replace(q, depart=depart)


def _as_forecast(briefing: dict, r, depart: datetime, ete_min: float | None) -> dict:
    """The briefing for a departure hours off: each field's report is its
    TAF's wind then, with the latest report's air for its density altitude
    (wingtip.departure_window.forecast_report; no TAF gives the
    temperature, so a field's afternoon is read at the morning's -- the
    pilot's to check nearer the time), and "VFR flight not recommended"
    (AIM 7-1-5) read on the forecast alone, as no report of now says
    anything of then."""
    metars = briefing.get("metars") or {}
    airports = briefing.get("airports") or {}
    where = {i: a for i, a in zip(r.idents, r.airports) if not a.get("fix")}
    arrive = depart + timedelta(minutes=ete_min) if ete_min is not None else depart
    reports, fields = {}, {}
    for n, (ident, airport) in enumerate(where.items()):
        at = depart if n == 0 else arrive
        report = forecast.forecast_report(airport["lat"], airport["lon"], airport.get("ident") or ident, at.timestamp(), metars.get(ident))
        reports[ident] = report
        field = airports.get(ident)
        if field is not None:
            fields[ident] = {**field, "runways": runway_wind.with_winds(field.get("runways") or [], report, airport["lat"], airport["lon"])}
    return {
        **briefing,
        "metars": reports,
        "airports": {**airports, **fields},
        "vfr_not_recommended": weather.vfr_not_recommended_reasons(list(where), {i: None for i in where}, briefing["forecast"]),
    }


def _hour(
    ask: DepartureWindowAsk, q: PlanQuery, r, plans: Plans, depart: datetime, now: datetime, reach: float
) -> tuple[dict, dict | None]:
    """One hour as the engine reads it, and its risk assessment's input."""
    planned = plans.for_hour(depart)
    ete = _ete(planned) if ask.airplane else None
    q_hour = replace_depart(q, depart)
    briefing, failed = briefing_or_failure(q_hour, ete)
    live = (depart - now).total_seconds() <= LIVE_WITHIN_S
    if briefing and not live:
        briefing = _as_forecast(briefing, r, depart, ete)
    found = findings_for(ask, q_hour, r, planned, briefing, failed, depart, live=live)
    totals = planned.totals or {}
    alternate = None
    # At the airplane's own cruise: none, no alternate is timed.
    tas = ((planned.nav or {}).get("aircraft") or {}).get("cruise_tas_kt")
    if q.rules == "ifr" and _ete(planned) is not None and tas:
        alternate = alternate_for(r.idents[-1], depart + timedelta(minutes=_ete(planned)), tas, q.alternate)
    forecast_worst = (briefing or {}).get("forecast") or {}
    arrive = depart.timestamp() + 60 * ((ete or 0) + (totals.get("ground_min") or 0))
    return {
        "depart_s": depart.timestamp(),
        "reaches": arrive <= reach,
        "ete_min": ete,
        "fuel_gal": totals.get("fuel_gal") if ask.airplane else None,
        "ground_min": totals.get("ground_min") or 0,
        "ceiling_ft": forecast_worst.get("min_ceiling_ft"),
        "visibility_sm": forecast_worst.get("min_visibility_sm"),
        "verdict": found.verdict,
        "alternate": alternate,
    }, found.risk_in


def departure_window(ask: DepartureWindowAsk) -> dict:
    """Every hour's Go / No-Go and the windows, best first: the engine's
    departure_window over the hours gathered here."""
    q = PlanQuery(**{k: getattr(ask, k) for k in ROUTE_FIELDS})
    r = load_route(q.dep, q.dest, q.stops)
    now = planning_module.now()
    reach = forecast.taf_reach([tuple(p) for p in (r.start, r.end)])
    hours = _hours(ask, now, reach)
    plans = Plans(q, r, now, ask.airplane)
    # The first plan before the rest ask for it, so they share it.
    if hours:
        plans.for_hour(hours[0])
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        gathered = list(pool.map(lambda h: _hour(ask, q, r, plans, h, now, reach), hours))
    risk = next((risk_in for _, risk_in in gathered if risk_in), None)
    answer = engine(
        "departure_window",
        start=list(r.start),
        end=list(r.end),
        airplane=ask.airplane,
        minimums={"ceiling_ft": ask.minimums.ceiling_ft, "visibility_sm": ask.minimums.visibility_sm},
        risk=risk,
        hours=[h for h, _ in gathered],
    )

    def at(s: float) -> datetime:
        return datetime.fromtimestamp(s, timezone.utc)

    return {
        "hours": [{**{k: v for k, v in h.items() if k != "depart_s"}, "depart": at(h["depart_s"])} for h in answer["hours"]],
        "windows": [
            {
                "start": at(w["from_s"]),
                "last": at(w["last_s"]),
                "hours": w["hours"],
                "margin": w["margin"],
                "ete_min": w["ete_min"],
                "quickest": at(w["quickest_s"]),
            }
            for w in answer["windows"]
        ],
        "airplane": ask.airplane,
        "forecast_until": at(reach) if reach is not None else None,
    }
