"""POST /api/forecast/run: the dry run against the forecast
(wingtip.forecast_run, tested in tests_wingtip/test_forecast_run.py), from
the shared fixture apps/web/src/lib/fixtures/forecastRun.json."""

import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from wingtip import weather, weather_store, winds_stations

from app.main import app

FIXTURE = json.loads((Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/forecastRun.json").read_text())
client = TestClient(app)


def test_an_ifr_run_is_held_to_the_pilots_minimums_and_the_advisories(monkeypatch):
    given, later = FIXTURE["input"], time.time() + 86400
    for name, data in (("tafs", given["tafs"]), ("airsigmets", given["sigmets"]), ("gairmets", []), ("spc-outlook", given["outlooks"])):
        weather_store.write(name, data, fetched_at=time.time(), until=later)

    def no_winds(hr):
        raise weather.WeatherServiceError("Winds aloft (GFS model) unavailable from NOAA just now")

    monkeypatch.setattr(winds_stations, "fd_stations", no_winds)
    track = [{k: p[k] for k in ("t", "lat", "lon", "alt_ft", "row")} for p in given["track"]]
    resp = client.post("/api/forecast/run", json={"track": track, "fields": given["fields"], "rules": "IFR", "minimums": given["minimums"]})
    assert resp.status_code == 200
    got = resp.json()
    # Under IFR 91.155 is not held to; the pilot's own minimums still are.
    assert {a["kind"] for a in got["alerts"]} == {"pilot_minimums", "sigmet", "outlook"}
    assert len(got["samples"]) == 3


def test_a_run_with_no_points_is_refused():
    assert client.post("/api/forecast/run", json={"track": []}).status_code == 422
