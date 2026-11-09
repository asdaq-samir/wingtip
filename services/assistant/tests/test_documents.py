"""A photographed page read and checked (app.documents), with Claude stubbed
at the SDK and the planner's engine answered from the test's table: the
photo goes to the model as an image with the kind's ask and the kind's
shape to fill in; what it read goes to the engine's rule as the rule's
input, and comes back with the rule's answer; a clearance note comes back
as words for the app's clearance reader; the photo is checked before any
call, and a reader out of reach is a 503. The photos are the drawn sample
pages beside these tests (fixtures/pages/make_pages.py)."""

import base64
import json
from pathlib import Path
from types import SimpleNamespace

import anthropic
import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app.documents import reader
from app.generated.planner_client import PlannerError
from app.main import app

client = TestClient(app)
PAGES = Path(__file__).parent / "fixtures" / "pages"
SHARED = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/documents.json").read_text())


def photo(name: str) -> str:
    return base64.b64encode((PAGES / name).read_bytes()).decode()


class FakeClaude:
    """anthropic.Anthropic as the reader asks it: each messages.parse call
    kept, answered with `answer` filled into the shape asked for."""

    def __init__(self, answer: dict | Exception, stop_reason: str = "end_turn"):
        self.answer, self.stop_reason, self.calls = answer, stop_reason, []
        self.messages = SimpleNamespace(parse=self.parse)

    def __call__(self):
        return self

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.answer, Exception):
            raise self.answer
        parsed = kwargs["output_format"].model_validate(self.answer)
        return SimpleNamespace(parsed_output=parsed, stop_reason=self.stop_reason, usage=None, model=kwargs["model"])


@pytest.fixture
def claude(monkeypatch):
    def use(answer, stop_reason="end_turn"):
        fake = FakeClaude(answer, stop_reason)
        monkeypatch.setattr(reader.anthropic, "Anthropic", fake)
        return fake

    return use


@pytest.fixture(autouse=True)
def no_real_model(monkeypatch):
    def unexpected():
        raise AssertionError("the model was asked without a canned answer")

    monkeypatch.setattr(reader.anthropic, "Anthropic", unexpected)


def post(kind: str, name: str, media_type="image/png", **more):
    return client.post("/api/read-document", json={"kind": kind, "image": photo(name), "media_type": media_type, **more})


CLEAN = SHARED["handbook"][0]["input"]
ENGINE_ANSWER = {
    "items": [
        {
            "key": "cruise.2",
            "group": "cruise",
            "title": "6,000 ft, 65%",
            "figures": [{"path": "cruise.2.tas", "label": "True airspeed", "value": 113, "unit": "kt", "app_value": 113, "app_unit": "kt"}],
            "flags": [],
        }
    ],
    "handbook": {
        "cruise": [{"altitude_ft": 6000, "power_pct": 65, "rpm": 2450, "tas_kt": 113, "burn_gph": 8.5}],
        "takeoff": [],
        "landing": [],
        "envelope": [],
    },
    "profile": {
        "cruise_tas_kt": 113,
        "fuel_burn_gph": 8.5,
        "cruise_power_pct": 65,
        "cruise_from": "cruise.2",
        "climb_fuel_burn_gph": 11,
        "usable_fuel_gal": 53,
    },
}


def test_a_handbook_page_goes_to_the_model_as_an_image_and_what_it_read_to_the_engine(claude, fake_planner):
    fake = claude({**CLEAN, "notes": ["The page's header is cut off."]})
    fake_planner.answer("/api/engine/handbook_read_check", lambda body: ENGINE_ANSWER)

    r = post("poh-performance", "cruise.png")

    assert r.status_code == 200, r.text
    body = r.json()
    # The model saw the photo, then the ask for a performance page, and
    # filled in the handbook's shape.
    content = fake.calls[0]["messages"][0]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["media_type"] == "image/png"
    assert base64.b64decode(content[0]["source"]["data"]) == (PAGES / "cruise.png").read_bytes()
    assert "section 5" in content[1]["text"] and fake.calls[0]["output_format"] is reader.SHAPES["poh-performance"]
    assert fake.calls[0]["output_config"] == {"effort": "high"}
    # The engine was asked with the read as its input -- the figures as
    # read, without the model's notes -- and its answer is the check.
    method, path, given, _ = fake_planner.calls[0]
    assert (method, path) == ("POST", "/api/engine/handbook_read_check")
    assert given["cruise"][2] == {"altitude_ft": 6000, "power_pct": 65, "rpm": 2450, "tas": 113, "burn": 8.5}
    assert given["empty"]["moment_divisor"] == 1000 and "notes" not in given
    assert body["handbook_check"]["profile"]["cruise_from"] == "cruise.2"
    assert body["handbook"]["speed_unit"] == "kt" and body["notes"] == ["The page's header is cut off."]
    assert body["logbook"] is None and body["clearance"] is None


def test_a_logbook_page_is_checked_with_the_apps_date_and_its_departure_as_from(claude, fake_planner):
    page = SHARED["logbook"][0]["input"]
    claude({"rows": page["rows"], "page_totals": page["page_totals"]})
    asked = []

    def engine(body):
        asked.append(body)
        return {"rows": [{"entry": {"flownOn": "2026-10-03", "totalHours": 1.4, "dayLandings": 1.0}, "flags": []}], "flags": []}

    fake_planner.answer("/api/engine/logbook_read_check", engine)

    r = post("logbook-page", "logbook.png", today="2026-11-09")

    assert r.status_code == 200, r.text
    assert asked[0]["today"] == "2026-11-09" and asked[0]["rows"][0]["from"] == "KANE" and asked[0]["rows"][2]["via"] == ["KFCM"]
    entry = r.json()["logbook_check"]["rows"][0]["entry"]
    assert entry["flownOn"] == "2026-10-03" and entry["dayLandings"] == 1 and entry["fromTrack"] is False
    assert r.json()["logbook"]["rows"][0]["from"] == "KANE"


def test_a_clearance_note_comes_back_as_the_controllers_words_and_asks_no_engine(claude, fake_planner):
    said = (
        "Cleared to KDLH via radar vectors GOPHER then as filed, maintain 3000, expect 7000 10 minutes after departure, "
        "departure frequency 125.35, squawk 4521."
    )
    claude({"clearance": {"written": "C KDLH\nRV / GOPHER / AF\nM 3000 E 7000 10\nDEP 125.35\nSQ 4521", "said": said}})

    r = post("clearance", "clearance.png")

    assert r.status_code == 200, r.text
    assert r.json()["clearance"]["said"] == said and fake_planner.calls == []


def test_a_page_the_model_cannot_read_says_why_and_is_not_checked(claude, fake_planner):
    claude({"unreadable": "This is a photo of a cat, not a handbook page."})
    r = post("weight-balance", "weight-balance.png")
    assert r.status_code == 200
    assert r.json()["unreadable"].startswith("This is a photo") and r.json()["handbook_check"] is None
    assert fake_planner.calls == []


def test_the_photo_is_checked_before_the_model_is_asked(claude):
    fake = claude(CLEAN)
    # A PNG called a JPEG, and bytes that are not base64.
    assert post("poh-performance", "cruise.png", media_type="image/jpeg").status_code == 422
    r = client.post("/api/read-document", json={"kind": "clearance", "image": "not base64!" * 20, "media_type": "image/png"})
    assert r.status_code == 422
    # A kind the endpoint does not read.
    assert post("weather-chart", "cruise.png").status_code == 422
    assert fake.calls == []


def test_a_reader_out_of_reach_a_refusal_or_a_cut_off_page_is_a_503(claude):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    claude(anthropic.APIConnectionError(request=request))
    assert post("clearance", "clearance.png").status_code == 503
    claude({"clearance": None}, stop_reason="max_tokens")
    assert "ran out of room" in post("clearance", "clearance.png").json()["detail"]
    claude({"clearance": None}, stop_reason="refusal")
    assert post("clearance", "clearance.png").status_code == 503


def test_the_engine_refusing_the_read_is_a_502(claude, fake_planner):
    claude(CLEAN)
    fake_planner.answer("/api/engine/handbook_read_check", PlannerError(422, "handbook_read_check: \"cruise\" is not an array"))
    r = post("poh-performance", "cruise.png")
    assert r.status_code == 502 and "could not be checked" in r.json()["detail"]


def test_the_route_is_a_signed_in_paid_assistant_call_for_the_gateway():
    operation = app.openapi()["paths"]["/api/read-document"]["post"]
    assert operation["x-gateway"] == {"access": "signed-in", "paid": "ASSISTANT"}
