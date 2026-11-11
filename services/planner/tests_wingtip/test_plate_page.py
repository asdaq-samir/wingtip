"""wingtip.plate_page: an approach plate's whole page placed on the map by the
plate's own georeference, its plan view where the FAA's points put it."""

import io

import pytest
from PIL import Image

from wingtip import plate_page, plates
from tests_wingtip.test_plates import KRFD_I07

#: A d-TPP page, 5.5 by 8.5 inches, in points.
PAGE = (396.0, 612.0)


def test_the_page_goes_between_its_corners_on_the_ground():
    geo = plates.georeference_of(b"%PDF-1.7 ... " + KRFD_I07 + b" ... %%EOF")
    image = Image.new("L", (int(PAGE[0] * 4), int(PAGE[1] * 4)), 255)
    png, placed = plate_page.page_picture(image, geo, PAGE)
    assert Image.open(io.BytesIO(png)).size == (1584, 2448)
    assert (placed["width"], placed["height"]) == (1584, 2448)
    # Each corner is the page's corner put on the ground by the plate's
    # georeference: the bottom left the page's origin, the top right its
    # far corner.
    lat, lon = geo.ground_of(0.0, 0.0)
    assert placed["bottom_left"] == {"lat": pytest.approx(lat, abs=1e-6), "lon": pytest.approx(lon, abs=1e-6)}
    lat, lon = geo.ground_of(*PAGE)
    assert placed["top_right"] == {"lat": pytest.approx(lat, abs=1e-6), "lon": pytest.approx(lon, abs=1e-6)}
    # North up near enough: the top is north of the bottom, the right east
    # of the left, at the plan view's 1:500,000 (8.5 inches, about 58 nm).
    assert placed["top_left"]["lat"] > placed["bottom_left"]["lat"] + 0.9
    assert placed["top_right"]["lon"] > placed["top_left"]["lon"]
    # The viewport's own point, a tenth in from its bottom left, falls
    # inside the page's corners.
    assert placed["bottom_left"]["lat"] < 41.68814609406 < placed["top_left"]["lat"]
    assert placed["bottom_left"]["lon"] < -89.54178783614 < placed["bottom_right"]["lon"]
