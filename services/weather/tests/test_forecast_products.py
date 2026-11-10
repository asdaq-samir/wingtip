"""The products the forecast dry run reads: the Gridded LAMP's forecast
hours (app.glmp_forecast), from the GLMP fixtures (tests/glmp, valid
2026-10-10 21:00Z), and the SPC's Day 1 outlook (app.spc)."""

from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app import glmp_forecast, spc

FIXTURES = Path(__file__).parent / "glmp"


def _grib(name: str) -> bytes:
    return (FIXTURES / f"{name}.grib2").read_bytes()


def test_a_file_of_messages_is_read_one_at_a_time():
    body = _grib("cig_1500ft") + _grib("vis_10sm")
    assert glmp_forecast.messages(body) == [0, len(_grib("cig_1500ft"))]
    assert glmp_forecast.messages(b"not grib") == []


def test_forecast_hours_after_the_issue_are_kept_as_float16():
    body = _grib("cig_1500ft")
    hours = glmp_forecast.hours_of(body, datetime(2026, 10, 10, 20, 30, tzinfo=timezone.utc))
    assert list(hours) == ["2026-10-10T21:00:00Z"]
    grid, values = hours["2026-10-10T21:00:00Z"]
    assert values.dtype == np.float16
    assert abs(float(values[0, 0]) - 457.2) < 1.0
    # An hour not after the issue (the analysis hour) or past the hours
    # kept is left out.
    assert glmp_forecast.hours_of(body, datetime(2026, 10, 10, 21, 30, tzinfo=timezone.utc)) == {}
    assert glmp_forecast.hours_of(body, datetime(2026, 10, 10, 6, 0, tzinfo=timezone.utc)) == {}


def test_the_outlooks_areas_as_lat_lon_rings():
    outlook = {
        "features": [
            {
                "properties": {"LABEL": "SLGT", "VALID": "202611092000", "EXPIRE": "202611101200"},
                "geometry": {"type": "MultiPolygon", "coordinates": [[[[-95.0, 28.0], [-96.0, 28.0], [-96.0, 29.0], [-95.0, 28.0]]]]},
            },
            {"properties": {"LABEL": "TSTM"}, "geometry": {"type": "Polygon", "coordinates": [[[-90.0, 40.0], [-91.0, 40.0]]]}},
        ]
    }
    areas = spc.areas_of(outlook)
    assert areas == [
        {
            "label": "SLGT",
            "valid_from": datetime(2026, 11, 9, 20, tzinfo=timezone.utc).timestamp(),
            "valid_to": datetime(2026, 11, 10, 12, tzinfo=timezone.utc).timestamp(),
            "coords": [[28.0, -95.0], [28.0, -96.0], [29.0, -96.0], [28.0, -95.0]],
        }
    ]
