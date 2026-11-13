"""GET /api/route-check: a route checked as a typed one is, nothing planned."""

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import plan

client = TestClient(app)


def test_a_whole_route_is_loaded_and_its_stops_come_back_in_the_planners_form(monkeypatch):
    loaded = []
    monkeypatch.setattr(plan, "load_route", lambda dep, dest, stops: loaded.append((dep, dest, stops)))
    resp = client.get("/api/route-check", params={"dep": "C81", "dest": "KDLH", "stops": "krhi, kjvl"})
    assert resp.status_code == 200 and resp.json() == {"stops": ["KRHI", "KJVL"]}
    assert loaded == [("C81", "KDLH", "krhi, kjvl")]


def test_with_an_end_missing_each_ident_is_checked_alone(monkeypatch):
    looked = []
    monkeypatch.setattr(plan, "resolve", lambda *idents: looked.extend(idents))

    def missing(ident):
        raise HTTPException(404, f"No US airport goes by {ident!r}.")

    monkeypatch.setattr(plan, "resolve_stop", missing)
    assert client.get("/api/route-check", params={"dest": "KMSN"}).json() == {"stops": []}
    assert looked == ["KMSN"]
    assert client.get("/api/route-check", params={"dest": "KMSN", "stops": "ZZZZ"}).status_code == 404
