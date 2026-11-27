"""A copy a source sends again unchanged is neither parsed nor written
again (wingtip.weather_store.write_if_changed): the TFR list, asked every
ten minutes but changed a few times a day, and aviationweather.gov's cache
files, whose ETags and Last-Modified move every minute though the SIGMETs,
G-AIRMETs and PIREPs change every few hours. The try's attempt file
confirms the copy held, and that confirmation is the age the service's
health, the planner's Status page and the map say."""

import gzip
from unittest.mock import MagicMock, Mock

import requests
from wingtip import tfr as planner_tfr
from wingtip import ratelimit, weather, weather_store

from app import aviationweather, fetch, main, tfr


def _body(xml: bytes, minute: int) -> MagicMock:
    # The same file, regenerated: a new Last-Modified and ETag each minute.
    stamp = f"Wed, 07 Oct 2026 16:{minute:02d}:00 GMT"
    resp = MagicMock(status_code=200, content=gzip.compress(xml), headers={"ETag": f'"{minute}"', "Last-Modified": stamp})
    resp.raise_for_status = Mock()
    return resp


def test_the_same_body_under_new_validators_is_not_parsed_or_written_again(monkeypatch):
    answers = [_body(b"<response/>", 1), _body(b"<response/>", 2), _body(b"<response><x/></response>", 3)]
    asked = []

    def get(url, params=None, headers=None, timeout=None):
        asked.append(headers)
        return answers[len(asked) - 1]

    parsed = []

    def parse(body):
        parsed.append(body)
        return [len(parsed)]

    now = [1000.0]
    monkeypatch.setattr(aviationweather.time, "time", lambda: now[0])
    monkeypatch.setattr(fetch.outside, "get", get)
    # A held-until that does not move with the fetch: an advisory's own end.
    monkeypatch.setitem(aviationweather.SOURCES, "airsigmets", ("https://example/airsigmets", parse, lambda data, at: 9000.0))
    aviationweather.fetch_source("airsigmets")
    now[0] = 1300.0
    aviationweather.fetch_source("airsigmets")
    held = weather_store.read("airsigmets")
    assert len(parsed) == 1 and held.fetched_at == 1000.0 and held.data == [1]
    # The validators moved, and the next ask carries the newest of them.
    assert weather_store.validators("airsigmets")["If-None-Match"] == '"2"'
    assert asked[1]["If-None-Match"] == '"1"'
    # A changed body is read and written.
    now[0] = 1600.0
    aviationweather.fetch_source("airsigmets")
    assert len(parsed) == 2 and weather_store.read("airsigmets").fetched_at == 1600.0


def test_an_unchanged_held_until_that_moves_is_written(monkeypatch):
    # An empty set is held a while from its fetch: the copy is written
    # again so its time to be served on moves with each confirmation.
    monkeypatch.setattr(fetch.outside, "get", lambda *a, **kw: _body(b"<response/>", 1))
    now = [1000.0]
    monkeypatch.setattr(aviationweather.time, "time", lambda: now[0])
    monkeypatch.setitem(aviationweather.SOURCES, "pireps", ("https://example/pireps", lambda body: [], lambda data, at: at + 3600))
    aviationweather.fetch_source("pireps")
    now[0] = 1300.0
    aviationweather.fetch_source("pireps")
    assert weather_store.read("pireps").until == 1300.0 + 3600


def test_a_try_that_finds_the_copy_unchanged_confirms_it_and_a_failure_carries_that_on():
    weather_store.write("tafs", [], fetched_at=100.0, until=None)
    weather_store.write_attempt("tafs", 400.0, None)
    record = weather_store.read("tafs")
    assert weather_store.confirmed_at("tafs", record) == 400.0
    assert weather.sources_status()[1]["fetched_at"] == 400.0
    assert not weather_store.failing("tafs", record)
    weather_store.write_attempt("tafs", 700.0, "TAFs unavailable")
    assert weather_store.attempt("tafs")["confirmed"] == 400.0
    assert weather_store.confirmed_at("tafs", record) == 400.0 and weather_store.failing("tafs", record)
    assert weather_store.confirmed_at("tafs", None) is None


def test_the_health_ages_a_product_from_its_last_confirmation(monkeypatch):
    weather_store.write("radar", {}, fetched_at=100.0, until=None)
    weather_store.write_attempt("radar", 5000.0, None)
    radar = main.health(now=5060.0)["products"]["radar"]
    assert radar["fetched_at"] == 5000.0 and radar["age_s"] == 60.0 and not radar["failing"]


def test_an_unchanged_tfr_list_is_not_written_again_and_its_age_is_the_last_try(monkeypatch):
    feature = {
        "properties": {"NOTAM_KEY": "6/1-1-FDC-F", "TITLE": "ON IT", "LEGAL": "SECURITY", "LAST_MODIFICATION_DATETIME": "1"},
        "geometry": {"type": "Polygon", "coordinates": [[[-88.0, 42.5], [-87.9, 42.5], [-87.9, 42.6], [-88.0, 42.5]]]},
    }

    def get(url, headers=None, timeout=None):
        if "detail_" in url:
            raise requests.ConnectionError("no detail today")
        return Mock(json=lambda: {"features": [feature]}, raise_for_status=lambda: None)

    monkeypatch.setattr(tfr, "_DETAILS", tfr.LRUCache(maxsize=8))
    monkeypatch.setattr(tfr, "_DETAILS_GATE", ratelimit.Gate())
    monkeypatch.setattr(tfr.outside, "get", get)
    now = [1000.0]
    monkeypatch.setattr(tfr.time, "time", lambda: now[0])
    tfr.fetch()
    weather_store.write_attempt("tfrs", 1000.0, None)
    now[0] = 1600.0
    tfr.fetch()
    weather_store.write_attempt("tfrs", 1600.0, None)
    assert weather_store.read("tfrs").fetched_at == 1000.0
    # The map's age is the last confirmation; /api/tfrs' answer is kept by
    # the copy's writing, which has not moved.
    assert planner_tfr.fetched_at() == 1600.0 and planner_tfr.copy_written_at() == 1000.0
    assert not planner_tfr.failing()
