"""A field's pictures and charts: its diagram, the FAA's charts by edition,
its procedures and its photos (app.routers.airport_charts)."""

from fastapi.testclient import TestClient
from wingtip import airport_photos, airports, pattern, publication_drawing, publication_pages, publications

from app.main import app

from .airport_world import stub_place

client = TestClient(app)


def test_the_diagram_is_a_picture_kept_for_its_cycle_and_none_for_another(monkeypatch, tmp_path):
    picture = tmp_path / "00125AD.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(
        publication_drawing, "airport_diagram_png", lambda ident, cycle: picture if (ident, cycle) == ("KDLH", "2610") else None
    )
    answer = client.get("/api/airport-diagram/2610/KDLH.png")
    assert answer.status_code == 200
    assert answer.headers["content-type"] == "image/png"
    assert answer.headers["cache-control"] == "public, max-age=2419200, immutable"
    assert answer.content == b"\x89PNG\r\n\x1a\n"
    assert client.get("/api/airport-diagram/2609/KDLH.png").status_code == 404


def test_an_faa_charts_pages_are_listed_and_drawn_for_its_edition(monkeypatch, tmp_path):
    page = {"source": "dtpp", "edition": "2610", "pdf": "EC3TO.PDF", "page": 33, "width": 1935, "height": 2970}
    monkeypatch.setattr(
        publication_pages,
        "chart_pages",
        lambda url, ident: [page] if (url, ident) == ("https://aeronav.faa.gov/d-tpp/2610/EC3TO.PDF", "KMSN") else None,
    )
    answer = client.get("/api/faa-chart", params={"url": "https://aeronav.faa.gov/d-tpp/2610/EC3TO.PDF", "airport": "KMSN"})
    assert answer.status_code == 200
    assert answer.json() == {"pages": [page]}
    assert answer.headers["cache-control"] == "public, max-age=2419200, immutable"
    assert client.get("/api/faa-chart", params={"url": "https://example.com/x.pdf"}).status_code == 404

    picture = tmp_path / "EC3TO-33.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(
        publication_pages,
        "chart_page_png",
        lambda source, edition, pdf, n: picture if (source, edition, pdf, n) == ("dtpp", "2610", "EC3TO.PDF", 33) else None,
    )
    drawn = client.get("/api/faa-chart/page/dtpp/2610/EC3TO.PDF/33.png")
    assert drawn.status_code == 200 and drawn.headers["content-type"] == "image/png"
    assert client.get("/api/faa-chart/page/dtpp/2610/EC3TO.PDF/34.png").status_code == 404

    # The FAA not answering is a 502, which the edge does not keep; a bad address is the 404.
    def down(*args):
        raise publications.FaaUnreachable("down")

    monkeypatch.setattr(publication_pages, "chart_pages", down)
    monkeypatch.setattr(publication_pages, "chart_page_png", down)
    assert client.get("/api/faa-chart", params={"url": "https://aeronav.faa.gov/d-tpp/2610/EC3TO.PDF"}).status_code == 502
    assert client.get("/api/faa-chart/page/dtpp/2610/EC3TO.PDF/33.png").status_code == 502


def test_the_diagrams_runways_are_its_crop_with_the_fields_ends(monkeypatch, tmp_path):
    stub_place(
        monkeypatch,
        runways=[
            {
                "ends": "09/27",
                "end_headings": [("09", 90.0), ("27", 270.0)],
                "length_ft": 10162,
                "width_ft": 150,
                "surface": "CON",
                "lighted": True,
                "closed": False,
            }
        ],
    )
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir=None: {"9": (46.84, -92.21), "27": (46.84, -92.17)})
    asked = []
    picture = tmp_path / "00125AD-runways.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(
        publication_drawing,
        "airport_diagram_runways_png",
        lambda ident, cycle, ends: asked.append((ident, cycle, ends)) or (picture if cycle == "2610" else None),
    )
    answer = client.get("/api/airport-diagram/2610/runways/KDLH.png")
    assert answer.status_code == 200 and answer.headers["cache-control"] == "public, max-age=2419200, immutable"
    assert asked == [("KDLH", "2610", [(46.84, -92.21), (46.84, -92.17)])]
    assert client.get("/api/airport-diagram/2609/runways/KDLH.png").status_code == 404


def test_a_fields_procedures_are_listed_and_one_drawn_from_the_cifp(monkeypatch):
    from wingtip import procedures

    listed = {
        "airport": "KBUR",
        "cycle": "261001",
        "stale": False,
        "procedures": [
            {"kind": "approach", "id": "I08-Y", "name": "ILS Y RWY 08", "runway": "08", "transitions": ["LAX"], "runway_transitions": []}
        ],
    }
    drawn = {
        "airport": "KBUR",
        "kind": "approach",
        "id": "I08-Y",
        "name": "ILS Y RWY 08",
        "transition": "LAX",
        "cycle": "261001",
        "stale": False,
        "lines": [{"role": "transition", "name": "LAX", "points": [[33.93, -118.43], [34.2, -118.61]]}],
        "holds": [{"fix": "SILEX", "turn": "R", "inbound_deg": 91, "missed": False, "points": [[34.2, -118.61], [34.19, -118.6]]}],
        "fixes": [
            {
                "ident": "SILEX",
                "lat": 34.2,
                "lon": -118.61,
                "roles": ["IAF"],
                "min_ft": 3700,
                "max_ft": None,
                "speed_kt": None,
                "missed": False,
            }
        ],
    }
    asked = []
    monkeypatch.setattr(procedures, "procedures_at", lambda ident: listed if ident == "KBUR" else None)

    def drawing(ident, proc, transition=None):
        asked.append((ident, proc, transition))
        return drawn if proc == "I08-Y" else None

    monkeypatch.setattr(procedures, "procedure_drawing", drawing)

    assert client.get("/api/airport/KBUR/procedures").json() == listed
    # A field with none has an empty list, not a 404: most small ones.
    none = client.get("/api/airport/C81/procedures").json()
    assert none["airport"] == "C81" and none["procedures"] == []
    got = client.get("/api/airport/KBUR/procedures/I08-Y", params={"transition": "LAX"})
    assert got.status_code == 200 and got.json()["holds"][0]["fix"] == "SILEX"
    assert asked == [("KBUR", "I08-Y", "LAX")]
    assert client.get("/api/airport/KBUR/procedures/I99").status_code == 404


def test_the_procedures_say_when_the_faas_file_cannot_be_had(monkeypatch):
    from wingtip import procedures

    def unreachable(ident):
        raise RuntimeError("Download of the CIFP failed")

    monkeypatch.setattr(procedures, "procedures_at", unreachable)
    got = client.get("/api/airport/KBUR/procedures")
    assert got.status_code == 503 and "could not be had" in got.json()["detail"]


def test_an_airports_photos_are_its_aerial_and_its_wikipedia_photo(monkeypatch):
    stub_place(monkeypatch)
    monkeypatch.setattr(airports, "wikipedia_link", lambda ident: "https://en.wikipedia.org/wiki/Duluth_International_Airport")
    photo = {
        "url": "https://upload.wikimedia.org/d.jpg",
        "width": 900,
        "height": 675,
        "credit": "A. Pilot",
        "license": "CC BY 2.0",
        "source_url": None,
    }
    monkeypatch.setattr(airport_photos, "ground_photo", lambda ident, link: photo if link else None)
    body = client.get("/api/airport/KDLH/photos").json()
    # The photo served from the planner, as the aerial is.
    assert body == {"aerial_url": "/api/planner/airport-aerial/KDLH.jpg", "photo": {**photo, "url": "/api/planner/airport-photo/KDLH.jpg"}}


def test_the_aerial_is_a_picture_and_a_usgs_outage_a_503(monkeypatch, tmp_path):
    stub_place(monkeypatch)
    picture = tmp_path / "KDLH.jpg"
    picture.write_bytes(b"\xff\xd8jpeg")
    monkeypatch.setattr(airport_photos, "aerial", lambda ident, lat, lon, ends: picture)
    response = client.get("/api/airport-aerial/KDLH.jpg")
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"

    def down(ident, lat, lon, ends):
        raise airport_photos.PhotoUnavailable("the USGS is down")

    monkeypatch.setattr(airport_photos, "aerial", down)
    assert client.get("/api/airport-aerial/KDLH.jpg").status_code == 503
