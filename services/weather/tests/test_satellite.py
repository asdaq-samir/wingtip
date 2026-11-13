"""The GOES pictures' times read from nowCOAST's capabilities and stored
(app.satellite), without the network: a trimmed copy of its answer."""

import calendar
import time
from unittest.mock import Mock

import pytest
import requests
from wingtip import weather_store

from app import satellite

# nowCOAST's capabilities, trimmed to the two layers the loop draws and a
# third it does not; times as nowCOAST writes them.
CAPABILITIES = b"""<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms"><Capability><Layer>
  <Layer><Name>goes_longwave_imagery</Name>
    <Dimension name="time" default="2026-11-09T21:18:00Z" units="ISO8601">2026-11-09T15:03:00.000Z,
      2026-11-09T21:08:00.000Z,2026-11-09T21:13:00.000Z,2026-11-09T21:18:00.000Z</Dimension>
  </Layer>
  <Layer><Name>goes_visible_imagery</Name>
    <Dimension name="time" default="2026-11-09T21:13:00Z" units="ISO8601">2026-11-09T21:13:00.000Z,2026-11-09T21:03:00.000Z</Dimension>
  </Layer>
  <Layer><Name>goes_water_vapor_imagery</Name>
    <Dimension name="time" units="ISO8601">2026-11-09T21:18:00.000Z</Dimension>
  </Layer>
</Layer></Capability></WMS_Capabilities>"""

NOW = calendar.timegm(time.strptime("2026-11-09T21:20:00", "%Y-%m-%dT%H:%M:%S"))


def test_each_pictures_times_are_the_last_three_hours_oldest_first():
    assert satellite.times_in(CAPABILITIES, NOW) == {
        "ir": ["2026-11-09T21:08:00Z", "2026-11-09T21:13:00Z", "2026-11-09T21:18:00Z"],
        "visible": ["2026-11-09T21:03:00Z", "2026-11-09T21:13:00Z"],
    }


def test_the_times_are_stored_for_the_planner(monkeypatch):
    monkeypatch.setattr(satellite.outside, "get", Mock(return_value=Mock(content=CAPABILITIES, raise_for_status=lambda: None)))
    monkeypatch.setattr(satellite.time, "time", lambda: NOW)
    satellite.fetch()
    record = weather_store.read("satellite")
    assert record is not None and record.data["ir"][-1] == "2026-11-09T21:18:00Z"


def test_no_answer_leaves_the_stored_times_and_says_why(monkeypatch):
    monkeypatch.setattr(satellite.outside, "get", Mock(side_effect=requests.ConnectionError("down")))
    with pytest.raises(satellite.SatelliteUnavailable, match="nowCOAST did not answer"):
        satellite.fetch()


def test_an_answer_with_no_recent_pictures_is_a_failure(monkeypatch):
    monkeypatch.setattr(satellite.outside, "get", Mock(return_value=Mock(content=CAPABILITIES, raise_for_status=lambda: None)))
    monkeypatch.setattr(satellite.time, "time", lambda: NOW + 86400)
    with pytest.raises(satellite.SatelliteUnavailable, match="no GOES pictures"):
        satellite.fetch()
