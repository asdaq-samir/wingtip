"""POST /api/go-no-go under IFR, with test_gonogo_api's stubbed route, plan
and briefing: the alternate's word on the weather and the forecast icing
(14 CFR 91.169; AIM 7-1-4), said or said unchecked."""

from datetime import datetime, timezone

from app.gonogo import flight

from .test_gonogo_api import DEPART, ask, by_key, client, legs, nav, totals
from .test_gonogo_api import stubbed  # noqa: F401 -- the route, plan and briefing of a quiet flight


def test_under_ifr_the_alternate_speaks_for_the_weather(stubbed, monkeypatch):  # noqa: F811
    asked = {}

    def alternate(dest, eta, tas, filed):
        asked.update(dest=dest, eta=eta, tas=tas, filed=filed)
        return {"destination": {"required": True}, "alternate": None}

    monkeypatch.setattr(flight, "alternate_for", alternate)
    body = client.post("/api/go-no-go", json=ask(rules="ifr")).json()
    weather = by_key(body)["weather"]
    assert weather["detail"] == "An alternate is required (14 CFR 91.169(a)(2)) and none is filed: file one in Weather"
    assert (weather["tab"], weather["section"]) == ("arrive", "Alternate")
    assert asked["dest"] == "KDLH" and asked["eta"] == datetime(2026, 10, 6, 16, 30, tzinfo=timezone.utc)


def test_under_ifr_icing_with_no_freezing_level_is_said_not_checked(stubbed, monkeypatch):  # noqa: F811
    # No alternate needed, so the weather's own finding stands.
    monkeypatch.setattr(flight, "alternate_for", lambda dest, eta, tas, filed: {"destination": {"required": False}, "alternate": None})
    stubbed["planned"] = flight.Planned(
        nav=nav(selection={"special_use": [], "icing_possible": True, "freezing_level_ft": None}), legs=legs(), totals=totals()
    )
    items = by_key(client.post("/api/go-no-go", json=ask(rules="ifr")).json())
    assert items["weather"]["finding"] == "caution"
    assert items["weather"]["detail"] == "Icing not checked: freezing level not known"


def test_under_ifr_the_forecast_icing_is_said_and_one_not_had_is_unchecked(stubbed, monkeypatch):  # noqa: F811
    """The web's Brief asks /api/icing/route and says its line, or the
    forecast icing unchecked where it failed; the planner's Go / No-Go (the
    MCP connector's, the departure window's) says the same, where it said
    nothing and so Go (round 5's engine audit)."""
    from app.gonogo import icing
    from wingtip import icing_forecast

    monkeypatch.setattr(flight, "alternate_for", lambda dest, eta, tas, filed: {"destination": {"required": False}, "alternate": None})
    stubbed["planned"] = flight.Planned(nav=nav(), legs=legs(), totals=totals(), fixes=[(42.1, -87.9), (46.8, -92.2)])
    asked = {}

    def along(fixes, altitudes, minutes, ground, start):
        asked.update(fixes=fixes, altitudes=altitudes, minutes=minutes, start=start)
        return {"line": "Moderate icing forecast at 5,500 ft on the leg to KDLH", "legs": []}

    monkeypatch.setattr(icing.icing_forecast, "along", along)
    items = by_key(client.post("/api/go-no-go", json=ask(rules="ifr")).json())
    said = "Moderate icing forecast at 5,500 ft on the leg to KDLH"
    assert (items["weather"]["finding"], items["weather"]["detail"]) == ("caution", said)
    assert asked == {"fixes": [(42.1, -87.9), (46.8, -92.2)], "altitudes": [5500.0], "minutes": [150.0], "start": DEPART.timestamp()}

    def none(*_):
        raise icing_forecast.IcingForecastUnavailable("no forecast")

    monkeypatch.setattr(icing.icing_forecast, "along", none)
    items = by_key(client.post("/api/go-no-go", json=ask(rules="ifr")).json())
    assert (items["weather"]["finding"], items["weather"]["detail"]) == ("caution", "Not checked: the forecast icing")
    # Under VFR the flight stays clear of cloud (14 CFR 91.155): not asked.
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    assert items["weather"]["finding"] == "ok"
