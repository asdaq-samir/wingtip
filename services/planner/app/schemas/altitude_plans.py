"""The four altitude plans -- lowest, highest, fastest, economical -- and the
route flown at each altitude for the altitude wheel, as the nav log sends
them (the engine's navlog_plans), as Pydantic models. Apart from
app.schemas.plan, which carries them in its AltitudeBreakdown."""

from pydantic import BaseModel, ConfigDict, Field

from .common import AltitudeChoice


class AltitudeStep(BaseModel):
    """Consecutive legs flown at one altitude."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    altitude_ft: float
    distance_nm: float


class AltitudeOption(BaseModel):
    """One of the four plans -- lowest, highest, fastest, economical --
    as its steps and what it costs. `ete_min` is the flying time with every climb
    flown (`climb_penalty_min` is how many of those minutes are climb),
    the figure the plans are compared on; `tailwind_kt` the
    distance-weighted wind component along the course, positive helping,
    over the legs that had wind data. With no airplane, the lowest and
    highest alone, their times, fuel, climb and wind None; with no climb
    fuel flow in the airplane's profile, no economical plan, as its
    climbs' fuel is not known (the engine's navlog_plans)."""

    kind: AltitudeChoice
    steps: list[AltitudeStep]
    ete_min: float | None
    fuel_gal: float | None
    climb_penalty_min: float | None
    tailwind_kt: float | None
    unflyable_legs: int
    legs_without_wind: int
    # Whether any step is above 12,500 ft, where more than 30 minutes
    # needs supplemental oxygen (14 CFR 91.211). A plan goes there only
    # where a leg has no legal altitude under it, or the profile says
    # the aeroplane carries oxygen or is pressurised.
    needs_oxygen: bool


class AltitudeFigure(BaseModel):
    """The route flown at one altitude, for the altitude wheel (the owner's
    pick, 2026-10-20): each leg at it where it is legal there, else at the
    leg's nearest legal altitude (`everywhere` false then); the times and
    fuel with the climbs, the wind along the legs, positive helping."""

    altitude_ft: float
    ete_min: float | None
    fuel_gal: float | None
    tailwind_kt: float | None
    everywhere: bool
