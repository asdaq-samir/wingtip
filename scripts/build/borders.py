#!/usr/bin/env python3
"""The countries' outlines the engine's `jurisdiction_of` reads
(engine/crates/flight/data/borders.bin), from Natural Earth's admin-0
countries at 1:50m (public domain, naturalearthdata.com; the GeoJSON of
nvkelso/natural-earth-vector v5.1.2, geojson/ne_50m_admin_0_countries.geojson),
and Canada's provinces and territories from its admin-1 states and
provinces at 1:50m (geojson/ne_50m_admin_1_states_provinces.geojson).

The owner's pick of 2026-11-21 (decision 0053): every rule the engine holds
is the FAA's, so a point outside the United States is said to be, and the
outline needs to be right where it matters, at the United States' own edge.
The kept countries: the United States with its territories (Natural
Earth's sovereign US1: the States, Puerto Rico, the US Virgin Islands,
Guam, the Northern Marianas, American Samoa; 14 CFR 1.1's "United States,
in a geographical sense"), and its neighbours a flight from it reaches
first: Canada, Mexico and the Bahamas. Anywhere else is "other".

Each ring is thinned by Douglas-Peucker, finely (0.005 degrees, about a
third of a mile) within half a degree of another kept country's outline,
along the land borders and the narrow waters, where a point's country
decides which rules apply, and coarsely (0.1 degrees, about 6 nm)
elsewhere: on an open coast the 12 nm of territorial sea the engine adds
round the land (jurisdiction.rs) is far wider than that, and away from
the United States the outline only names the country; an island the
coarse thinning would wear down to a line is thinned finely. Canada's Arctic islands under 0.01 square degrees more than half a
degree from another country are left out. Coordinates are kept in
thousandths of a degree, each after a ring's first as the step from the
one before, so the file stays small in the web's WebAssembly.

The file is bytes, read by the engine's borders.rs `read`, a record after
another: "C" and a country's two-letter code, or "P" and a province's;
then each of its rings, "R", its count of points and the points, longitude
then latitude, each number a zigzag LEB128 varint (as protobuf's sint64:
0, -1, 1, -2 ... as 0, 1, 2, 3 ..., seven bits a byte, the low first, the
high bit set on every byte but the last). Most steps are under 64
thousandths, one byte each, where the text it replaced (borders.txt,
77,550 bytes) took three or four.

The provinces only name where in Canada a leg or a field is, "Canada
(Ontario)", so a pilot reads which part of a route is outside the US: the
country, and so the rules, are still the admin-0 outline's. They are thinned
at PROVINCE_TOLERANCE throughout, some 3 nm, which may name the province
next door that near a line between two of them.

The standard library only.

  curl -sSLo ne.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
  curl -sSLo ne1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson
  python3 scripts/build/borders.py ne.geojson ne1.geojson
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "engine/crates/flight/data/borders.bin"
# Natural Earth's code for the country (SOV_A3 for the United States, so its
# territories come with it; ADM0_A3 for the rest) -> the engine's code.
KEPT = {"US1": "US", "CAN": "CA", "MEX": "MX", "BHS": "BS"}
FINE, COARSE = 0.005, 0.1
NEAR_DEG = 0.5
SMALL_ISLAND_DEG2 = 0.05
SCALE = 1000
PROVINCE_TOLERANCE = 0.05


def code_of(props):
    if props["SOV_A3"] == "US1":
        return "US"
    return KEPT.get(props["ADM0_A3"])


def rings_of(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [ring for poly in polys for ring in poly]


def area(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))) / 2


def off_line(p, a, b):
    (x, y), (x0, y0), (x1, y1) = p, a, b
    dx, dy = x1 - x0, y1 - y0
    if dx == dy == 0:
        return ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
    return ((x - x0 - t * dx) ** 2 + (y - y0 - t * dy) ** 2) ** 0.5


def thin(ring, tolerance):
    """Douglas-Peucker with each point's own tolerance, the first and last kept."""
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        i, j = stack.pop()
        far, at = 0.0, None
        for k in range(i + 1, j):
            d = off_line(ring[k], ring[i], ring[j]) / tolerance[k]
            if d > far:
                far, at = d, k
        if at is not None and far > 1.0:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(ring, keep) if k]


def varint(n, out):
    """`n` as a zigzag LEB128 varint onto `out`."""
    z = 2 * n if n >= 0 else -2 * n - 1
    while z >= 0x80:
        out.append(z & 0x7F | 0x80)
        z >>= 7
    out.append(z)


def encode(ring):
    """A ring's record: "R", its count of points, its first point whole and
    each after it the step from the one before (a point the same as the
    one before left out)."""
    pts = [(round(x * SCALE), round(y * SCALE)) for x, y in ring]
    kept = [pts[0]] + [p for p, q in zip(pts[1:], pts) if p != q]
    out = bytearray(b"R")
    varint(len(kept), out)
    (px, py) = (0, 0)
    for x, y in kept:
        varint(x - px, out)
        varint(y - py, out)
        px, py = x, y
    return bytes(out)


def head(kind, code):
    """A country's ("C") or a province's ("P") record."""
    return (kind + code).encode("ascii")


def provinces(path):
    """Canada's provinces and territories, "P <postal code>" and their rings."""
    lines = []
    features = json.loads(Path(path).read_text(encoding="utf-8"))["features"]
    for f in sorted((f for f in features if f["properties"].get("adm0_a3") == "CAN"), key=lambda f: f["properties"]["postal"]):
        lines.append(head("P", f["properties"]["postal"]))
        for ring in rings_of(f["geometry"]):
            ring = [tuple(p) for p in ring]
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            if area(ring) < SMALL_ISLAND_DEG2:
                continue
            kept = thin(ring + [ring[0]], [PROVINCE_TOLERANCE] * (len(ring) + 1))[:-1]
            if len(kept) >= 3:
                lines.append(encode(kept))
    return lines


def main(path, admin1):
    features = json.loads(Path(path).read_text(encoding="utf-8"))["features"]
    countries = {}
    for f in features:
        code = code_of(f["properties"])
        if code:
            countries.setdefault(code, []).extend(rings_of(f["geometry"]))
    # Each country's cells of half a degree holding its outline, for "near
    # another country".
    cells = {c: {(int(x // NEAR_DEG), int(y // NEAR_DEG)) for ring in rings for x, y in ring} for c, rings in countries.items()}

    def near_other(code, x, y):
        cx, cy = int(x // NEAR_DEG), int(y // NEAR_DEG)
        around = {(cx + i, cy + j) for i in (-1, 0, 1) for j in (-1, 0, 1)}
        return any(around & held for other, held in cells.items() if other != code)

    lines = []
    for code in ["US", "CA", "MX", "BS"]:
        lines.append(head("C", code))
        for ring in countries[code]:
            ring = [tuple(p) for p in ring]
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            tolerance = [FINE if near_other(code, x, y) else COARSE for x, y in ring]
            if code == "CA" and FINE not in tolerance and area(ring) < SMALL_ISLAND_DEG2:
                continue
            kept = thin(ring + [ring[0]], tolerance + [tolerance[0]])[:-1]
            # An island the coarse thinning wore down to a line is kept at
            # the fine one: its land, and the 12 nm round it, are still there.
            if len(kept) < 4:
                kept = thin(ring + [ring[0]], [FINE] * (len(ring) + 1))[:-1]
            if len(kept) < 3:
                continue
            lines.append(encode(kept))
    lines += provinces(admin1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(b"".join(lines))
    rings = sum(1 for line in lines if line[:1] == b"R")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size:,} bytes, {rings:,} rings")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
