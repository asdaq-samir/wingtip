"""NASR's fixes and navaids read from its files: FIX_BASE.csv's named
fixes (the RNAV waypoints, reporting points and the sectionals' VFR
waypoints) and NAV_BASE.csv's navaids in service, as wingtip.fixes holds
them and the charts' overlays draw them (jobs/charts/overlays.py)."""

from __future__ import annotations

import csv
from pathlib import Path

from . import geo
from .engine import ask as engine
from .figure import number

#: What a fix is to a pilot, by NASR's FIX_USE_CODE.
KINDS = {
    "VFR": "VFR waypoint",
    "WP": "GPS waypoint",
    "RP": "Reporting point",
    "CN": "Computer navigation fix",
    "MR": "Military reporting point",
    "MW": "Military waypoint",
    "NRS": "Navigation reference system waypoint",
    "RADAR": "Radar fix",
}

#: The charts a VFR waypoint must be on to be one a pilot can see:
#: NASR's CHARTS column.
VFR_CHARTS = {"SECTIONAL", "VFR TERMINAL AREA"}

#: NASR's CHARTS name for the IFR Enroute Low Altitude chart.
ENROUTE_LOW_CHART = "ENROUTE LOW"

#: The navaids the sectional draws as a VOR, by NAV_BASE's NAV_TYPE:
#: the VOR's hexagon, the VOR/DME's in its box and the VORTAC's (FAA
#: Aeronautical Chart User's Guide, VFR Terms and Symbols, Radio Aids to
#: Navigation).
VOR_KINDS = ("VORTAC", "VOR/DME", "VOR")

#: The navaids a route may fly over, by NAV_BASE's NAV_TYPE, in the order
#: one is kept over another of the same ident: not the VOR test facilities
#: (VOT), the fan markers or a marine beacon, which no route flies to.
NAVAID_KINDS = ("VORTAC", "VOR/DME", "VOR", "DME", "TACAN", "NDB/DME", "NDB")


def _read(path: Path) -> dict[str, dict]:
    return {fix["ident"]: fix for fix in read_rows(path)}


def read_rows(path: Path):
    """Every row of FIX_BASE.csv as a fix, in the file's order: an ident
    filed in two places is two fixes here, where the table above keeps
    the last; the map's vector tiles (wingtip.vector_tiles) draw both."""
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            ident = (row.get("FIX_ID") or "").strip().upper()
            try:
                lat, lon = float(row["LAT_DECIMAL"]), float(row["LONG_DECIMAL"])
            except (KeyError, TypeError, ValueError):
                continue
            if not ident:
                continue
            use = (row.get("FIX_USE_CODE") or "").strip()
            charts = {c.strip() for c in (row.get("CHARTS") or "").split(",") if c.strip()}
            # A VFR waypoint a fixed-wing pilot has on a chart: on the
            # sectional or the terminal area chart. NASR files the
            # helicopter routes' waypoints as VFR too -- the line of
            # them across O'Hare (VPDVA to VPDVI) -- and a few no chart
            # carries.
            vfr = use == "VFR" and bool(charts & VFR_CHARTS)
            kind = KINDS.get(use, "Fix")
            if use == "VFR" and not vfr:
                kind = "Helicopter route waypoint" if "HELICOPTER ROUTE" in charts else "Uncharted VFR waypoint"
            yield {
                "ident": ident,
                "lat": lat,
                "lon": lon,
                "kind": kind,
                "vfr": vfr,
                "state": (row.get("STATE_CODE") or "").strip() or None,
                # On the IFR low-altitude enroute chart: the intersections
                # of the airways below 18,000 ft that the map shows close
                # in (enroute_fixes_within), not the approaches' and
                # procedures' thousands no pilot sees on a route chart.
                "enroute_low": ENROUTE_LOW_CHART in charts,
            }


def _station_variation(row: dict) -> float | None:
    """A navaid's own magnetic variation as NASR files it (NAV_BASE's
    MAG_VARN and MAG_VARN_HEMIS, "5" and "E" for Duluth's VORTAC): the
    declination its radials are aligned to, set when it was last flight
    checked, east positive as wingtip.magnetic's; None where it has none."""
    try:
        degrees = float((row.get("MAG_VARN") or "").strip())
    except ValueError:
        return None
    return -degrees if (row.get("MAG_VARN_HEMIS") or "").strip().upper() == "W" else degrees


def _read_navaids(path: Path) -> dict[str, list[dict]]:
    """NAV_BASE's navaids in service, as fixes: "RFD", the Rockford DME,
    named and with its frequency. Every one by each ident, the likelier
    to fly to first (NAVAID_KINDS): 33 idents name navaids in two or more
    places -- "AA" a beacon in North Dakota and another in Georgia -- and
    which is meant is the one by the route (find_navaid). One facility
    filed as two kinds at one place (a VOR/DME and a TACAN) is one."""
    table: dict[str, list[dict]] = {}
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            ident = (row.get("NAV_ID") or "").strip().upper()
            kind = (row.get("NAV_TYPE") or "").strip()
            if not ident or kind not in NAVAID_KINDS or (row.get("NAV_STATUS") or "").strip() == "SHUTDOWN":
                continue
            try:
                lat, lon = float(row["LAT_DECIMAL"]), float(row["LONG_DECIMAL"])
            except (KeyError, TypeError, ValueError):
                continue
            navaid = {
                "ident": ident,
                "lat": lat,
                "lon": lon,
                "kind": kind,
                "vfr": False,
                "navaid": True,
                # A navaid is named for its place: "LA CROSSE", "McCOOK" as
                # a town is spelt (the engine's place_name).
                "name": engine("place_name", text=(row.get("NAME") or "").strip()) or None,
                "freq": (row.get("FREQ") or "").strip() or None,
                "state": (row.get("STATE_CODE") or "").strip() or None,
                "mag_var": _station_variation(row),
                # For its card: the station's height (ELEV, ft MSL), its
                # TACAN or DME channel (CHAN, "70X"), its standard service
                # volume's class (ALT_CODE: T, L, H, VL or VH, AIM 1-1-8),
                # its hours (OPER_HOURS, "24") and whether it is in
                # service with restrictions (NAV_STATUS's "RESTRICTED").
                "elevation_ft": number(row.get("ELEV")),
                "channel": (row.get("CHAN") or "").strip() or None,
                "service_volume": (row.get("ALT_CODE") or "").strip() or None,
                "hours": (row.get("OPER_HOURS") or "").strip() or None,
                "restricted": "RESTRICTED" in (row.get("NAV_STATUS") or "").upper(),
            }
            held = table.setdefault(ident, [])
            here = next(
                (i for i, other in enumerate(held) if geo.distance_nm(lat, lon, other["lat"], other["lon"]) < SAME_FACILITY_NM), None
            )
            if here is None:
                held.append(navaid)
            elif NAVAID_KINDS.index(kind) < NAVAID_KINDS.index(held[here]["kind"]):
                held[here] = navaid
    for held in table.values():
        held.sort(key=lambda navaid: NAVAID_KINDS.index(navaid["kind"]))
    return table


#: How close two navaids by one ident are to be one facility filed twice.
SAME_FACILITY_NM = 1.0
