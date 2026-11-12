"""The dry run played against the forecast (wingtip.forecast_run): the
products gathered from the weather store for the run's points and the
engine asked, from the shared fixture apps/web/src/lib/fixtures/
forecastRun.json (engine/facade/tests/contract.rs asks it too)."""

import json
import time
from pathlib import Path

from wingtip import forecast_run, weather, weather_store, winds_stations

FIXTURE = json.loads((Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/forecastRun.json").read_text())
LATER = time.time() + 86400


def _store_products(outlook: bool = True) -> None:
    given = FIXTURE["input"]
    weather_store.write("tafs", given["tafs"], fetched_at=time.time(), until=LATER)
    weather_store.write("airsigmets", given["sigmets"], fetched_at=time.time(), until=LATER)
    weather_store.write("gairmets", [], fetched_at=time.time(), until=LATER)
    if outlook:
        weather_store.write("spc-outlook", given["outlooks"], fetched_at=time.time(), until=LATER)


def _no_winds(monkeypatch):
    def none(hr):
        raise weather.WeatherServiceError("Winds aloft (GFS model) unavailable from NOAA just now")

    monkeypatch.setattr(winds_stations, "fd_stations", none)


def _track() -> list[dict]:
    return [{k: p[k] for k in ("t", "lat", "lon", "alt_ft", "row")} for p in FIXTURE["input"]["track"]]


def test_the_run_meets_the_forecast_for_its_times(monkeypatch):
    _store_products()
    _no_winds(monkeypatch)
    given = FIXTURE["input"]
    played = forecast_run.play(_track(), given["fields"], "VFR", given["minimums"])
    assert [[leg["row"], leg["category"]] for leg in played["legs"]] == FIXTURE["expect"]["legs"]
    assert [a["kind"] for a in played["alerts"]] == FIXTURE["expect"]["alert_kinds"]
    # Each alert cites its rule or product.
    assert all(a["source"] for a in played["alerts"])
    # No wind is said where none can be had: never calm.
    assert played["samples"][0]["wind_speed_kt"] is None
    assert "winds" in played["unavailable"] and "glmp-forecast" in played["unavailable"]


def test_a_product_missing_leaves_the_rest_read(monkeypatch):
    _store_products(outlook=False)
    _no_winds(monkeypatch)
    weather_store.write("spc-outlook", [], fetched_at=0, until=1)
    given = FIXTURE["input"]
    played = forecast_run.play(_track(), given["fields"], "VFR", None)
    assert "spc-outlook" in played["unavailable"]
    assert [a["kind"] for a in played["alerts"]] == ["vfr_minimums", "sigmet", "vfr_minimums", "vfr_minimums"]
