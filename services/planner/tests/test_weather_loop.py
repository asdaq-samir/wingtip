"""/api/weather/loop: the radar or satellite loop's frames, from the times
the weather service stored (wingtip.weather_loop)."""

import time

from fastapi.testclient import TestClient
from wingtip import weather_store

from app.main import app

client = TestClient(app)


def test_the_radar_loop_is_twelve_frames_with_their_tiles():
    weather_store.write("radar", {"valid": "2026-11-09T21:20:00Z"}, fetched_at=time.time(), until=None)
    resp = client.get("/api/weather/loop", params={"kind": "radar"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "radar" and len(body["frames"]) == 12
    assert body["frames"][-1]["valid"] == "2026-11-09T21:20:00Z"
    assert body["frames"][-1]["radar_tiles"].endswith("USCOMP-N0Q-202611092120/{z}/{x}/{y}.png")


def test_a_kind_not_offered_is_refused():
    assert client.get("/api/weather/loop", params={"kind": "lightning"}).status_code == 422
