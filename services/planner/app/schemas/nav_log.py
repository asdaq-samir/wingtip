"""The messages the nav log streams (app.routers.plan), one JSON line each."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .altitude_breakdown import AltitudeBreakdown, AltitudeCaution
from .altitude_plans import AltitudeFigure, AltitudeOption
from .common import AltitudeChoice
from .plan import AircraftProfile, Detour, Totals
from .plan_legs import Leg


class NavLogStage(BaseModel):
    type: Literal["stage"] = "stage"
    detail: str


class NavLogError(BaseModel):
    """The stream's failure. `retry` False where asking again gets the
    same answer -- a route with no legal altitude -- so the page offers
    no Try again for it. For that one `detail` is the headline, and
    `reasons` and `advice` say why and what to do: the page lists them in
    the nav log (wingtip.planning.no_altitude)."""

    type: Literal["error"] = "error"
    detail: str
    retry: bool = True
    #: The whole of it in a few words, for the one line under the route:
    #: "Aircraft ceiling restricts mountainous flying".
    brief: str | None = None
    reasons: list[str] = []
    advice: str | None = None
    #: Class B airspace is what leaves no altitude: the page offers to
    #: plan it with a clearance (`class_b_clearance`), or to fly via a
    #: waypoint, `detours` the ones that keep the route out of it, best
    #: first.
    class_b: bool = False
    detours: list[Detour] = []


class NavLogAltitude(BaseModel):
    """Which altitudes the legs that follow fly. `flown` is the planner's
    plan of that name, or "custom" for a pilot's own altitude; None when
    the winds the legs need could not be read, so no leg follows -- the
    stream's next line is the error. `altitude_ft` is the first leg's (a
    plan may step), and None exactly when `flown` is. `options` are the
    four plans, offered beside a pilot's own as well; empty only when the
    winds failed before they could be made.

    It used to say all of that with `choice: null` and an empty `options`,
    which a winds outage produced too: the page showed "0 ft · yours",
    with Custom pressed, for an altitude nobody typed."""

    type: Literal["altitude"] = "altitude"
    flown: AltitudeChoice | Literal["custom"] | None
    altitude_ft: float | None
    altitude_selection: AltitudeBreakdown
    options: list[AltitudeOption] = []
    #: None with no airplane picked (aircraft=none).
    aircraft: AircraftProfile | None
    #: The altitudes the pilot set that the planner would not have flown,
    #: and why (AltitudeCaution); none for the planner's own plans.
    cautions: list[AltitudeCaution] = []
    #: With the Class B clearance, the waypoints that keep the route out
    #: of the Class B it enters (Detour, best first): "Avoid Class B".
    class_b_detours: list["Detour"] = []
    #: The route flown at each altitude any leg may fly (AltitudeFigure),
    #: lowest first: the altitude wheel's figures.
    altitude_figures: list[AltitudeFigure] = []


class NavLogLeg(Leg):
    type: Literal["leg"] = "leg"


class NavLogDone(BaseModel):
    type: Literal["done"] = "done"
    totals: Totals


NavLogMessage = Annotated[NavLogStage | NavLogError | NavLogAltitude | NavLogLeg | NavLogDone, Field(discriminator="type")]
