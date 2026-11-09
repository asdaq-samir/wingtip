"""The shapes app.routers.weather_map sends and takes, as Pydantic models."""
from typing import Literal

from pydantic import BaseModel


class WeatherArea(BaseModel):
    """An area of weather on the map (wingtip.weather_map.advisories_in): a
    SIGMET, a convective SIGMET or a G-AIRMET snapshot; its hazard, its
    severity where one is given, its altitudes (feet MSL; `low_ft` None
    from the surface, or from the freezing level where
    `from_freezing_level`), when it is valid (a G-AIRMET at `valid_from`,
    a snapshot), its text (a SIGMET's raw report, a G-AIRMET's cause), and
    its outline, [lat, lon] pairs."""

    id: str
    kind: Literal["sigmet", "convective", "airmet", "gairmet"]
    hazard: str | None
    severity: str | None = None
    low_ft: float | None = None
    high_ft: float | None = None
    from_freezing_level: bool = False
    valid_from: float | None = None
    valid_to: float | None = None
    raw: str | None = None
    coords: list[list[float]]


class MapPirep(BaseModel):
    """A pilot report on the map, where it was made (wingtip.weather)."""

    observed_at: str | None = None
    lat: float
    lon: float
    altitude_ft: float | None = None
    aircraft: str | None = None
    urgent: bool = False
    turbulence: str | None = None
    icing: str | None = None
    raw: str | None = None


class StationWind(BaseModel):
    """An FD station's forecast wind (true) and temperature at the map's
    altitude."""

    ident: str
    lat: float
    lon: float
    dir_true_deg: float
    speed_kt: float
    temp_c: float | None = None


class MapWinds(BaseModel):
    altitude_ft: float
    #: The FD product's period: {"valid_at", "use_from", "use_to"}, ISO UTC.
    period: dict | None = None
    stations: list[StationWind]


class WeatherMap(BaseModel):
    """The weather the map draws in the part of it in sight, for `at`
    (UNIX seconds): areas, pilot reports, the winds aloft where an altitude
    was asked for, and when the radar mosaic was made (ISO UTC)."""

    at: float
    advisories: list[WeatherArea] = []
    pireps: list[MapPirep] = []
    winds: MapWinds | None = None
    radar_valid: str | None = None
