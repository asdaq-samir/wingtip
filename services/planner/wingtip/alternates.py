"""The IFR alternate as the planner reads it: each field's instrument
approaches from the FAA's terminal procedures (the d-TPP,
wingtip.publications) and the worst its TAF forecasts over the window
(wingtip.weather) over the window the engine gives, handed to the
engine, whose rules they are -- 14 CFR
91.169(b)'s "1-2-3" for the destination, (c)'s alternate minimums for a
field offered as the alternate (wingtip_brief::alternates:
`ifr_alternate_destination`, `ifr_alternate_check`,
`ifr_alternates_ranked`).
"""

from __future__ import annotations

from dataclasses import dataclass

from . import geo, publications, weather
from .engine import ask as engine

#: Alternates offered within this of the destination.
NEAR_NM = 100.0


@dataclass(frozen=True)
class Approaches:
    """A field's instrument approaches as the d-TPP lists them: their
    charts' names, and its nonstandard alternate minimums' page, where it
    has one. Which of them is a precision approach (91.169(c)(1)(i)(A)) is
    the engine's to say (wingtip_brief::alternates::precision_approach)."""

    names: tuple[str, ...]
    alternate_minimums_url: str | None


def approaches(ident: str) -> Approaches:
    charts = publications.terminal_charts(ident)
    iaps = tuple(c["name"] for c in charts if c["kind"] == "IAP")
    page = next((c["url"] for c in charts if c["kind"] == "MIN" and "ALTERNATE" in c["name"].upper()), None)
    return Approaches(names=iaps, alternate_minimums_url=page)


def _forecast(ident: str, start: float, end: float) -> dict | None:
    """The worst the field's TAF forecasts over [start, end] (wingtip.weather),
    with whether it covers the whole window and the TAF as issued; None
    where the field has no TAF, or none of its periods speaks to the
    window."""
    station = next((s for s in weather._dataset("tafs") if s["icaoId"] == ident.upper()), None)
    if station is None:
        return None
    worst = weather._worst_in_window(station["fcsts"], start, end)
    return None if worst is None else {**worst, "raw": station.get("raw")}


#: What the engine reads of a TAF's worst over the window (taf_window's).
_FORECAST_KEYS = ("ceiling_ft", "ceiling_unknown", "visibility_sm", "covers", "raw")


def _asked(ident: str, procs: Approaches, forecast: dict | None) -> dict:
    """What the engine reads of a field: its approaches and its forecast."""
    return {
        "ident": ident,
        "approaches": {"names": list(procs.names), "alternate_minimums_url": procs.alternate_minimums_url},
        "forecast": None if forecast is None else {k: forecast.get(k) for k in _FORECAST_KEYS},
    }


def _window(ident: str, eta: float, kind: str) -> dict | None:
    """The field's TAF at its worst over the window the engine gives
    (`ifr_alternate_window`: the destination's an hour either side of the
    ETA, 91.169(b)(2)(i); an alternate's the ETA, 91.169(c))."""
    window = engine("ifr_alternate_window", eta=eta, **{"for": kind})
    return _forecast(ident, window["start"], window["end"])


def destination(ident: str, eta: float) -> dict:
    """Whether the destination needs an alternate (91.169(b)), and why: the
    engine's, over the TAF across the engine's window round the ETA."""
    return engine("ifr_alternate_destination", **_asked(ident, approaches(ident), _window(ident, eta, "destination")))


def alternate(ident: str, eta: float) -> dict:
    """Whether a field will do as the alternate at `eta` (91.169(c)):
    `good` True, False, or None where the pilot has to look (nonstandard
    minimums, no approach, no TAF), with why -- the engine's."""
    return engine("ifr_alternate_check", **_asked(ident, approaches(ident), _window(ident, eta, "alternate")))


def nearby(dest: tuple[float, float], dest_ident: str, eta_of, limit: int = 5) -> list[dict]:
    """The fields with a TAF within NEAR_NM of the destination that will do
    as its alternate, or that meet the standard minimums and publish their
    own for the pilot to check -- those that will do first, then nearest
    first (the engine's `ifr_alternates_ranked`): `eta_of(lat, lon)` the
    ETA there. Read nearest first until twice `limit` are kept."""
    stations = [s for s in weather._dataset("tafs") if s["icaoId"] != dest_ident and geo.distance_nm(*dest, s["lat"], s["lon"]) <= NEAR_NM]
    stations.sort(key=lambda s: geo.distance_nm(*dest, s["lat"], s["lon"]))
    kept: list[dict] = []
    for station in stations:
        check = alternate(station["icaoId"], eta_of(station["lat"], station["lon"]))
        check = {**check, "distance_nm": round(geo.distance_nm(*dest, station["lat"], station["lon"]), 1)}
        kept = engine("ifr_alternates_ranked", checks=[*kept, check], limit=limit * 2)
        if len(kept) >= limit * 2:
            break
    return kept[:limit]
