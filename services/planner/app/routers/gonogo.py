"""POST /api/go-no-go: the Brief's Go / No-Go for the native app, worked
out here so the phone computes no rule (docs/NATIVE.md). The planner
plans the route and briefs it as /api/navlog and /api/briefing do --
their caches make a second ask after the nav log quick -- and feeds the
findings from them and from what only the pilot knows, as the web app's
FlightBriefingView feeds lib/verdict (app.gonogo)."""

from datetime import timedelta

from fastapi import APIRouter

from ..router_basics import load_route
from ..gonogo.frat import assessment as risk_assessment, self_checks
from ..gonogo.schemas import GoNoGo, GoNoGoAsk
from ..gonogo.verdict import alternate_finding, field_permission, verdict_items, verdict_line, with_alternate
from ..plan_query import PlanQuery
from ..gonogo import flight
from ..gateway import PUBLIC_READ_BY_POST

router = APIRouter()


@router.post("/api/go-no-go", openapi_extra=PUBLIC_READ_BY_POST)
def go_no_go(ask: GoNoGoAsk) -> GoNoGo:
    """The Go / No-Go for a route: each finding -- the weather, the TFRs and
    special-use airspace, the altitude, the fuel, the runways, the weight
    and balance and the risk -- with where it is said in full, and the
    line over them; the risk assessment and the weight and balance it
    counted, for the Brief's own pages. The rules are apps/web/src/lib/verdict's
    and the modules it is fed from, the engine's in app.gonogo; the pilot's
    minimums, loading, ticks, currency and own airplane's records come in
    the ask."""
    q = PlanQuery(**{k: getattr(ask, k) for k in flight.ROUTE_FIELDS})
    r = load_route(q.dep, q.dest, q.stops)
    planned = flight.plan_for(q, r)
    nav, totals = planned.nav, planned.totals
    briefing, failed = flight.briefing_or_failure(q, (totals or {}).get("ete_min"))
    depart = flight.departure_of(q)
    found = flight.findings_for(ask, q, r, planned, briefing, failed, depart)
    assessment = risk_assessment(found.risk_in) if found.risk_in else None
    items = verdict_items({**found.verdict, "risk": {"level": assessment["level"], "line": assessment["line"]} if assessment else None})
    # Under IFR, the alternate (14 CFR 91.169), its ETA the nav log's.
    # The way on is flown at the airplane's own cruise; with none (no
    # airplane, so no ETA either) there is no alternate to time.
    tas = ((nav or {}).get("aircraft") or {}).get("cruise_tas_kt")
    if q.rules == "ifr" and totals and totals.get("ete_min") is not None and tas:
        eta = depart + timedelta(minutes=totals["ete_min"])
        items = with_alternate(items, alternate_finding(flight.alternate_for(r.idents[-1], eta, tas, q.alternate)))
    # A private or military-only field on the route, a row of its own.
    if permission := field_permission(r.idents):
        items = [*items, permission]

    return GoNoGo(
        line=verdict_line(items),
        items=items,
        risk=assessment,
        self_checks=self_checks(),
        loading=found.loading,
        balance={**found.loaded, "load": found.load} if found.loaded else None,
    )
