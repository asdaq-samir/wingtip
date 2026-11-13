"""The readings in words' sources (routers/words.py): each of the
planner's figures as a line a sentence can cite and a pilot can read raw.
A briefing's changes are found here, and there are none to send where nothing changed."""

from fastapi.testclient import TestClient

from app.main import app
from app import route_briefing
from app.routers import words as words_router
from app.schemas.common import Briefing

client = TestClient(app)
METAR_C81 = "KC81 061353Z AUTO 27008KT 10SM CLR 15/07 A2992"
METAR_KDLH = "KDLH 061353Z 09012KT 2SM BR OVC008 08/07 A2988"


def briefing(**over) -> dict:
    return {
        "hazards": [],
        "weather_unavailable": [],
        "airports": {},
        "metars": {"C81": {"raw": METAR_C81, "flight_category": "VFR", "visibility_sm": 10, "wind_speed_kt": 8}, "KDLH": None},
        "forecast": {
            "min_ceiling_ft": 3500,
            "min_visibility_sm": 6,
            "stations": [
                {
                    "icaoId": "KDLH",
                    "ceiling_ft": 3500,
                    "visibility_sm": 6,
                    "along_track_nm": 300.0,
                    "eta": "2026-10-06T16:30:00Z",
                    "eta_ceiling_ft": 3500,
                    "eta_visibility_sm": 6,
                    "raw": "KDLH 061130Z 0612/0712 09010KT P6SM BKN035",
                }
            ],
        },
        **over,
    }


def _sources(resp) -> dict:
    assert resp.status_code == 200, resp.text
    return {s["id"]: s for s in resp.json()["sources"]}


def test_briefing_changes_finds_a_category_change_and_none_when_identical():
    then = Briefing.model_validate(briefing())
    now = Briefing.model_validate(briefing(metars={"C81": {"raw": METAR_KDLH, "flight_category": "IFR"}, "KDLH": None}))

    changes = words_router.briefing_changes(then, now)

    assert [c.id for c in changes] == ["metar:C81"]
    assert changes[0].text == f"Was: {METAR_C81}\nNow: {METAR_KDLH}"
    assert words_router.briefing_changes(then, then) == []


def test_briefing_changes_sees_a_new_hazard_a_new_tfr_a_field_newly_below_vfr_and_a_forecast_across_a_line():
    then = Briefing.model_validate(briefing())
    now = Briefing.model_validate(
        briefing(
            hazards=[{"hazard": "CONVECTIVE", "type": "SIGMET", "raw": "WSUS32 KKCI 061655 SIGMET 2C"}],
            tfrs=[{"notam_id": "6/1234", "title": "Stadium", "geometry": {}, "along_track_nm": 120.0, "crosses": True, "active_now": True}],
            fields_below_vfr=[
                {
                    "ident": "KDLH",
                    "source": "TAF",
                    "ceiling_ft": 800,
                    "visibility_sm": 2,
                    "on_route": {"legs": [0], "from_nm": 290, "to_nm": 300, "source": "TAF"},
                }
            ],
            forecast={
                "min_ceiling_ft": 800,
                "min_visibility_sm": 2,
                "stations": [
                    {
                        "icaoId": "KDLH",
                        "ceiling_ft": 800,
                        "visibility_sm": 2,
                        "along_track_nm": 300.0,
                        "eta": "2026-10-06T16:30:00Z",
                        "eta_ceiling_ft": 800,
                        "eta_visibility_sm": 2,
                        "raw": "KDLH 061130Z 0612/0712 09010KT 2SM BR OVC008",
                    }
                ],
            },
        )
    )

    ids = [c.id for c in words_router.briefing_changes(then, now)]

    assert ids == ["hazard:0", "tfr:6/1234", "below-vfr:KDLH", "taf:KDLH"]
    # And gone the other way, the hazard is said to be gone.
    assert "hazard-gone:0" in [c.id for c in words_router.briefing_changes(now, then)]


def test_the_changes_sources_are_none_when_nothing_changed_and_the_flight_first_when_something_did():
    body = {"dep": "C81", "dest": "KDLH", "then": briefing(), "now": briefing()}
    assert client.post("/api/words/changes/sources", json=body).json()["sources"] == []

    body["now"] = briefing(metars={"C81": {"raw": METAR_KDLH, "flight_category": "IFR"}, "KDLH": None})
    found = client.post("/api/words/changes/sources", json=body).json()["sources"]
    assert [s["id"] for s in found] == ["flight:route", "metar:C81"]


def test_the_weather_sources_are_the_briefings_with_the_flight_first(monkeypatch):
    asked = {}

    def fake_briefing(dep, dest, stops="", depart=None, ete_min=None, fixes="", leg_min="", ground_min=""):
        asked.update(dep=dep, dest=dest, stops=stops, ete_min=ete_min, fixes=fixes)
        return briefing()

    monkeypatch.setattr(route_briefing, "briefing", fake_briefing)

    found = _sources(
        client.post(
            "/api/words/weather/sources",
            json={
                "dep": "c81",
                "dest": "kdlh",
                "stops": ["KMSN"],
                "ete_min": 150,
                "depart": "2026-10-06T14:00:00Z",
                "fixes": "42,-88;46,-92",
            },
        )
    )

    assert asked == {"dep": "c81", "dest": "kdlh", "stops": "KMSN", "ete_min": 150, "fixes": "42,-88;46,-92"}
    assert found["flight:route"]["text"] == "From C81 to KDLH via KMSN. Leaving 2026-10-06T14:00:00Z. 150 min planned in the air."
    assert found["metar:C81"]["text"] == f"{METAR_C81}\nVFR: no ceiling · 10 sm."
    assert found["metar:KDLH"]["text"] == "No METAR reported for KDLH."
    # The TAF station is offered at the flight's time there, as the briefing placed it.
    assert "the flight there 2026-10-06T16:30:00Z" in found["taf:KDLH"]["text"]


def test_the_notam_sources_come_from_the_feeds_notams_at_the_fields_landed_at(monkeypatch):
    from wingtip import notams, tfr

    asked = {}

    def at_fields(fields, now=None):
        asked["fields"] = fields
        return [
            {
                "id": "DLH 10/012",
                "location": "DLH",
                "starts": "2026-10-01T12:00:00Z",
                "ends": None,
                "estimated": False,
                "schedule": None,
                "text": "RWY 09/27 CLSD",
                "raw": "!DLH 10/012 DLH RWY 09/27 CLSD 2610011200-PERM",
            }
        ]

    monkeypatch.setattr(notams, "at_fields", at_fields)
    monkeypatch.setattr(notams, "since", lambda: 1_760_000_000.0)
    monkeypatch.setattr(tfr, "along_route", lambda path, start, end: [])

    resp = client.post("/api/words/notams/sources", json={"dep": "C81", "dest": "KDLH", "depart": "2026-10-06T14:00:00Z"})

    found = _sources(resp)
    assert asked["fields"] == ["C81", "KDLH"]
    assert list(found) == ["flight:route", "notam:DLH 10/012"]
    assert found["notam:DLH 10/012"]["text"] == (
        "!DLH 10/012 DLH RWY 09/27 CLSD 2610011200-PERM\nFrom 2026-10-01T12:00:00Z, until further notice."
    )
    assert resp.json()["coverage_since"] == "2025-10-09" and resp.json()["unchecked"] == []

    # No NOTAM and no TFR: nothing at all, not even the flight.
    monkeypatch.setattr(notams, "at_fields", lambda fields, now=None: [])
    assert client.post("/api/words/notams/sources", json={"dep": "C81", "dest": "KDLH"}).json()["sources"] == []


def test_the_notam_sources_say_no_day_before_the_feed_has_been_heard(monkeypatch):
    from wingtip import notams, tfr

    monkeypatch.setattr(notams, "at_fields", lambda fields, now=None: [])
    monkeypatch.setattr(notams, "since", lambda: None)
    monkeypatch.setattr(tfr, "along_route", lambda path, start, end: [])
    assert client.post("/api/words/notams/sources", json={"dep": "C81", "dest": "KDLH"}).json()["coverage_since"] is None


def test_the_risk_sources_are_the_findings_the_factors_and_the_pilots_record():
    verdict = {
        "line": {"finding": "caution", "words": "Caution: 1 thing to check"},
        "items": [
            {"key": "weather", "label": "Weather", "finding": "ok", "detail": "VFR at both ends.", "tab": "preflight"},
            {"key": "fuel", "label": "Fuel", "finding": "caution", "detail": "2.1 gal over the reserve.", "tab": "preflight"},
        ],
        "risk": {
            "score": 7,
            "level": "caution",
            "line": "Raised · 7 points",
            "words": "Bring it down where you can.",
            "factors": [
                {
                    "key": "night_currency",
                    "label": "Night currency",
                    "why": "No night landings in 90 days",
                    "points": 4,
                    "finding": "caution",
                }
            ],
        },
        "self_checks": [],
    }

    pilot = {"ceiling_ft": 3000, "night_landings_90d": 0}
    found = _sources(client.post("/api/words/risk/sources", json={"verdict": verdict, "pilot": pilot}))

    assert list(found) == ["verdict:line", "finding:weather", "finding:fuel", "risk:line", "risk:night_currency", "pilot:record"]
    assert found["finding:fuel"] == {"id": "finding:fuel", "label": "Fuel: caution", "text": "2.1 gal over the reserve."}
    assert found["risk:line"]["text"] == "Raised · 7 points. Bring it down where you can. 7 points, level caution."
    assert found["pilot:record"]["text"] == "ceiling_ft: 3000\nnight_landings_90d: 0"


def test_the_risk_sources_read_the_webs_own_verdict_with_the_line_on_the_object():
    """The web app's Brief keeps the Go / No-Go as lib/verdict's twin: the
    line's finding and words on the object itself, the items, no risk
    assessment (RiskWords sends it so)."""
    verdict = {
        "finding": "caution",
        "words": "Caution: 1 thing to check",
        "items": [{"key": "fuel", "label": "Fuel", "finding": "caution", "detail": "2.1 gal over the reserve."}],
    }
    pilot = {"personal_minimums": {"ceiling_ft": 3000}, "currency": ["Night not current"]}

    found = _sources(client.post("/api/words/risk/sources", json={"verdict": verdict, "pilot": pilot}))

    assert found["verdict:line"]["text"] == "caution: Caution: 1 thing to check"
    assert 'currency: ["Night not current"]' in found["pilot:record"]["text"]


DEBRIEF = {
    "takeoff": 1_759_417_320_000,
    "landing": 1_759_419_480_000,
    "flown_min": 36.0,
    "planned_min": 36.0,
    "legs": [
        {
            "from": "A",
            "to": "Lake",
            "planned_alt_ft": 3500,
            "altitude_within": 0.9,
            "worst_alt_ft": 100,
            "course_deg": 0,
            "course_within": 1.0,
            "worst_off_nm": 0.5,
            "ok": True,
        },
        {
            "from": "Lake",
            "to": "B",
            "planned_alt_ft": 3500,
            "altitude_within": 0.8,
            "worst_alt_ft": 300,
            "course_deg": 0,
            "course_within": 1.0,
            "worst_off_nm": 0.5,
            "ok": False,
        },
    ],
    "passes": [
        {
            "name": "Lake",
            "category": "lake",
            "landed": False,
            "due_min": 18,
            "passed_min": 19.2,
            "closest_nm": 0.5,
            "late_min": 1.2,
            "ok": True,
        }
    ],
    "patterns": [{"ident": "B", "alt_ft": 1800, "pattern_ft": 1700, "off_ft": 100, "ok": True}],
    "profile": [],
    "planned": [],
    "line": [],
    "has_altitude": True,
    "notes": ["The track starts 0.2 nm from A."],
}
TOLERANCES = {"altitude_ft": 200, "course_deg": 15, "off_route_nm": 3, "eta_min": 5, "pattern_nm": 1.5, "pattern_ft": 100}


def test_the_debrief_sources_are_each_figure_and_a_track_that_never_flew_is_a_422():
    found = _sources(client.post("/api/words/debrief/sources", json={"debrief": {"debrief": DEBRIEF, "tolerances": TOLERANCES}}))

    assert found["leg:1"]["text"] == (
        "Lake to B: altitude within 200 ft of 3,500 ft for 80% of the cruise, furthest off 300 ft high; "
        "course 0° held within 15° for 100% of the way, furthest off the line 0.5 nm right; outside tolerance."
    )
    assert "1,800 ft entering the pattern against 1,700 ft, 100 ft high" in found["pattern:B"]["text"]
    assert found["time"]["text"] == "Took off 1502Z, landed 1538Z: 36 min in the air against 36 min planned."
    assert "tolerances" in found and "note:0" in found

    resp = client.post("/api/words/debrief/sources", json={"debrief": {"debrief": None, "tolerances": TOLERANCES}})
    assert resp.status_code == 422


def test_the_debrief_sources_read_the_webs_own_figures_camel_cased_and_unmarked():
    """The web's DebriefWords sends lib/debrief's figures as they are: the
    keys camel-cased, no marks, no drawn line or profile; the marks are
    put on here as /api/debrief puts them on, the tolerances the engine's."""
    figures = {
        "takeoff": 1_759_417_320_000,
        "landing": 1_759_419_480_000,
        "flownMin": 36.0,
        "plannedMin": 36.0,
        "legs": [
            {
                "from": "A",
                "to": "Lake",
                "plannedAltFt": 3500,
                "altitudeWithin": 0.9,
                "worstAltFt": 100,
                "courseDeg": 0,
                "courseWithin": 1.0,
                "worstOffNm": 0.5,
            },
            {
                "from": "Lake",
                "to": "B",
                "plannedAltFt": 3500,
                "altitudeWithin": 0.8,
                "worstAltFt": 300,
                "courseDeg": 0,
                "courseWithin": 1.0,
                "worstOffNm": 0.5,
            },
        ],
        "passes": [{"name": "Lake", "category": "lake", "dueMin": 18, "passedMin": 19.2, "closestNm": 0.5}],
        "patterns": [{"ident": "B", "altFt": 1800, "patternFt": 1700}],
        "hasAltitude": True,
        "notes": [],
    }

    found = _sources(client.post("/api/words/debrief/sources", json={"debrief": figures}))

    assert "furthest off 300 ft high" in found["leg:1"]["text"] and "outside tolerance" in found["leg:1"]["text"]
    assert "100 ft high" in found["pattern:B"]["text"]
    assert client.post("/api/words/debrief/sources", json={"debrief": {"takeoff": 1}}).status_code == 422


def test_a_debrief_with_too_many_or_too_long_notes_or_a_huge_pilot_record_is_refused():
    figures = {
        "takeoff": 1,
        "landing": 2,
        "flownMin": 1.0,
        "plannedMin": 1.0,
        "legs": [],
        "passes": [],
        "patterns": [],
        "hasAltitude": False,
        "notes": ["n"] * 51,
    }
    resp = client.post("/api/words/debrief/sources", json={"debrief": figures})
    assert resp.status_code == 422
    figures["notes"] = ["n" * 501]
    assert client.post("/api/words/debrief/sources", json={"debrief": figures}).status_code == 422

    verdict = {"line": {"finding": "ok", "words": "Fine"}, "items": []}
    huge = {"k": "y" * 30_000}
    assert client.post("/api/words/risk/sources", json={"verdict": verdict, "pilot": huge}).status_code == 422
