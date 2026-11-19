"""A route to an ident no US field goes by is a 404 naming it, before any
planning: KORD-KIGN was planned 7,191 nm to Indagen, Papua New Guinea, and
its nav log failed as "the chart along KORD->KIGN could not be read"
(2026-11-17). A real field abroad is said to be outside the US charts.
OurAirports' table is a small one of the test's own, with Indagen's row as
the real table has it."""

from functools import partial

import pandas as pd
import pytest
from wingtip import airport_lookup, airports

from app.main import app

from .conftest import AirplaneClient, airport
from .stops_world import _stubbed_world  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)

INDAGEN = {
    "ident": "AYID",
    "local_code": "IGN",
    "name": "Indagen Airport",
    "latitude_deg": -6.22663,
    "longitude_deg": 147.244,
    "elevation_ft": 5788,
    "municipality": "Indagen",
    "iso_country": "PG",
    "iso_region": "PG-MPL",
}


@pytest.fixture(autouse=True)
def indagen_in_the_table(monkeypatch, tmp_path):
    """The stub's US fields as conftest's airport() has them; any other
    ident looked up in a table that holds Indagen, as the real one does."""
    path = tmp_path / "airports.csv"
    pd.DataFrame([INDAGEN]).to_csv(path, index=False)
    real = partial(airport_lookup.get_airport, cache_path=path)
    known = {"C81", "KDLH", "KMSN", "KOSH"}
    monkeypatch.setattr(airports, "get_airport", lambda ident, **kw: airport(ident.upper()) if ident.upper() in known else real(ident))


@pytest.mark.parametrize("path", ["/api/course", "/api/navlog", "/api/checkpoints"])
def test_kign_is_no_airport_not_indagen(path):
    resp = client.get(path, params={"dep": "C81", "dest": "KIGN"})
    assert resp.status_code == 404
    assert resp.json()["detail"] == "No airport goes by 'KIGN'."


def test_a_field_abroad_is_outside_the_us_charts():
    resp = client.get("/api/course", params={"dep": "C81", "dest": "IGN"})
    assert resp.status_code == 404
    assert resp.json()["detail"] == "'IGN' is outside the US charts: Indagen Airport, PG."
