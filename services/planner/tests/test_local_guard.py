"""The planner answers the gateway and its own machine's tools, and no web
page: not one on a rebound name, nor one on another site (app.local_guard)."""

from fastapi.testclient import TestClient

from app import local_guard
from app.main import app

client = TestClient(app)


def test_the_gateway_and_the_machine_are_answered():
    for host in ("planner:8000", "localhost:8084", "127.0.0.1:8084", "[::1]:8084", "testserver"):
        assert client.get("/", headers={"Host": host}).status_code == 200, host


def test_a_rebound_name_is_not():
    # A page's own name answering 127.0.0.1 makes the planner its origin:
    # refused, so it can neither name a pilot nor read the answer.
    answer = client.get("/api/checkpoint-notes/mine", headers={"Host": "rebind.attacker.example:8084", "X-Pilot-Id": "1"})
    assert answer.status_code == 403


def test_another_sites_page_is_not():
    # A form post or a no-cors fetch from any site open on the Mac.
    assert client.post("/api/retrain", headers={"Host": "127.0.0.1:8084", "Origin": "https://attacker.example"}).status_code == 403
    assert client.get("/", headers={"Host": "localhost:8084", "Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get("/", headers={"Host": "localhost:8084", "Origin": "null"}).status_code == 403


def test_the_planners_own_pages_are():
    # Its /docs, trying a call out: same origin.
    assert local_guard.allows({"host": "localhost:8084", "origin": "http://localhost:8084", "sec-fetch-site": "same-origin"})
    assert not local_guard.allows({"host": "localhost:8084", "origin": "http://localhost:8080"})
    assert not local_guard.allows({})
