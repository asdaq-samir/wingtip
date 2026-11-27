"""Alaska's AIRMETs fetched from aviationweather.gov's data API
(/api/data/airmet, GeoJSON) and stored as "airmets", beside the SIGMETs,
and read back as the planner reads them (wingtip.weather.advisories).
The answer is the API's own of 2026-11-21 21:14Z, cut to one zone of each
hazard, which the engine's test reads too
(engine/crates/weather/src/forecast/awc/airmets.rs)."""

from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from wingtip import weather, weather_store
from wingtip.weather import hazards_along_route

from app import aviationweather, main
from app.settings import get_settings

SAMPLE = Path(__file__).resolve().parents[3] / "engine/crates/weather/src/forecast/awc/samples/airmet.geojson"
NOW = datetime(2026, 11, 22, 0, 0, tzinfo=timezone.utc).timestamp()
ENDS = datetime(2026, 11, 22, 9, 0, tzinfo=timezone.utc).timestamp()
# Anchorage (PANC) to Talkeetna (PATK), up the Susitna Valley.
PANC, PATK = (61.1743, -149.9982), (62.3205, -150.0937)


def _answer(etag: str = 'W/"6cf8-e11"') -> Mock:
    """What requests.get returns for the API: GeoJSON, not gzipped."""
    resp = Mock(status_code=200, headers={"ETag": etag, "Cache-Control": "max-age=180"})
    resp.raise_for_status = Mock()
    resp.content = SAMPLE.read_bytes()
    return resp


def _serve(answer: Mock) -> list:
    """The API asked once at NOW, and the URL it was asked at."""
    asked = []

    def get(url, params=None, headers=None, timeout=None):
        asked.append(url)
        return answer

    with patch("app.fetch.outside.get", side_effect=get), patch("app.aviationweather.time.time", return_value=NOW):
        aviationweather.fetch_source("airmets")
    return asked


def test_the_api_is_asked_for_alaskas_airmets_as_geojson():
    assert _serve(_answer()) == ["https://aviationweather.gov/api/data/airmet?format=geojson"]
    held = weather_store.read("airmets")
    assert [a["hazard"] for a in held.data] == ["SFC WND", "TURB", "ICE", "IFR", "MTN OBSCN", "LLWS"]
    assert {a["type"] for a in held.data} == {"AIRMET"}
    # Held to the latest valid-until of them, 0900Z.
    assert held.until == ENDS


def test_the_airmets_are_read_beside_the_sigmets():
    weather_store.write("airsigmets", [], fetched_at=NOW, until=None)
    _serve(_answer())
    with patch("wingtip.weather_store.time.time", return_value=NOW):
        assert len(weather.advisories()) == 6
    # Past their valid time the AIRMETs are left out, the SIGMETs still read.
    with patch("wingtip.weather_store.time.time", return_value=ENDS + 60):
        assert weather.advisories() == []


def test_a_route_up_the_susitna_valley_is_told_its_airmets():
    weather_store.write("airsigmets", [], fetched_at=NOW, until=None)
    _serve(_answer())
    with patch("wingtip.weather.time.time", return_value=NOW), patch("wingtip.weather_store.time.time", return_value=NOW):
        hazards = hazards_along_route(PANC, PATK)
    assert sorted((h["type"], h["hazard"]) for h in hazards) == [("AIRMET", "IFR"), ("AIRMET", "MTN OBSCN")]
    assert {h["raw"] for h in hazards} == {"AIRMET IFR Cook Inlet and Susitna Valley", "AIRMET MTN OBSCN Cook Inlet and Susitna Valley"}


def test_an_unchanged_answer_is_not_read_again(monkeypatch):
    _serve(_answer())
    first = weather_store.read("airmets")
    url, _, held_until = aviationweather.SOURCES["airmets"]

    def read_again(body):
        raise AssertionError("read again")

    monkeypatch.setitem(aviationweather.SOURCES, "airmets", (url, read_again, held_until))
    _serve(_answer())
    assert weather_store.read("airmets").data == first.data
    assert weather_store.validators("airmets") == {"If-None-Match": 'W/"6cf8-e11"'}


def test_the_airmets_are_asked_at_the_apis_own_three_minutes():
    product = next(p for p in main.PRODUCTS if p.name == "airmets")
    assert product.every_s(True) == get_settings().airmets_every_s == 180.0
    assert product.every_s(False) == get_settings().airmets_idle_every_s
