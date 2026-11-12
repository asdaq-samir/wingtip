"""The Studio's weather as it was (wingtip.history.iem, weather_then): IEM's
METAR CSV and TAF bulletins read as sent, a past day asked once and kept,
today's and a refusal not kept, the stations near a track, the TAFs in
force over a span and the radar's frames. IEM's answers are recorded
(fixtures/history, KORD and KMDW on 2026-11-10)."""

import datetime as dt
from pathlib import Path

import pytest
import requests

from wingtip import weather_store
from wingtip.history import iem, weather_then

FIXTURES = Path(__file__).parent / "fixtures" / "history"
ASOS = (FIXTURES / "iem_asos_2026-11-10.csv").read_text()
TAF = (FIXTURES / "iem_taf_2026-11-10.txt").read_text()
DAY = dt.date(2026, 11, 10)
TODAY = dt.date(2026, 11, 12)


def _epoch(iso: str) -> float:
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


class _Answer:
    def __init__(self, status: int, text: str = ""):
        self.status_code = status
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


@pytest.fixture(autouse=True)
def _store_of_its_own(tmp_path, monkeypatch):
    iem.reset()
    monkeypatch.setattr(iem, "_store_path", lambda: tmp_path / "studio_weather.sqlite")
    yield
    iem.reset()


def test_metars_are_read_as_sent_under_the_icao_name_asked():
    found = iem.read_metars(ASOS, ["KORD", "KMDW", "KDPA"])
    assert found["KDPA"] == []
    first = found["KORD"][0]
    assert first == {
        "station": "KORD",
        "lat": 41.9602,
        "lon": -87.9316,
        "time": "2026-11-10T00:51:00Z",
        "raw": "KORD 100051Z 19006KT 10SM SCT250 11/04 A3003 RMK AO2 SLP171 T01060044 $",
    }
    assert all(m["raw"].startswith("KMDW ") for m in found["KMDW"])


def test_tafs_are_cut_from_their_bulletins_as_sent_with_their_time_of_issue():
    found = iem.read_tafs(TAF, ["KORD", "KMDW"], DAY)
    ord_tafs = found["KORD"]
    assert [t["issued"] for t in ord_tafs][:2] == ["2026-11-10T02:56:00Z", "2026-11-10T05:20:00Z"]
    # The amendment's TAF line kept, newlines and indents as the NWS sent them.
    assert ord_tafs[0]["raw"].startswith("TAF AMD\nKORD 100256Z 1003/1106 21008KT P6SM SKC\n     FM100800")
    assert ord_tafs[0]["raw"].endswith("SCT300=")
    assert all(t["raw"].count("=") == 1 for t in ord_tafs + found["KMDW"])


def test_a_past_day_is_asked_once_and_then_read_from_the_store(monkeypatch):
    asked = []

    def get(url, params, headers, timeout):
        asked.append(dict(params)["data"] if url == iem.METAR_URL else "taf")
        return _Answer(200, ASOS)

    monkeypatch.setattr(iem.requests, "get", get)
    first = iem.day_reports("metar", ["KORD", "KMDW"], DAY, today=TODAY)
    again = iem.day_reports("metar", ["KORD", "KMDW"], DAY, today=TODAY)
    assert asked == ["metar"]
    assert first == again and len(first["KORD"]) == 4
    # A station not asked before is asked alone.
    iem.day_reports("metar", ["KORD", "KDPA"], DAY, today=TODAY)
    assert len(asked) == 2


def test_today_is_asked_each_time_and_a_refusal_is_not_kept(monkeypatch):
    answers = [_Answer(200, ASOS), _Answer(200, ASOS), _Answer(503)]
    monkeypatch.setattr(iem.requests, "get", lambda *a, **k: answers.pop(0))
    iem.day_reports("metar", ["KORD"], DAY, today=DAY)
    iem.day_reports("metar", ["KORD"], DAY, today=DAY)
    # Both asks of today went to IEM.
    assert len(answers) == 1
    with pytest.raises(iem.WeatherHistoryUnavailable):
        iem.day_reports("metar", ["KORD"], DAY - dt.timedelta(days=1), today=DAY)
    # The refusal kept nothing: the day is asked again.
    monkeypatch.setattr(iem.requests, "get", lambda *a, **k: _Answer(200, "station,valid,lon,lat,metar\n"))
    assert iem.day_reports("metar", ["KORD"], DAY - dt.timedelta(days=1), today=DAY) == {"KORD": []}


def test_a_day_to_come_asks_nothing(monkeypatch):
    monkeypatch.setattr(iem.requests, "get", lambda *a, **k: pytest.fail("asked IEM"))
    assert iem.day_reports("taf", ["KORD"], TODAY + dt.timedelta(days=1), today=TODAY) == {"KORD": []}


def test_the_tafs_in_force_are_the_one_issued_before_the_span_and_those_during_it(monkeypatch):
    def reports(kind, stations, day):
        return iem.read_tafs(TAF, stations, day) if day == DAY else {s: [] for s in stations}

    monkeypatch.setattr(iem, "day_reports", reports)
    start, end = _epoch("2026-11-10T04:00:00Z"), _epoch("2026-11-10T06:00:00Z")
    issued = [(t["station"], t["issued"]) for t in weather_then.tafs(["KORD"], start, end)]
    # 02:56 was in force at 04:00, 05:20 replaced it; 08:42 came after.
    assert issued == [("KORD", "2026-11-10T02:56:00Z"), ("KORD", "2026-11-10T05:20:00Z")]


def test_the_metars_run_from_an_hour_before_to_an_hour_after(monkeypatch):
    monkeypatch.setattr(iem, "day_reports", lambda kind, stations, day: iem.read_metars(ASOS, stations))
    start, end = _epoch("2026-11-10T02:00:00Z"), _epoch("2026-11-10T02:30:00Z")
    times = [m["time"] for m in weather_then.metars(["KORD"], start, end)]
    # 00:51 is more than an hour before, 03:51 more than an hour after.
    assert times == ["2026-11-10T01:51:00Z", "2026-11-10T02:51:00Z"]


def test_radar_frames_every_five_minutes_from_the_start_floored():
    start = _epoch("2026-11-10T14:03:20Z")
    frames = weather_then.radar_frames(start, start + 1800)
    assert frames[0]["valid"] == "2026-11-10T14:00:00Z"
    assert frames[1]["valid"] == "2026-11-10T14:05:00Z"
    assert frames[-1]["valid"] == "2026-11-10T14:30:00Z"
    assert "ridge::USCOMP-N0Q-202611101400/{z}/{x}/{y}.png" in frames[0]["tiles"]


def test_a_long_span_is_thinned_evenly_to_the_most_frames():
    start = _epoch("2026-11-10T00:00:00Z")
    frames = weather_then.radar_frames(start, start + 2 * 86400)
    assert len(frames) == weather_then.MOST_FRAMES
    assert frames[0]["valid"] == "2026-11-10T00:00:00Z" and frames[-1]["valid"] == "2026-11-12T00:00:00Z"


def test_the_stations_near_the_track_nearest_first(monkeypatch):
    metars = {
        "KORD": {"lat": 41.96, "lon": -87.93},
        "KMDW": {"lat": 41.79, "lon": -87.75},
        "KDPA": {"lat": 41.91, "lon": -88.25},
        # 80 nm away: not near.
        "KMKE": {"lat": 42.95, "lon": -87.90},
    }
    weather_store.write("metars", metars, fetched_at=0.0, until=None)
    # A departure from KORD to the west.
    track = [(41.97, -87.95), (41.97, -88.10), (41.97, -88.30)]
    assert weather_then.stations_near(track) == ["KORD", "KDPA", "KMDW"]
