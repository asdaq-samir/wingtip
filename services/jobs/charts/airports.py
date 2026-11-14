"""The overlay tiles' `airports` layer (charts.overlays), apart from the
other layers so each module stays a size a reader takes in: every
operational field in NASR's APT_BASE.csv with its runways, the class of
airspace at its surface, and the engine's field_mark_rank -- the zoom its
mark is first drawn at, the order marks give way in and the step the mark
is drawn at."""

from __future__ import annotations

from pathlib import Path

from wingtip import field_status

from .overlays import AIRPORT_MIN_ZOOM, _feature, _meets, _number, _rows, runways_by_site

#: NASR's SITE_TYPE_CODE (APT_BASE).
SITE_TYPES = {"A": "airport", "H": "heliport", "C": "seaplane", "G": "gliderport", "U": "ultralight", "B": "balloonport"}


def primaries(pack) -> dict[str, str]:
    """Each Class B and C's primary field, by the FAA identifier the airspace file names it by (IDENT: every
    one a towered field in the 2026-10-29 cycle, 30 B, 123 C), to its highest class: field_mark_rank's first."""
    found: dict[str, str] = {}
    for record in pack.attrs("airspace"):
        ident, cls = (record.get("IDENT") or "").strip().upper(), (record.get("CLASS") or "").strip()
        if ident and cls in ("B", "C") and cls < found.get(ident, "Z"):
            found[ident] = cls
    return found


def _surface_classes(rows: list[dict], shp_path: Path | None) -> list[str | None]:
    """The class of airspace at each field's surface (wingtip.airspace's
    surface_classes: B, C or D reaching the ground, else E in a surface
    area, else G), the ring the map draws round its mark in the chart's
    code; None for each where there is no airspace file."""
    if shp_path is None:
        return [None] * len(rows)
    from wingtip import airspace

    return airspace.surface_classes([(lat, lon) for _, lat, lon in rows], shp_path)


def airport_features(
    apt_path: Path, rwy_path: Path | None, rwy_end_path: Path | None, bbox=None, primary: dict | None = None, shp_path: Path | None = None
):
    """The `airports` layer's lines: every operational field in APT_BASE
    (the engine's field_status: ARPT_STATUS O; CI and CP are not drawn),
    with its runways (runways_by_site), ranked by the engine's
    field_mark_rank with the classes `primary` (primaries) names, and the
    class of airspace at its surface where `shp_path` is the airspace file."""
    from wingtip.engine import ask

    runways = runways_by_site(rwy_path, rwy_end_path) if rwy_path is not None else {}
    fields = []
    for row in _rows(apt_path):
        if not field_status.is_open(row.get("ARPT_STATUS") or ""):
            continue
        lat, lon = _number(row.get("LAT_DECIMAL")), _number(row.get("LONG_DECIMAL"))
        if lat is not None and lon is not None and _meets((lon, lat, lon, lat), bbox):
            fields.append((row, lat, lon))
    for (row, lat, lon), surface in zip(fields, _surface_classes(fields, shp_path)):
        faa_id = (row.get("ARPT_ID") or "").strip().upper()
        icao = (row.get("ICAO_ID") or "").strip().upper()
        site_type = (row.get("SITE_TYPE_CODE") or "").strip()
        use = (row.get("FACILITY_USE_CODE") or "").strip()
        # ATCT, ATCT-A/C, ATCT-TRACON and the rest; NON-ATCT is none.
        towered = (row.get("TWR_TYPE_CODE") or "").strip().upper().startswith("ATCT")
        ways = runways.get((row.get("SITE_NO") or "").strip(), {})
        # The engine's field_military: "military", "joint" (open to the public as well) or None.
        military = field_status.military(row.get("OWNERSHIP_TYPE_CODE"), use)
        hard_ft, primary_of = ways.get("hard_ft", 0), (primary or {}).get(faa_id)
        rank = ask("field_mark_rank", site_type=site_type, use=use, towered=towered, hard_ft=hard_ft, primary_of=primary_of)
        yield _feature(
            {
                "ident": icao or faa_id,
                "faa_id": faa_id,
                "name": (row.get("ARPT_NAME") or "").strip(),
                "type": SITE_TYPES.get(site_type, site_type.lower()),
                # As faa_data: the services' own field "military", not "private", so the Private switch leaves it to the Military one.
                "use": "military" if military == "military" else {"PU": "public", "PR": "private"}.get(use, use.lower()),
                "military": military,
                "towered": towered,
                "airspace": surface,
                "elevation_ft": _number(row.get("ELEV")),
                "longest_ft": ways.get("longest_ft"),
                "hard_ft": ways.get("hard_ft"),
                "runway_true": ways.get("runway_true"),
                "fuel": (row.get("FUEL_TYPES") or "").strip(),
                "rank": rank["order"],
                "size": rank["size"],
            },
            f'{{"type":"Point","coordinates":[{lon},{lat}]}}',
            AIRPORT_MIN_ZOOM[rank["tier"]],
        )
