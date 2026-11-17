"""What the phones' packs are made of: the regions, the simplified rings,
the ground and the special-use sections, each derived from the planner's pack
(wingtip.cycle_pack). wingtip.phone_pack writes the files with them."""

from __future__ import annotations

import struct

import numpy as np

from .cycle_pack import Pack

#: How far the phones' rings may stray from the FAA's, in degrees: each
#: ring is simplified by Douglas and Peucker's method (shapely's simplify),
#: which keeps every point of the simplified ring within this of the
#: file's and every point of the file's within this of it. A degree of
#: latitude is at most 60.4 nm (NIMA TR8350.2's ellipsoid), so an answer
#: can differ from the planner's only within 0.006 nm (37 ft) of the line
#: the FAA draws -- under a tenth of the width of the line a sectional
#: prints at 1:500,000. The NASR file draws its arcs a point every few
#: feet: 199 MB of airspace becomes 11.6 MB (measured 2026-11-02).
PHONE_TOLERANCE_DEG = 0.0001
PHONE_WORST_NM = round(PHONE_TOLERANCE_DEG * 60.4, 4)
#: A phone pack's region: a square of this many degrees, named by its
#: south-west corner ("n44w096"), so a phone keeps the packs its routes
#: cross as it keeps their chart.
REGION_DEG = 4


def region_of(lat: float, lon: float) -> str:
    """The name of the region holding a point: its south-west corner."""
    south = int(np.floor(lat / REGION_DEG)) * REGION_DEG
    west = int(np.floor(lon / REGION_DEG)) * REGION_DEG
    return f"{'n' if south >= 0 else 's'}{abs(south):02d}{'e' if west >= 0 else 'w'}{abs(west):03d}"


def region_bounds(name: str) -> tuple[float, float, float, float]:
    """(west, south, east, north) of a region by its name."""
    south = int(name[1:3]) * (1 if name[0] == "n" else -1)
    west = int(name[4:7]) * (1 if name[3] == "e" else -1)
    return float(west), float(south), float(west + REGION_DEG), float(south + REGION_DEG)


def _rings(wkb: bytes) -> list[list[np.ndarray]]:
    """A little-endian WKB Polygon's or MultiPolygon's rings, polygon by
    polygon, in their order and direction."""

    def polygon(at: int):
        n = struct.unpack_from("<I", wkb, at + 5)[0]
        at += 9
        rings = []
        for _ in range(n):
            m = struct.unpack_from("<I", wkb, at)[0]
            rings.append(np.frombuffer(wkb, "<f8", 2 * m, at + 4).reshape(-1, 2))
            at += 4 + 16 * m
        return rings, at

    if wkb[0] != 1:
        raise ValueError("a big-endian WKB")
    kind = struct.unpack_from("<I", wkb, 1)[0]
    if kind == 3:
        return [polygon(0)[0]]
    if kind != 6:
        raise ValueError(f"WKB type {kind}, not a polygon")
    polygons, at = [], 9
    for _ in range(struct.unpack_from("<I", wkb, 5)[0]):
        rings, at = polygon(at)
        polygons.append(rings)
    return polygons


def _wkb(polygons: list[list[np.ndarray]]) -> bytes:
    def polygon(rings):
        return struct.pack("<BII", 1, 3, len(rings)) + b"".join(
            struct.pack("<I", len(r)) + np.ascontiguousarray(r, "<f8").tobytes() for r in rings
        )

    if len(polygons) == 1:
        return polygon(polygons[0])
    return struct.pack("<BII", 1, 6, len(polygons)) + b"".join(polygon(p) for p in polygons)


def simplified(wkb: bytes, tolerance: float = PHONE_TOLERANCE_DEG) -> tuple[bytes, tuple | None]:
    """The shape's rings each simplified (PHONE_TOLERANCE_DEG), in their
    order and direction, and the box of what is left; a ring too small to
    simplify kept as it is. (WKB, None) where no ring has a point."""
    import shapely

    polygons = []
    for rings in _rings(wkb):
        kept = []
        for ring in rings:
            if len(ring) >= 5:
                line = shapely.simplify(shapely.linestrings(ring), tolerance, preserve_topology=False)
                out = shapely.get_coordinates(line)
                ring = out if len(out) >= 4 else ring
            kept.append(ring)
        polygons.append(kept)
    points = [r for rings in polygons for r in rings if len(r)]
    if not points:
        return _wkb(polygons), None
    every = np.concatenate(points)
    return _wkb(polygons), (float(every[:, 0].min()), float(every[:, 1].min()), float(every[:, 0].max()), float(every[:, 1].max()))


def _regions_of(box) -> list[str]:
    """Every region a box (min lon, min lat, max lon, max lat) meets."""
    w, s, e, n = box
    lats = range(int(np.floor(s / REGION_DEG)), int(np.floor(n / REGION_DEG)) + 1)
    lons = range(int(np.floor(w / REGION_DEG)), int(np.floor(e / REGION_DEG)) + 1)
    return [region_of(a * REGION_DEG, o * REGION_DEG) for a in lats for o in lons]


def _strings(texts: list[str]) -> tuple[list[tuple[int, int]], bytes]:
    """Each text's (offset, length) in one UTF-8 run of them all."""
    spans, run = [], bytearray()
    for t in texts:
        b = (t or "").encode()
        spans.append((len(run), len(b)))
        run += b
    return spans, bytes(run)


_FLOOR_REFS = {"SFC": 0, "AGL": 1, "MSL": 2}
#: A special-use area's heights' references in `sua.alt` (0 none given).
_SUA_REFS = {"SFC": 1, "AGL": 2, "MSL": 3}

#: The phones' ground: wingtip.ground_grid's highest ground, a 120th of a
#: degree a cell, pooled to the highest of each POOL by POOL cells -- a
#: 60th of a degree, a nautical mile north to south -- so a region's is
#: 240 by 240 heights (115 KB). Pooling by the highest keeps it never
#: under the grid it is drawn from: over it by 3 ft at the median, 145 ft
#: at the 90th percentile and 755 at the 99th, on the 22 million cells of
#: the lower 48 (2026-11-02).
TERRAIN_POOL = 2


def _terrain(region: str) -> bytes | None:
    """A region's `terrain` section: 32 bytes -- its south and west edges
    (f64), the cells a degree, its rows and columns (u32), four zeros --
    then each cell's highest ground in feet (i16, row 0 the south, the
    grid's NONE where no tile reached), the ground grid's own heights,
    to which a reader adds its RESAMPLED_MARGIN_FT as wingtip.ground_grid
    does. None where the grid is not built or the region is outside it."""
    from . import ground_grid

    grids = ground_grid._grids()
    if grids is None:
        return None
    high = grids[0]
    west, south, east, north = region_bounds(region)
    if south < ground_grid.SOUTH or north > ground_grid.NORTH or west < ground_grid.WEST or east > ground_grid.EAST:
        return None
    per = ground_grid.PER_DEG
    r0, c0 = round((south - ground_grid.SOUTH) * per), round((west - ground_grid.WEST) * per)
    block = np.asarray(high[r0 : r0 + REGION_DEG * per, c0 : c0 + REGION_DEG * per]).astype(np.int32)
    # A guard, as wingtip.ground_grid now leaves voids and impossible peaks
    # out of its cells: one still above Mount Whitney (a grid built before
    # that, not yet repaired) is no ground known to the phones rather than
    # a 32,000 ft mountain over Florida.
    block[block > ground_grid.HIGHEST_GROUND_FT] = ground_grid.NONE
    rows, cols = block.shape[0] // TERRAIN_POOL, block.shape[1] // TERRAIN_POOL
    tiles = block[: rows * TERRAIN_POOL, : cols * TERRAIN_POOL].reshape(rows, TERRAIN_POOL, cols, TERRAIN_POOL)
    known = tiles != ground_grid.NONE
    pooled = np.where(known, tiles, np.iinfo(np.int32).min).max(axis=(1, 3))
    pooled = np.where(known.any(axis=(1, 3)), pooled, ground_grid.NONE).astype("<i2")
    if (pooled == ground_grid.NONE).all():
        return None
    head = struct.pack("<ddIIII", south, west, per // TERRAIN_POOL, rows, cols, 0)
    return head + pooled.tobytes()


def _sua_alt(areas: list[dict]) -> tuple[bytes, bytes]:
    """`sua.alt`, 32 bytes an area for the alerts ahead (crate::ahead):
    its type (ASCII, NUL-padded to 4: P, R, MOA, W, A), its floor's and
    its ceiling's reference (u8, _SUA_REFS), two zeros, its floor and its
    ceiling in feet (f64, not a number where none is given), and where its
    times of use are in `sua.times` (u32 offset, u32 length)."""
    spans, run = _strings([a.get("times_of_use") or "" for a in areas])
    nan = float("nan")
    rec = b"".join(
        struct.pack(
            "<4sBB2xddII",
            (a["type"] or "").encode()[:4],
            _SUA_REFS.get(a["floor_ref"] or "", 0),
            _SUA_REFS.get(a["ceiling_ref"] or "", 0),
            nan if a["floor_ft"] is None else float(a["floor_ft"]),
            nan if a["ceiling_ft"] is None else float(a["ceiling_ft"]),
            *span,
        )
        for a, span in zip(areas, spans)
    )
    return rec, run


def _controlled_numbers(pack: Pack) -> list[int | None]:
    """Each airspace record's number among the Class B, C and D in the
    national file's order -- what the engine's in-view answer numbers a
    volume's `id` by, so the phone's map keys a volume the same from one
    box to the next -- and None for a Class E."""
    from . import airspace

    numbers: list[int | None] = []
    for a in pack.attrs("airspace"):
        controlled = (a.get("CLASS") or "").strip() in airspace.CONTROLLED_CLASSES
        numbers.append(sum(n is not None for n in numbers) if controlled else None)
    return numbers


def _volume_drawn(record: dict, number: int | None) -> dict:
    """wingtip.airspace_at's volume, with what the phone's map says of a
    volume besides (the engine's in-view answer): its number,
    whether its top is "to but not including" its ceiling (UPPER_DESC
    TNI) and when it is in effect (WKHR_CODE, WKHR_RMK, as wingtip.airspace
    reads them): the phone's `airspace.attr`."""
    from . import airspace, airspace_at

    return {
        **airspace_at._volume(record),
        "number": number,
        "ceiling_excluded": (record.get("UPPER_DESC") or "").strip().upper() == "TNI",
        "hours_code": airspace._text(record.get("WKHR_CODE")),
        "hours_remark": airspace._text(record.get("WKHR_RMK")),
    }


def _phone_shapes(pack: Pack) -> dict:
    """Each layer's shapes for the phones, simplified, with their regions
    and what each region's pack keeps of them."""
    import shapely
    from shapely.geometry.polygon import orient

    from . import sua

    layers = {}
    volumes = [_volume_drawn(a, number) for a, number in zip(pack.attrs("airspace"), _controlled_numbers(pack))]
    shapes = [simplified(w) for w in pack.wkb("airspace")]
    layers["airspace"] = [(w, box, v) for (w, box), v in zip(shapes, volumes)]
    if "sua.attr" in pack.sections:
        # The feature service's polygons, outer rings clockwise and holes
        # counter-clockwise as a shapefile's are: the rule the engine
        # reads rings by (crate::airspace).
        areas = []
        for props, geometry in zip(pack.attrs("sua"), pack.geometries("sua")):
            if geometry.geom_type == "Polygon":
                geometry = orient(geometry, sign=-1.0)
            elif geometry.geom_type == "MultiPolygon":
                geometry = shapely.MultiPolygon([orient(p, sign=-1.0) for p in geometry.geoms])
            else:
                continue
            w, box = simplified(shapely.to_wkb(geometry, byte_order=1))
            areas.append((w, box, sua._area(props or {})))
        layers["sua"] = areas
    if "urban.box" in pack.sections:
        layers["urban"] = [(*simplified(w), None) for w in pack.wkb("urban")]
    return layers
