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

The georeference itself goes with it (`georeference`), for the full
screen plate to draw the pilot's position on (the owner, 2026-11-13: "Can
the current position show on the plate when in full screen as well?"):
the engine's plate_page_point works the exact inverse from it, where the
four corners would give only an approximate one.
"""

from __future__ import annotations

import io

from PIL import Image


def _box(box: tuple) -> dict:
    left, bottom, right, top = box
    return {"left": left, "bottom": bottom, "right": right, "top": top}


def georeference(geo, page: tuple, plan_view: tuple, insets: list) -> dict:
    """The plate's georeference as the engine's plate_page_point takes it:
    the Lambert projection's parameters, degrees ("lat_0", "lon_0",
    "lat_1", "lat_2", as the GeoPDF's WKT names them); "to_page", the
    affine [a, b, c, d, e, f] from the projection's metres on NAD 83's
    GRS 80 ellipsoid, with no false easting or northing, to the page's
    points from its bottom left (x = a*E + b*N + c, y = d*E + e*N + f),
    the inverse wingtip.plates.Georeference.page_of works; the page's
    size in points; and the plan view's box in points with the boxes cut
    from it (the airport sketch's, plates.corner_boxes), the only part
    of the page drawn to scale."""
    (a, b, c), (d, e, f) = geo.ground_to_page[:2]
    p = geo.projection
    return {
        "lat_0": p["Latitude_Of_Origin"],
        "lon_0": p["Central_Meridian"],
        "lat_1": p["Standard_Parallel_1"],
        "lat_2": p["Standard_Parallel_2"],
        "to_page": [float(v) for v in (a, b, c, d, e, f)],
        "width_pt": page[0],
        "height_pt": page[1],
        "plan_view": _box(plan_view),
        "insets": [_box(i) for i in insets],
    }


def page_picture(image: Image.Image, geo, page: tuple, plan_view: tuple, insets: list) -> tuple[bytes, dict]:
    """The whole page's picture (PNG bytes, greyscale on white) and where
    it goes: {"width", "height" (its pixels), "top_left", "top_right",
    "bottom_right", "bottom_left" (each {"lat", "lon"}, the picture's
    corners on the ground), "georeference" (above)}. `geo` is the plate's
    Georeference, `page` its size in points, (width, height), its origin
    at the bottom left, and `plan_view` and `insets` its plan view's box
    and the boxes cut from it, (left, bottom, right, top) in points."""
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
        "georeference": georeference(geo, page, plan_view, insets),
    }
