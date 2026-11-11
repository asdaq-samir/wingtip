"""An approach plate's whole page on the map, as ForeFlight lays a plate on
its chart (the owner, 2026-11-11, with ForeFlight's KOSH ILS or LOC RWY 36
on the map): the page solid white, placed so its plan view sits where the
plate's own georeference puts it (wingtip.plates.Georeference), its other
parts -- the briefing strip, the profile, the minimums, the airport
sketch -- round it at the same scale and turn. Only the plan view is to
scale with the ground; the rest of the page goes where the same placing
puts it, which is the convention, and no part of it is a chart to
navigate by: the plate in the d-TPP is that.

The page is the picture wingtip.plates renders for the plan view, whole:
greyscale, PLATE_SCALE dots a point, its white kept. Its four corners go
on the ground by the page's georeference, an affine picture of the
plate's Lambert projection (ISO 32000-2 12.9), so the page may turn a
little from north up, as the projection's meridians lean; the map draws
it between the four corners, not in a latitude-longitude box.
"""

from __future__ import annotations

import io

from PIL import Image


def page_picture(image: Image.Image, geo, page: tuple) -> tuple[bytes, dict]:
    """The whole page's picture (PNG bytes, greyscale on white) and where
    it goes: {"width", "height" (its pixels), "top_left", "top_right",
    "bottom_right", "bottom_left" (each {"lat", "lon"}, the picture's
    corners on the ground)}. `geo` is the plate's Georeference and `page`
    its size in points, (width, height), its origin at the bottom left."""
    width, height = page
    out = io.BytesIO()
    image.save(out, "PNG", optimize=True)

    def corner(x: float, y: float) -> dict:
        lat, lon = geo.ground_of(x, y)
        return {"lat": round(lat, 6), "lon": round(lon, 6)}

    return out.getvalue(), {
        "width": image.width,
        "height": image.height,
        "top_left": corner(0.0, height),
        "top_right": corner(width, height),
        "bottom_right": corner(width, 0.0),
        "bottom_left": corner(0.0, 0.0),
    }
