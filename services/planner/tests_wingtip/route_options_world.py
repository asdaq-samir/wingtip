"""The world the route options' tests fly in: two fields 240 nm apart on the
equator, the airplane, TAFs as the weather store keeps them, and `sky`, flat
ground with no wind, no airspace and no storm until a test puts one there."""

import time
from collections import defaultdict

import numpy as np
import pandas as pd
import pytest

from wingtip import fixes, fuelstops, geo, route_options, sua, terrain_detour, tfr, water, weather, winds_aloft

# On the equator a degree is about 60 nm either way.
DEP = {"ident": "AAA", "lat": 0.0, "lon": 0.0}
DEST = {"ident": "BBB", "lat": 0.0, "lon": 4.0}  # about 240 nm east
PROFILE = {
    "cruise_tas_kt": 120.0,
    "fuel_burn_gph": 10.0,
    "usable_fuel_gal": 50.0,
    "taxi_fuel_gal": 1.0,
    "service_ceiling_ft": 13000.0,
    "glide": {"best_glide_kias": 68.0, "ratio": 9.0},
}


def fields(*rows) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "ident": ident,
                "faa_ident": ident,
                "name": f"{ident} FIELD",
                "city": "",
                "lat": lat,
                "lon": lon,
                "elevation_ft": 0.0,
                "fuel_types": "100LL",
            }
            for ident, lat, lon in rows
        ],
        columns=["ident", "faa_ident", "name", "city", "lat", "lon", "elevation_ft", "fuel_types"],
    )


NO_FIELDS = fields()


def taf(ident, lat, lon, ceiling=None, visibility=10.0, wx=""):
    now = time.time()
    # A period as the weather store keeps it, read by the engine (awc_tafs_read).
    return {
        "icaoId": ident,
        "lat": lat,
        "lon": lon,
        "elevation_ft": 0,
        "raw": "",
        "fcsts": [
            {
                "timeFrom": now - 3600,
                "timeTo": now + 24 * 3600,
                "change": "",
                "ceiling_ft": int(ceiling) if ceiling else None,
                "ceiling_unknown": False,
                "visibility_sm": visibility,
                "wx": wx,
            }
        ],
    }


@pytest.fixture
def sky(monkeypatch):
    """Flat ground, no wind, no airspace; the TAFs, METARs and SIGMETs
    the test puts in `data` (Alaska's AIRMETs none)."""
    data = {"tafs": [], "metars": {}, "airsigmets": [], "airmets": [], "gairmets": []}
    monkeypatch.setattr(weather, "_dataset", lambda name: data[name])
    monkeypatch.setattr(winds_aloft, "wind_points", lambda box, key, altitudes: [])
    monkeypatch.setattr(terrain_detour, "heights_ft", lambda lats, lons: np.zeros(lats.shape))
    monkeypatch.setattr(sua, "areas_in", lambda bbox: [])
    monkeypatch.setattr(tfr, "all_tfrs", lambda: [])
    # By day, whenever the test runs: the night is the engine's otherwise.
    real = route_options.options
    monkeypatch.setattr(route_options, "options", lambda *a, **k: real(*a, **{"night": False, **k}))
    monkeypatch.setattr(fuelstops, "paved_runways", lambda: defaultdict(lambda: 5000))
    # No fix to turn at unless a test puts one there.
    monkeypatch.setattr(fixes, "within", lambda south, west, north, east: [])
    # Dry land everywhere unless a test floods it.
    monkeypatch.setattr(water, "is_water", lambda lats, lons: np.zeros(np.shape(lats), dtype=bool))
    return data


def nearest_nm(path, lat, lon) -> float:
    """How near a way through `path` comes to a point, nm."""
    best = np.inf
    for a, b in zip(path, path[1:]):
        for t in np.linspace(0, 1, 50):
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            best = min(best, float(geo.distance_nm(p[0], p[1], lat, lon)))
    return best
