"""The shapes app.routers.studio_history sends: what was so on the day of
a replayed flight, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel, Field


class StudioWeatherAsk(BaseModel):
    """A replayed flight's span (s since 1970, UTC) and points along its
    track, [lat, lon] each, for the weather as it was."""

    start: float
    end: float
    points: list[tuple[float, float]] = Field(max_length=200)


class StudioMetar(BaseModel):
    """A station's METAR, as it sent it (IEM's archive)."""

    station: str
    lat: float
    lon: float
    #: When it was made, ISO 8601 UTC.
    time: str
    raw: str


class StudioTaf(BaseModel):
    """A station's TAF, as the NWS issued it (IEM's archive)."""

    station: str
    #: When it was issued, ISO 8601 UTC.
    issued: str
    raw: str


class StudioRadarFrame(BaseModel):
    """The NEXRAD composite at one five-minute mosaic: its time and its
    XYZ tile template on IEM's tile cache."""

    valid: str
    tiles: str


class StudioWeather(BaseModel):
    """The weather as it was over a replayed flight
    (wingtip.history.weather_then): the METARs of the stations near its
    track from an hour before to an hour after, the TAFs in force over it,
    and the radar's frames, with where they came from."""

    metars: list[StudioMetar]
    tafs: list[StudioTaf]
    radar: list[StudioRadarFrame]
    source: str
    credit: str


class NtsbEvent(BaseModel):
    """One NTSB case of the airplane (wingtip.history.ntsb), its texts
    verbatim: where and when (the local date), its phase of flight and
    highest injury in the NTSB's words, its probable cause once the final
    report is out, and its narrative (the final report's, else the
    preliminary's factual one)."""

    ntsb_no: str
    ev_id: str
    #: YYYY-MM-DD, the local date where it happened.
    date: str
    city: str | None = None
    state: str | None = None
    country: str | None = None
    phase: str | None = None
    highest_injury: str | None = None
    probable_cause: str | None = None
    narrative: str | None = None
    narrative_kind: Literal["final", "preliminary"] | None = None
    #: The case's report on CAROL, or CAROL's search where the file gives
    #: no report key.
    carol_url: str
    docket_url: str | None = None


class StudioNotam(BaseModel):
    """A NOTAM in force then, as sent, at its field's position (None for
    one at no field)."""

    id: str
    text: str
    start: str | None = None
    end: str | None = None
    lat: float | None = None
    lon: float | None = None


class StudioTfr(BaseModel):
    """A TFR in force then: its NOTAM's id, title, times and text, and its
    areas (GeoJSON MultiPolygon, rounded to about 11 m)."""

    id: str
    name: str
    start: str | None = None
    end: str | None = None
    text: str | None = None
    geometry: dict | None = None


class StudioNotams(BaseModel):
    """The NOTAMs and TFRs in force at a moment inside a box, from the day's
    archive kept here (wingtip.history.notam_archive); `archived` False
    where no archive covers that UTC day."""

    archived: bool
    day: str
    notams: list[StudioNotam]
    tfrs: list[StudioTfr]
