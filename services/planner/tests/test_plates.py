"""The plate on the map (app.routers.plates) and an approach's drawing with the
CIFP's own figures for its fixes' tags (app.routers.airports)."""

from fastapi.testclient import TestClient
from wingtip import approach_facts, plates, procedures, publications

from app.main import app

client = TestClient(app)

PAGE = {
    "width": 1584,
    "height": 2448,
    "top_left": {"lat": 47.2, "lon": -92.6},
    "top_right": {"lat": 47.2, "lon": -91.5},
    "bottom_right": {"lat": 46.2, "lon": -91.5},
    "bottom_left": {"lat": 46.2, "lon": -92.6},
}


def _placed(tmp_path, page=PAGE):
    picture, whole = tmp_path / "plate.png", tmp_path / "plate-page.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    whole.write_bytes(b"\x89PNG\r\n\x1a\n")
    return {
        "cycle": publications.dtpp_cycle(),
        "name": "RNAV (GPS) RWY 3",
        "south": 46.6,
        "west": -92.5,
        "north": 47.0,
        "east": -91.6,
        "fixes": ["OMARY", "AMLIY", "CLIPH"],
        "circling": True,
        "page": page,
        "png": picture,
        "page_png": whole,
    }


def test_an_approachs_plate_is_placed_on_the_map_and_its_pictures_served(monkeypatch, tmp_path):
    placed = _placed(tmp_path)
    monkeypatch.setattr(plates, "plate_overlay", lambda ident, procedure: placed if procedure == "R03" else None)
    got = client.get("/api/airport/KDLH/procedures/R03/plate")
    assert got.status_code == 200
    assert got.json() == {k: v for k, v in placed.items() if k not in ("png", "page_png")}
    png = client.get(f"/api/approach-plate/{placed['cycle']}/KDLH/R03.png")
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    page = client.get(f"/api/approach-plate-page/{placed['cycle']}/KDLH/R03.png")
    assert page.status_code == 200 and page.headers["content-type"] == "image/png"
    # None placed, or another cycle's: none to show.
    assert client.get("/api/airport/KDLH/procedures/I09/plate").status_code == 404
    assert client.get("/api/approach-plate/2001/KDLH/R03.png").status_code == 404
    assert client.get("/api/approach-plate-page/2001/KDLH/R03.png").status_code == 404


def test_a_plate_whose_page_is_not_placed_has_its_plan_view_alone(monkeypatch, tmp_path):
    placed = {**_placed(tmp_path, page=None), "page_png": tmp_path / "none.png"}
    monkeypatch.setattr(plates, "plate_overlay", lambda ident, procedure: placed)
    assert client.get("/api/airport/KDLH/procedures/R03/plate").json()["page"] is None
    assert client.get(f"/api/approach-plate-page/{placed['cycle']}/KDLH/R03.png").status_code == 404


def test_an_approachs_drawing_carries_the_cifps_figures_for_its_tags(monkeypatch):
    drawn = {
        "airport": "KOSH",
        "kind": "approach",
        "id": "I36",
        "name": "ILS RWY 36",
        "cycle": "261029",
        "lines": [],
        "holds": [],
        "fixes": [],
    }
    facts = {
        "runway": {"ident": "RW36", "lat": 43.963839, "lon": -88.556717, "threshold_ft": 808, "tch_ft": 53, "tdze_ft": 808.5},
        "coded": [{"fix": "POBER", "code": "H", "ft": 2610}],
        "levels": [],
    }
    monkeypatch.setattr(procedures, "procedure_drawing", lambda ident, procedure, transition: drawn)
    monkeypatch.setattr(approach_facts, "approach_facts", lambda ident, procedure: facts)
    got = client.get("/api/airport/KOSH/procedures/I36")
    assert got.status_code == 200
    assert got.json()["approach"] == facts
    # The drawing kept for others is not changed.
    assert "approach" not in drawn
    monkeypatch.setattr(procedures, "procedure_drawing", lambda ident, procedure, transition: {**drawn, "kind": "arrival"})
    assert client.get("/api/airport/KOSH/procedures/I36").json()["approach"] is None
