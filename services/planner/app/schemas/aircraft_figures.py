"""An airplane's POH figures as a profile carries them (data/aircraft):
its short-field takeoff and landing tables, with the handbook's own notes
for the wind, and its demonstrated crosswind. Each is that airplane's
own; a profile without one has none, never another airplane's (the
owner, 2026-11-09)."""

from pydantic import BaseModel


class DistanceTable(BaseModel):
    """One weight's distances, by pressure altitude (rows) and
    temperature (columns)."""

    ground_roll_ft: list[list[float]]
    total_50ft_ft: list[list[float]]


class ShortField(BaseModel):
    """A POH's short-field takeoff or landing distances: a table per
    weight, and how much a dry grass runway adds to the ground roll."""

    source: str
    pressure_altitudes_ft: list[float]
    temperatures_c: list[float]
    weights_lb: list[float]
    tables: list[DistanceTable]
    grass_ground_roll_pct: float
    #: The POH's own notes to the chart for the wind: the knots of headwind
    #: that take 10% off the distances, of tailwind that add 10%, and the
    #: strongest tailwind it gives figures for. None where the profile has
    #: no notes: no correction, never another airplane's.
    headwind_kt_per_10pct: float | None = None
    tailwind_kt_per_10pct: float | None = None
    tailwind_max_kt: float | None = None
    wind_source: str | None = None


class DemonstratedCrosswind(BaseModel):
    """The strongest crosswind the POH says the aeroplane was shown to
    take off and land in: not a limitation, but past it the pilot is
    beyond what was tested."""

    demonstrated_kt: float
    source: str
