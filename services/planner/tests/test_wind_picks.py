"""The nav log's first plan flies the runways into the wind the page picks
a moment later (wingtip.flight_plan.wind_picks): a field within the hour by
its own report, the pilot's picks kept, the rest left for the page."""

from datetime import datetime, timezone
from types import SimpleNamespace

from wingtip import planning
from app import plan_query
from wingtip import flight_plan as fp

NOW = datetime(2026, 10, 28, 18, 0, tzinfo=timezone.utc)


def _flight(dep, dest, lands=True):
    return SimpleNamespace(
        idents=[dep, dest],
        dep_ident=dep,
        dest_ident=dest,
        takes_off=True,
        lands=lands,
        dep_airport={"ident": dep, "lat": 1.0, "lon": 2.0},
        dest_airport={"ident": dest, "lat": 3.0, "lon": 4.0},
    )


def _stubbed(monkeypatch, favoured, forecast=(), nearby=()):
    monkeypatch.setattr(planning, "now", lambda: NOW)
    monkeypatch.setattr(fp.weather, "metar_for_idents", lambda idents: {i: {"wind_speed_kt": 10} for i in idents if i in favoured})
    monkeypatch.setattr(fp.airports, "get_runways", lambda ident: [ident])
    monkeypatch.setattr(fp.runway_wind, "with_winds", lambda runways, metar, lat, lon: runways)
    monkeypatch.setattr(fp.pattern, "with_traffic", lambda ways, ident, lat, lon: ways)
    monkeypatch.setattr(fp.runway_wind, "runway_in_use", lambda ways: favoured.get(ways[0]))

    def picked(ways, wind):
        return wind and (f"{ways[0]}@{wind['at']}" if "at" in wind else f"{ways[0]} by {wind['by']}")

    monkeypatch.setattr(fp.runway_wind, "wind_pick", picked)
    monkeypatch.setattr(fp, "_wind_of", lambda report, airport, source: {"by": "KUGN"} if source in nearby else None)
    monkeypatch.setattr(fp.weather, "forecast_wind", lambda lat, lon, at, ident: {"at": at} if ident in forecast else None)


def test_each_field_within_the_hour_by_its_report_the_pilots_own_kept(monkeypatch):
    _stubbed(monkeypatch, {"KOSH": "18", "KGRB": "36"})
    r = SimpleNamespace(flights=[_flight("KOSH", "KGRB")])
    outcome = SimpleNamespace(hop_legs=[[{"ete_min": 20.8}]])
    q = plan_query.PlanQuery(dep="KOSH", dest="KGRB", wind_runways=True)
    assert fp.wind_picks(r, outcome, q.asked()) == ({"OSH": "18"}, {"GRB": "36"})
    # The pilot's own runway stands.
    q = plan_query.PlanQuery(dep="KOSH", dest="KGRB", wind_runways=True, patterns="KGRB:6")
    assert fp.wind_picks(r, outcome, q.asked()) == ({"OSH": "18"}, {"GRB": "6"})
    # Not asked for: the picks as sent.
    q = plan_query.PlanQuery(dep="KOSH", dest="KGRB")
    assert fp.wind_picks(r, outcome, q.asked()) == ({}, {})


def test_a_field_reached_after_the_hour_by_its_forecast_then_and_none_with_no_report(monkeypatch):
    _stubbed(monkeypatch, {"KMSN": "18", "KDSM": "31"}, forecast=("KDSM", "KMSN"))
    # 61 minutes to Des Moines: its TAF's wind at 19:00 (to the ten minutes).
    r = SimpleNamespace(flights=[_flight("KMSN", "KDSM")])
    q = plan_query.PlanQuery(dep="KMSN", dest="KDSM", wind_runways=True)
    at = datetime(2026, 10, 28, 19, 0, tzinfo=timezone.utc).timestamp()
    assert fp.wind_picks(r, SimpleNamespace(hop_legs=[[{"ete_min": 61}]]), q.asked()) == ({"MSN": "18"}, {"DSM": f"KDSM@{at:.0f}"})
    # A departure two hours off: the forecast's at both.
    q = plan_query.PlanQuery(dep="KMSN", dest="KDSM", wind_runways=True, depart=datetime(2026, 10, 28, 20, 0, tzinfo=timezone.utc))
    picks = fp.wind_picks(r, SimpleNamespace(hop_legs=[[{"ete_min": 30}]]), q.asked())
    assert picks == (
        {"MSN": f"KMSN@{datetime(2026, 10, 28, 20, 0, tzinfo=timezone.utc).timestamp():.0f}"},
        {"DSM": f"KDSM@{datetime(2026, 10, 28, 20, 30, tzinfo=timezone.utc).timestamp():.0f}"},
    )
    # C81 reports nothing, nor anything near it: none, the page's.
    r = SimpleNamespace(flights=[_flight("C81", "KMSN")])
    q = plan_query.PlanQuery(dep="C81", dest="KMSN", wind_runways=True)
    assert fp.wind_picks(r, SimpleNamespace(hop_legs=[[{"ete_min": 40}]]), q.asked()) == ({}, {"MSN": "18"})


def test_a_field_with_no_report_of_its_own_by_the_nearest_reports_wind(monkeypatch):
    # C81 by KUGN's wind, as its card says it.
    _stubbed(monkeypatch, {"KMSN": "18"}, nearby=("C81",))
    r = SimpleNamespace(flights=[_flight("C81", "KMSN")])
    q = plan_query.PlanQuery(dep="C81", dest="KMSN", wind_runways=True)
    assert fp.wind_picks(r, SimpleNamespace(hop_legs=[[{"ete_min": 40}]]), q.asked()) == ({"C81": "C81 by KUGN"}, {"MSN": "18"})
