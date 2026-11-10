"""The Storm Prediction Center's Day 1 categorical convective outlook,
fetched and stored ("spc-outlook") for the planner's forecast dry run
(wingtip.forecast_run): where thunderstorms, and severe ones by risk, are
forecast through the day (SPC, "About the SPC convective outlooks": general
thunderstorms, then the marginal, slight, enhanced, moderate and high
risks). What a risk means for a flight is the engine's (forecast/run).

SPC publishes each outlook as GeoJSON (day1otlk_cat.lyr.geojson), one
feature per category, its outline a MultiPolygon of [lon, lat] points and
its times "VALID" and "EXPIRE" as YYYYMMDDHHMM UTC. Stored as areas
{"label", "valid_from", "valid_to", "coords" [[lat, lon]]}, one per
polygon's outer ring, held to the outlook's own expiry.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from wingtip import weather_store

from . import fetch

URL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson"


def _unix(stamp: str | None) -> float | None:
    """SPC's "202611092000" as s since 1970."""
    if not stamp:
        return None
    return datetime.strptime(stamp, "%Y%m%d%H%M").replace(tzinfo=timezone.utc).timestamp()


def areas_of(outlook: dict) -> list[dict]:
    """The outlook's areas, an outer ring each, [lat, lon] points."""
    out = []
    for feature in outlook.get("features") or []:
        props, geometry = feature.get("properties") or {}, feature.get("geometry") or {}
        polygons = {"Polygon": [geometry.get("coordinates")], "MultiPolygon": geometry.get("coordinates")}.get(geometry.get("type"), [])
        for polygon in polygons or []:
            if not polygon or len(polygon[0]) < 3:
                continue
            out.append(
                {
                    "label": props.get("LABEL"),
                    "valid_from": _unix(props.get("VALID")),
                    "valid_to": _unix(props.get("EXPIRE")),
                    "coords": [[lat, lon] for lon, lat, *_ in polygon[0]],
                }
            )
    return out


def fetch_outlook() -> None:
    """The Day 1 outlook fetched and stored, held to its expiry. Raises
    fetch.FetchFailed where SPC does not answer, ValueError where the body
    is not GeoJSON; the stored copy left in place."""
    resp = fetch.get(URL)
    areas = areas_of(resp.json())
    # An outlook with no area (no thunder forecast anywhere) says nothing
    # of its own times: held a day, the outlook's own span.
    until = max((a["valid_to"] for a in areas if a["valid_to"]), default=time.time() + 86400)
    weather_store.write("spc-outlook", areas, fetched_at=time.time(), until=until)
