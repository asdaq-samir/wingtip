"""The shapes app.routers.classb sends and takes, as Pydantic models."""

from pydantic import BaseModel


class ClassBAirport(BaseModel):
    """One Class B airport: where it is, and what the weather is doing
    there.

    Every weather field is optional and often absent. A field with no
    current report has no flight category; a field with no TAF issued
    has no forecast. Absent is the honest answer -- a pilot must not
    read "no data" as "nothing to worry about", so the UI shows the gap
    rather than a default.
    """

    ident: str
    name: str
    lat: float
    lon: float
    #: The lowest shelf floor, in feet MSL. Below it a pilot is
    #: underneath the airspace rather than in it, which is what decides
    #: whether a clearance is needed to pass.
    floor_ft_msl: float | None = None
    #: How many altitude tiers the airspace is drawn as.
    shelves: int

    #: The METAR's own category (VFR, MVFR, IFR, LIFR), not this
    #: project's arithmetic.
    flight_category: str | None = None
    metar: str | None = None
    ceiling_ft: float | None = None
    visibility_sm: float | None = None
    wind_dir_true_deg: float | None = None
    wind_speed_kt: float | None = None

    taf: str | None = None
    taf_ceiling_ft: float | None = None
    taf_visibility_sm: float | None = None


class ClassBResponse(BaseModel):
    """Every Class B airport in one answer -- see the router for why it
    is one call rather than one per marker."""

    airports: list[ClassBAirport]
