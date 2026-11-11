"""The route's side view as /api/route-profile answers it (wingtip.profile)."""

from pydantic import BaseModel, ConfigDict, Field


class ProfileGround(BaseModel):
    along_nm: float
    ground_ft: float


class ProfileAirspace(BaseModel):
    """A Class B, C or D the route passes through: where along it, from
    its floor to its ceiling (feet MSL; the ceiling None where the FAA's
    file has none)."""

    name: str
    class_: str = Field(alias="class")
    from_nm: float
    to_nm: float
    floor_ft: float
    ceiling_ft: float | None = None
    # The airport it is drawn round, as a route names it (KDLH); "" where
    # the FAA's file names none that can be placed (wingtip.profile).
    ident: str = ""

    model_config = ConfigDict(populate_by_name=True)


class ProfileObstacle(BaseModel):
    """An obstacle of the FAA's DOF near the route's line: where along it,
    and its top, feet MSL."""

    along_nm: float
    amsl_ft: float


class RouteProfile(BaseModel):
    """The route's side view (wingtip.profile): its length, the ground under
    it, the controlled airspace it passes through and the obstacles near
    its line."""

    length_nm: float
    terrain: list[ProfileGround]
    airspace: list[ProfileAirspace]
    obstacles: list[ProfileObstacle] = []
