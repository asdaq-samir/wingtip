"""The stock profiles' list (/api/aircraft-profiles) carries each POH's
demonstrated crosswind, for the map's wind arrows to go red past it for
the picked airplane; none where a profile has none."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_each_stock_profile_carries_its_pohs_demonstrated_crosswind():
    names = {p["name"]: p for p in client.get("/api/aircraft-profiles").json()["profiles"]}
    # The Cessna 172S POH (1998), section 4: 15 kt.
    assert names["c172"]["crosswind"]["demonstrated_kt"] == 15
    assert all(p["crosswind"] is None or p["crosswind"]["demonstrated_kt"] > 0 for p in names.values())
