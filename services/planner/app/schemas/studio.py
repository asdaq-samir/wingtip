"""The shapes app.routers.studio sends, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel, Field


class StudioReport(BaseModel):
    """One report of the day: when (s since 1970), where, its altitude
    (ft; the transponder's pressure altitude for adsb.lol's day, see
    `altitude`; None on the ground), ground speed (kt), track (degrees
    true) and whether it was on the ground."""

    t: float
    lat: float
    lon: float
    alt_ft: float | None = None
    gs_kt: float | None = None
    track_deg: float | None = None
    ground: bool = False


class StudioTrack(BaseModel):
    """An airplane's reports on a UTC day, for the Studio's replay
    (wingtip.traffic.day_tracks), with where they came from, which the
    Studio shows (ODbL 1.0 asks for it)."""

    hex: str
    registration: str | None = None
    type: str | None = None
    day: str
    points: list[StudioReport]
    #: "pressure": the transponder's own (adsb.lol); "reported": as heard
    #: here, GNSS or set on the nearest altimeter.
    altitude: Literal["pressure", "reported"]
    source: str
    license: str


class StudioWatched(BaseModel):
    """An airplane followed here (its card opened), whose reports are
    recorded (wingtip.traffic.recorded): one the Studio can replay without
    asking adsb.lol."""

    hex: str
    registration: str | None = None
    #: The UTC days it has reports on, newest first.
    days: list[str]


class StudioGroundAsk(BaseModel):
    """Points along a replayed track, [lat, lon] each, for the ground
    under them: the Studio's profile strip."""

    points: list[tuple[float, float]] = Field(max_length=400)


class StudioGround(BaseModel):
    """The ground's height under each point asked, ft MSL, in order: the
    elevation tiles (USGS 3DEP and SRTM, wingtip.elevation)."""

    ground_ft: list[float]
