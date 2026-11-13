"""The Studio's day of an airplane (wingtip.traffic.day_tracks): adsb.lol's
history read once and kept, the day's reports with their pressure
altitude, and a name the registry does not know refused."""

import datetime as dt

import pytest
import requests

from wingtip.traffic import TrafficUnavailable, day_tracks

#: The module's own, before each test stands one in.
_RESOLVE = day_tracks.resolve
DAY = dt.date(2026, 11, 10)
MIDNIGHT = dt.datetime(2026, 11, 10, tzinfo=dt.timezone.utc).timestamp()
TRACE = {
    "icao": "a0b7d8",
    "r": "N14511",
    "t": "A21N",
    "timestamp": MIDNIGHT,
    "trace": [
        [3600.0, 29.97, -95.35, "ground", 12.0, 152.0, 0, None, None, "adsb_icao", None],
        [3700.0, 29.98, -95.36, 1200, 161.9, 152.0, 0, 1500, None, "adsb_icao", 1275],
        [3720.0, 29.99, -95.37, 1700, 170.0, 150.0, 0, 1500, {"nav_qnh": 1022.4}, "adsb_icao", 1775],
        # The next UTC day's, which is not this day's.
        [86400.0 + 10, 30.5, -95.0, 5000, 200.0, 150.0, 0, 0, None, "adsb_icao", 5100],
    ],
}


class _Answer:
    def __init__(self, status: int, body=None):
        self.status_code = status
        self._body = body
        self.headers = {"content-type": "application/json"}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))

    def json(self):
        return self._body


@pytest.fixture(autouse=True)
def _store_of_its_own(tmp_path, monkeypatch):
    day_tracks.reset()
    monkeypatch.setattr(day_tracks, "_store_path", lambda: tmp_path / "day_tracks.sqlite")
    monkeypatch.setattr(day_tracks, "resolve", lambda q: ("a0b7d8", "N14511"))
    monkeypatch.setattr(day_tracks.registry, "lookup", lambda **k: {"manufacturer": "Airbus S A S", "model": "A321-271NX"})
    yield
    day_tracks.reset()


def test_a_past_day_is_fetched_once_and_then_read_from_the_store(monkeypatch):
    asked = []

    def get(url, timeout):
        asked.append(url)
        return _Answer(200, TRACE)

    monkeypatch.setattr(day_tracks, "_globe_get", get)
    first = day_tracks.day_track("N14511", DAY, today=dt.date(2026, 11, 12))
    again = day_tracks.day_track("N14511", DAY, today=dt.date(2026, 11, 12))
    assert asked == ["https://adsb.lol/globe_history/2026/11/10/traces/d8/trace_full_a0b7d8.json"]
    assert first == again
    assert first["source"] == "adsb.lol" and first["license"] == "ODbL 1.0"
    # The pressure altitude, not the GNSS height; on the ground none.
    assert [p["alt_ft"] for p in first["points"]] == [None, 1200.0, 1700.0]
    assert first["points"][0]["ground"] is True
    assert first["altitude"] == "pressure"
    # The crew's altimeter setting where the report carries it.
    assert [p["qnh_hpa"] for p in first["points"]] == [None, None, 1022.4]


def test_a_day_with_no_trace_is_kept_as_none_and_a_refusal_is_not_kept(monkeypatch):
    answers = [_Answer(403), _Answer(404)]
    calls = []

    def get(url, timeout):
        calls.append(url)
        answer = answers.pop(0)
        if answer.status_code == 403:
            raise day_tracks._GlobeRefused("403")
        return answer

    monkeypatch.setattr(day_tracks, "_globe_get", get)
    monkeypatch.setattr(day_tracks, "_recorded", lambda hex_id: [])
    with pytest.raises(TrafficUnavailable):
        day_tracks.day_track("N14511", DAY, today=dt.date(2026, 11, 12))
    empty = day_tracks.day_track("N14511", DAY, today=dt.date(2026, 11, 12))
    assert empty["points"] == []
    day_tracks.day_track("N14511", DAY, today=dt.date(2026, 11, 12))
    assert len(calls) == 2


def test_the_reports_watched_here_stand_in_where_the_archive_has_none(monkeypatch):
    monkeypatch.setattr(day_tracks, "_globe_get", lambda url, timeout: _Answer(404))
    watched = [{"t": MIDNIGHT + 60, "lat": 44.5, "lon": -73.1, "alt_ft": 3000.0, "gs_kt": 110.0, "track_deg": 90.0}]
    monkeypatch.setattr(day_tracks, "_recorded", lambda hex_id: watched)
    found = day_tracks.day_track("N14511", DAY, today=dt.date(2026, 11, 12))
    assert found["source"] == "Watched here" and found["altitude"] == "reported"
    assert found["points"][0]["alt_ft"] == 3000.0


def test_a_day_to_come_is_refused():
    with pytest.raises(ValueError):
        day_tracks.day_track("N14511", dt.date(2026, 11, 13), today=dt.date(2026, 11, 12))


def test_a_name_the_registry_does_not_know_is_not_an_airplane(monkeypatch):
    monkeypatch.setattr(day_tracks.registry, "lookup", lambda **kw: None)
    with pytest.raises(day_tracks.NotAnAirplane):
        _RESOLVE("N99999")
    assert _RESOLVE("A0B7D8") == ("a0b7d8", None)
