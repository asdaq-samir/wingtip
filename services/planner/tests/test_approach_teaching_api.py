"""POST /api/approach/lesson, /api/approach/debriefs and its transition,
on KBUR's ILS Y RWY 08 as the planner draws it (the web's shared fixture
apps/web/src/lib/fixtures/approachKbur.json). The rules, their figures
and their words are the engine's, each boundary tested there
(engine/facade/tests/approach); these hold the endpoints to carrying the
drawings, the track and the pilot's picks across, and to the way the
lesson's airplane flies between its steps."""

import json
import math
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from wingtip import geo

client = TestClient(app)

KBUR = json.loads((Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/approachKbur.json").read_text())
ILS, ILS_LAX, RNAV = KBUR["I08-Y"], KBUR["I08-Y:LAX"], KBUR["R08-Z"]
#: A second of flight at 120 kt, nm.
STEP_NM = 120 / 3600
EARTH_FT = 6_371_000 * 3.28084
T0 = 1_793_372_400_000


def _final(drawing: dict) -> list[tuple[float, float]]:
    """The final as a line to fly, from 2 nm before its first fix on the course into it."""
    line = [tuple(p) for line in drawing["lines"] if line["role"] == "final" for p in line["points"]]
    back = geo.bearing_deg(*line[1], *line[0])
    return [tuple(float(x) for x in geo.destination_point(*line[0], back, 2.0)), *line]


def _ils_ft(to_go_nm: float) -> float:
    """The ILS flown as charted: 3,700 to SILEX, 3,000 to the glide slope,
    then down it (its angle over the curved earth) to the runway."""
    gp = ILS["runway_path"]
    d = to_go_nm * 6076.12
    return min(gp["ft"] + d * math.tan(math.radians(gp["deg"])) + d * d / (2 * EARTH_FT), 3700 if to_go_nm > 11 else 3000)


def _flown(line: list[tuple[float, float]], climb_after_s: int = 12) -> list[dict]:
    """The line flown a point a second, then two minutes on past its end,
    level for `climb_after_s` and then climbing 1,000 ft a minute."""
    lats, lons = geo.path_points(line, STEP_NM)
    total = sum(geo.distance_nm(*a, *b) for a, b in zip(line, line[1:]))
    points = [
        {"t": T0 + i * 1000, "lat": float(la), "lon": float(lo), "alt_ft": _ils_ft(max(total - i * STEP_NM, 0.0))}
        for i, (la, lo) in enumerate(zip(lats, lons))
    ]
    course, end, floor = geo.bearing_deg(*line[-2], *line[-1]), line[-1], ILS["runway_path"]["ft"]
    for k in range(1, 121):
        lat, lon = geo.destination_point(*end, course, k * STEP_NM)
        alt = floor + max(0, k - climb_after_s) * 1000 / 60
        points.append({"t": points[-1]["t"] + 1000, "lat": float(lat), "lon": float(lon), "alt_ft": alt})
    return points


def test_the_lesson_is_briefed_flown_with_the_way_to_each_step_and_asked_back():
    answer = client.post("/api/approach/lesson", json={"drawing": ILS, "gs_kt": 90, "vso_kt": 48})
    assert answer.status_code == 200, answer.text
    lesson = answer.json()
    assert lesson["brief"] and lesson["quiz"] and lesson["profile"]["marks"]
    steps = [s for s in lesson["steps"] if s["at"]]
    # The first put at its place; each after flown from the one before's to its own.
    assert steps[0]["way"] == [steps[0]["at"]]
    for before, step in zip(steps, steps[1:]):
        assert step["way"][0] == before["at"] and step["way"][-1] == step["at"]
    # The descent on the path at the speed asked, in the step's words.
    faster = client.post("/api/approach/lesson", json={"drawing": ILS, "gs_kt": 120}).json()
    assert [s["say"] for s in faster["steps"]] != [s["say"] for s in lesson["steps"]]


def test_an_ils_flown_is_found_the_one_picked_winning_and_its_missed_approach_timed():
    track = _flown(_final(ILS))
    found = client.post("/api/approach/debriefs", json={"drawings": [RNAV, ILS], "points": track}).json()
    assert len(found) == 1
    assert found[0]["outcome"]["kind"] == "missed"
    assert 10 <= found[0]["outcome"]["seconds_after_map"] <= 14
    picked = client.post("/api/approach/debriefs", json={"drawings": [ILS, RNAV], "points": track, "picked": "R08-Z"}).json()
    assert picked[0]["id"] == "R08-Z"
    far = [{**p, "lat": p["lat"] + 1} for p in track]
    assert client.post("/api/approach/debriefs", json={"drawings": [ILS], "points": far}).json() == []


def test_the_minimums_typed_reach_the_findings():
    track = _flown(_final(ILS))
    plain = client.post("/api/approach/debriefs", json={"drawings": [ILS], "points": track}).json()[0]
    held = client.post("/api/approach/debriefs", json={"drawings": [ILS], "points": track, "minimums_ft": 1000}).json()[0]
    assert [f for f in held["findings"] if f.get("minimums")] != [f for f in plain["findings"] if f.get("minimums")]


def test_a_straight_in_from_vectors_came_by_no_transition():
    track = _flown(_final(ILS))
    vectors = client.post("/api/approach/debriefs", json={"drawings": [ILS], "points": track}).json()[0]
    ask = {"faf_at": vectors["faf_at"], "passed": vectors["way_in"]["passed"], "drawings": [ILS_LAX], "points": track}
    answer = client.post("/api/approach/debriefs/transition", json=ask)
    assert answer.status_code == 200, answer.text
    assert answer.json() is None
