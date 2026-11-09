"""POST /api/departure-window: "When should I go?" -- the Go / No-Go for
each departure hour the forecasts reach and the best windows to leave in
(app.window). The route parses the ask, asks app.window.hours and
answers; the rules are the engine's."""
from fastapi import APIRouter

from ..gateway import gateway
from ..window.hours import departure_window as worked_out
from ..window.schemas import DepartureWindow, DepartureWindowAsk

router = APIRouter()

#: Signed in: a day's worth of hours is a briefing and a plan or two for
#: each, the most the planner does for one ask, kept to pilots with an
#: account. A POST that changes nothing, its CSRF token checked as any
#: signed-in page's is.
SIGNED_IN_READ_BY_POST = gateway("signed-in")


@router.post("/api/departure-window", openapi_extra=SIGNED_IN_READ_BY_POST)
def departure_window(ask: DepartureWindowAsk) -> DepartureWindow:
    """Each departure hour from `start` (the next whole hour), for up to
    `hours` hours or until the TAFs along the route end: go, caution, no-go
    or not known by the Brief's own Go / No-Go for a flight leaving then --
    the weather along the route and at the fields (TAFs, G-AIRMETs,
    SIGMETs), the pilot's minimums, the TFRs and special-use areas then,
    the winds aloft's time and fuel, the night (14 CFR 1.1) and 61.57(b)'s
    passenger period, the runways and loading, the risk assessment and,
    under IFR, the alternate (91.169) -- with the one or two findings that
    decide it; and the runs of go hours, the most margin over the minimums
    first, then the shortest ETE. With no airplane (`airplane` false) only
    the weather, the airspace, the altitude and the daylight are judged."""
    return DepartureWindow(**worked_out(ask))
