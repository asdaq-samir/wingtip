"""The shapes app.routers.devml sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel

from ..emergency.schemas import GlideFigures
from .aircraft_figures import DemonstratedCrosswind


class AirportSuggestion(BaseModel):
    """An airport the search answers -- or, asked with `fixes`, a named
    fix (`kind` "fix": a VFR waypoint, a GPS waypoint), its `name` the
    kind of fix and its `region` the state it is in."""

    ident: str
    name: str
    municipality: str | None = None
    region: str | None = None
    kind: Literal["airport", "fix"] = "airport"
    #: Where NASR lists the field as closed (APT_BASE ARPT_STATUS CI or CP),
    #: the engine's label ("Closed indefinitely"): found by a search, after
    #: the open fields, and never offered to land (decision 0043).
    closed: str | None = None
    #: Who may use it where not every pilot (wingtip.field_use, NASR's
    #: FACILITY_USE_CODE and OWNERSHIP_TYPE_CODE): "private", "military" or
    #: "joint"; None for a public field. The row's mark is the engine's
    #: airport_use_words, as on the card.
    use: Literal["private", "military", "joint"] | None = None


class AirportSearch(BaseModel):
    airports: list[AirportSuggestion]


class ModelComparisonEntry(BaseModel):
    """One of the scikit-learn models retrain() compared; `score` is its
    5-fold CV MAE, lower is better."""

    name: str
    score: float | None
    promoted: bool


class ModelComparison(BaseModel):
    models: list[ModelComparisonEntry]
    trained_at: str | None
    n_labeled: int | None


class AircraftProfileSummary(BaseModel):
    """One of data/aircraft/*.json, for the nav log's aircraft picker."""

    name: str
    type: str
    cruise_tas_kt: float
    fuel_burn_gph: float
    service_ceiling_ft: float
    #: Its POH's best glide (Section 3), None where the profile has none:
    #: the apps then draw no glide and judge no field within one, never
    #: another airplane's (the owner, 2026-11-09).
    glide: GlideFigures | None = None
    #: Its POH's fuel for start, taxi and takeoff, gal; None where the
    #: profile has none, and then none is assumed.
    taxi_fuel_gal: float | None = None
    #: Its POH's maximum demonstrated crosswind, None where the profile
    #: has none: the map's wind arrows are then never red, no other
    #: airplane's figure assumed (the owner, 2026-11-09).
    crosswind: DemonstratedCrosswind | None = None


class AircraftProfiles(BaseModel):
    profiles: list[AircraftProfileSummary]
