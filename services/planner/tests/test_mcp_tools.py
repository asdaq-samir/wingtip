"""The connector's airport, weather and account tools (app.mcp), each
asked through the MCP SDK's client as Claude or ChatGPT asks it: what the
planner's own endpoint answers, trimmed to what the tool is for, with its
sources. The data under the endpoints is stubbed as their own tests stub
it (test_airports, test_notam_rank); the NOTAMs are the shared fixtures'
(apps/web/src/lib/fixtures/notamsRanked.json), ranked by the engine."""

import json
from pathlib import Path

import pytest
from mcp.types import TextContent
from wingtip import airports, notams, tfr, weather

from app.mcp import calls, records

from .mcp_harness import call
from .test_airports import stub_place

FIXTURES = Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures"
METAR = {"raw": "KDLH 011853Z 28012KT 10SM CLR 05/M02 A3002", "flight_category": "VFR", "visibility_sm": 10.0}


@pytest.fixture(autouse=True)
def _fresh_counts():
    calls._WINDOW.storage.reset()


def answer(result) -> dict:
    assert not result.is_error, [c.text for c in result.content if isinstance(c, TextContent)]
    return result.structured_content


def refusal(result) -> str:
    assert result.is_error
    return " ".join(c.text for c in result.content if isinstance(c, TextContent))


def test_airport_info_is_the_card_without_its_weather(monkeypatch):
    stub_place(
        monkeypatch,
        frequencies=[{"type": "TWR", "description": "Tower", "frequency_mhz": 118.3}],
        runways=[{"ends": "09/27", "length_ft": 10162, "width_ft": 150, "surface": "CON", "lighted": True, "closed": False}],
        metar=METAR,
    )
    card = answer(call("airport_info", {"ident": "kdlh"}))
    assert card["ident"] == "KDLH" and card["airspace_class"] == "C" and card["towered"] is True
    assert card["runways"][0]["length_ft"] == 10162
    assert "metar" not in card and "taf" not in card
    assert card["sources"][-1]["source"].startswith("FAA d-TPP")


def test_an_unknown_airport_says_how_to_find_one(monkeypatch):
    stub_place(monkeypatch)
    said = refusal(call("airport_info", {"ident": "ZZZZ"}))
    assert "No US airport goes by 'ZZZZ'" in said and "search_airports" in said


def test_airport_weather_is_the_metar_and_taf_as_sent(monkeypatch):
    stub_place(monkeypatch, metar=METAR, taf={"raw": "TAF KDLH 011720Z 0118/0218 28012KT P6SM SKC"})
    wx = answer(call("airport_weather", {"ident": "DLH"}))
    assert wx["metar"]["raw"] == METAR["raw"] and wx["metar"]["flight_category"] == "VFR"
    assert wx["taf"].startswith("TAF KDLH")
    assert "runways" not in wx
    assert wx["sources"][0] == calls.METAR_SOURCE


def test_a_weather_outage_is_said_as_one(monkeypatch):
    stub_place(monkeypatch, metar=weather.WeatherServiceError("aviationweather.gov timed out"))
    wx = answer(call("airport_weather", {"ident": "KDLH"}))
    assert wx["weather_unavailable"] is True and "metar" not in wx


def test_airport_notams_are_the_engines_ranking_of_the_fields_notams(monkeypatch):
    case = json.loads((FIXTURES / "notamsRanked.json").read_text())["cases"][0]
    osh = [{**n, "raw": n["text"], "schedule": None} for n in case["input"]["notams"] if n.get("location") in ("OSH", "KOSH")]
    monkeypatch.setattr(airports, "find_place", lambda ident: {"ident": "KOSH", "source_ident": "KOSH", "lat": 43.98, "lon": -88.56})
    monkeypatch.setattr(notams, "at_fields", lambda fields, now=None: osh)
    monkeypatch.setattr(notams, "since", lambda: 1_762_000_000.0)
    monkeypatch.setattr(tfr, "near_point", lambda lat, lon, start, end: [])
    found = answer(call("airport_notams", {"ident": "KOSH", "limit": 2}))
    assert found["total"] == len(osh) and len(found["notams"]) == 2
    assert all(n["raw"].startswith("!OSH") for n in found["notams"])
    assert [n["rank"] for n in found["notams"]] == [1, 2]
    assert "FAA NOTAM System" in found["sources"][0]["source"]


def _nearest(monkeypatch, rows):
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit: rows)
    monkeypatch.setattr(
        airports, "get_runways", lambda ident: [{"ends": "18/36", "length_ft": {"KC81": 3573}.get(ident, 6000), "closed": False}]
    )
    monkeypatch.setattr(
        airports, "get_frequencies_for", lambda idents: {"KJVL": [{"type": "TWR", "description": "Tower", "frequency_mhz": 118.8}]}
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {i: None for i in idents})


def _field(ident, nm, **over):
    return {"ident": ident, "source_ident": "K" + ident.lstrip("K"), "name": ident, "lat": 42.3, "lon": -88.1, "kind": "small"} | {
        "distance_nm": nm,
        "bearing_deg": 90,
        **over,
    }


def test_nearest_airports_filter_by_runway_and_tower(monkeypatch):
    _nearest(monkeypatch, [_field("C81", 2.1), _field("KJVL", 30.0), _field("KUGN", 12.0)])
    near = answer(call("nearest_airports", {"lat": 42.3, "lon": -88.1, "min_runway_ft": 5000}))
    assert [a["ident"] for a in near["airports"]] == ["KJVL", "KUGN"]
    towered = answer(call("nearest_airports", {"lat": 42.3, "lon": -88.1, "towered_only": True}))
    assert [a["ident"] for a in towered["airports"]] == ["KJVL"]


def test_nearest_airports_needs_a_place():
    assert "give `near`" in refusal(call("nearest_airports", {}))


AIRPLANE = {
    "id": 3,
    "tailNumber": "N123AB",
    "typeDesignator": "C172",
    "cruiseTasKt": 118.0,
    "fuelBurnGph": 8.5,
    "usableFuelGal": 53.0,
    "figures": {"serviceCeilingFt": 13000.0},
    "openSquawks": [],
}


def test_my_airplanes_and_flights_are_the_pilots_own(monkeypatch):
    asked = []

    async def airplanes(pilot_id):
        asked.append(pilot_id)
        return [AIRPLANE]

    async def flights(pilot_id):
        # The gateway's whole row: notes, the risk assessment, the share and
        # the picks are not the route summary the connector gives.
        return [
            {
                "id": 9,
                "name": "Lake run",
                "departureIdent": "C81",
                "destinationIdent": "KDLH",
                "stops": [],
                "share": {"url": "https://wingtipmaps.app/s/abc"},
                "notes": "Medical renewal next week",
                "risk": {"score": 14, "level": "caution", "factors": ["Pilot: illness"]},
                "picks": "altitude_ft=4500",
                "altitudes": "VPBNG:4500",
            }
        ]

    monkeypatch.setattr(records, "airplanes", airplanes)
    monkeypatch.setattr(records, "flights", flights)
    mine = answer(call("my_airplanes", token="read-42"))
    assert asked == ["42"]
    assert mine["airplanes"][0]["tailNumber"] == "N123AB" and mine["airplanes"][0]["figures"] == {"serviceCeilingFt": 13000.0}
    flown = answer(call("my_flights", token="read-42"))
    assert flown["flights"] == [{"id": 9, "name": "Lake run", "departureIdent": "C81", "destinationIdent": "KDLH", "stops": []}]


def test_records_without_the_internal_token_say_what_is_missing(monkeypatch):
    monkeypatch.delenv("MCP_INTERNAL_TOKEN", raising=False)
    assert "MCP_INTERNAL_TOKEN is not set" in refusal(call("my_airplanes"))
