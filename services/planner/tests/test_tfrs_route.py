"""/api/tfrs, its answer encoded once per list (app.routers.briefing): the
bytes FastAPI wrote for it before, an ETag, a 304 for the list already
held, and a minute's Cache-Control."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from wingtip import tfr

from app.main import app
from app.schemas.briefing import Tfrs

client = TestClient(app)

TFRS = [
    {
        "notam_id": "6/1234",
        "title": "STADIUM",
        "kind": "Security",
        "state": "WI",
        "geometry": {"type": "MultiPolygon", "coordinates": [[[[-88.0, 42.0], [-87.9, 42.0], [-87.9, 42.1], [-88.0, 42.0]]]]},
        "effective": "2026-10-06T23:00:00Z",
        "expires": None,
        "floor_ft": 0,
        "floor_ref": "SFC",
        "ceiling_ft": 3000,
        "ceiling_ref": "AGL",
        "rule": "99.7",
        "purpose": "Ünïcode, as the FAA's text may carry",
    }
]


def _as_fastapi_wrote_it(found: list) -> bytes:
    """The route as it was: the list returned and FastAPI's own response
    model writing it."""
    before = FastAPI()

    @before.get("/api/tfrs")
    def tfrs() -> Tfrs:
        return {"tfrs": found}

    return TestClient(before).get("/api/tfrs").content


def test_the_answer_is_the_bytes_fastapi_wrote_and_is_kept_a_minute(monkeypatch):
    monkeypatch.setattr(tfr, "all_tfrs", lambda: [dict(t) for t in TFRS])
    resp = client.get("/api/tfrs")
    assert resp.status_code == 200 and resp.headers["content-type"] == "application/json"
    assert resp.content == _as_fastapi_wrote_it(TFRS)
    assert resp.headers["cache-control"] == "public, max-age=60"
    again = client.get("/api/tfrs", headers={"If-None-Match": resp.headers["etag"]})
    assert again.status_code == 304 and again.content == b"" and again.headers["etag"] == resp.headers["etag"]


def test_a_new_list_is_new_bytes_and_a_new_etag(monkeypatch):
    monkeypatch.setattr(tfr, "all_tfrs", lambda: [dict(t) for t in TFRS])
    first = client.get("/api/tfrs")
    monkeypatch.setattr(tfr, "all_tfrs", lambda: [])
    second = client.get("/api/tfrs", headers={"If-None-Match": first.headers["etag"]})
    assert second.status_code == 200 and second.json() == {"tfrs": []}
    assert second.headers["etag"] != first.headers["etag"]


def test_a_stored_list_is_encoded_once_a_copy(monkeypatch):
    import time

    from pydantic import TypeAdapter
    from wingtip import weather_store

    from app.routers import briefing

    encoded = []

    class Counting:
        adapter = TypeAdapter(Tfrs)

        def validate_python(self, value, **kwargs):
            return self.adapter.validate_python(value, **kwargs)

        def dump_json(self, value, **kwargs):
            encoded.append(1)
            return self.adapter.dump_json(value, **kwargs)

    monkeypatch.setattr(briefing, "_TFRS", Counting())
    weather_store.write("tfrs", TFRS, fetched_at=time.time(), until=None)
    first, second = client.get("/api/tfrs"), client.get("/api/tfrs")
    assert first.content == second.content == _as_fastapi_wrote_it(TFRS)
    assert len(encoded) == 1
    weather_store.write("tfrs", TFRS[:0], fetched_at=time.time() + 1, until=None)
    assert client.get("/api/tfrs").json() == {"tfrs": []} and len(encoded) == 2
