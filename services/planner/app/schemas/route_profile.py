"""The route's side view as /api/route-profile answers it (wingtip.profile)."""

from typing import Literal

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
    its top, feet MSL, and its height above the ground there, feet AGL
    (the DOF's AMSL and AGL columns)."""

    along_nm: float
    amsl_ft: float
    agl_ft: float | None = None


class RouteProfile(BaseModel):
    """The route's side view (wingtip.profile): its length, the ground under
    it, the controlled airspace it passes through and the obstacles near
    its line."""

    length_nm: float
    terrain: list[ProfileGround]
    airspace: list[ProfileAirspace]
    obstacles: list[ProfileObstacle] = []


class ProfileCloud(BaseModel):
    """A TAF station's forecast cloud base on the side view
    (wingtip.profile_weather): where along the route, its base MSL (the
    ceiling over the flight above the field, plus its elevation), and when
    its TAF was issued."""

    station: str
    along_nm: float
    base_ft: float
    issued: str | None = None


class ProfileFreezing(BaseModel):
    """The freezing level over a point of the route, ft MSL; at or below
    it where the forecast is freezing at its lowest level already."""

    along_nm: float
    ft: float
    at_or_below: bool = False


class ProfileWeatherSource(BaseModel):
    """Whose forecast a figure is and for when: its name, its run, ISO
    UTC, and the time it is read at."""

    label: str
    run: str | None = None
    valid_at: str | None = None


class ProfileIcing(BaseModel):
    """A G-AIRMET icing area the route crosses: from where to where along
    it, between which altitudes (ft MSL; the floor the freezing level
    where `from_freezing_level`), and when it is valid and was issued."""

    from_nm: float
    to_nm: float
    low_ft: float | None = None
    high_ft: float | None = None
    from_freezing_level: bool = False
    severity: str | None = None
    valid_at: str | None = None
    issued: str | None = None


class RouteWeather(BaseModel):
    """The weather on the route's side view (wingtip.profile_weather),
    along the same hops as RouteProfile's ground: the cloud bases, the
    freezing level and its source, the icing, and which of the three
    could not be read (`unavailable`: "clouds", "freezing", "icing"),
    unknown rather than none."""

    clouds: list[ProfileCloud]
    freezing: list[ProfileFreezing]
    freezing_source: ProfileWeatherSource | None = None
    icing: list[ProfileIcing]
    unavailable: list[Literal["clouds", "freezing", "icing"]] = []
    #: The departure the forecasts are read for, ISO UTC.
    for_time: str
