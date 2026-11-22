"""The FAA's terminal procedures (the d-TPP, wingtip.publications) a device
keeps for flying with no signal, in the two sets the apps offer:

- a flight's (`for_flight`, Keep for the Air): the departure's, the
  destination's, each stop's and the alternate's plates -- the one filed,
  or where none is, the engine's pick of those that will do (14 CFR
  91.169(c), wingtip.alternates) -- and those of the fields within
  diversion range of the route, the engine's `diversion_range_nm` from
  the airplane's own cruise and fuel; which charts each field keeps is the
  engine's `plates_kept`;
- a state's (`by_state`, `state_charts`, Downloads): every field the
  d-TPP files under the state, as the charts' regions are kept by state.

Each answer names the d-TPP cycle its charts are of and when the next
takes over (the engine's `data_cycle`, 0901Z on the AIRAC date), so a
device fetches a state again then. The plates themselves are fetched as
the airport card's Charts tab fetches them (/api/faa-chart and its
pages' pictures), so a kept plate is shown by the same viewer.

A closed field is never in either set (decision 0043): NASR's status, the
engine's `field_status`, through the US table (wingtip.airport_us).
"""

from __future__ import annotations

import logging

import numpy as np

from . import alternates, data_cycles, geo, publications, weather
from .airport_tables import DEFAULT_CACHE_PATH
from .airport_us import _us_airports
from .engine import ask as engine

log = logging.getLogger(__name__)

#: The bytes a device keeps of a chart, about: one page's picture as the
#: planner draws it (publication_drawing's DIAGRAM_SCALE). Measured over
#: the 61 pages of cycle 2611 drawn on the owner's Mac on 2026-11-21: a
#: mean of 371,806 bytes. Most charts are one page; a size is said as
#: "about" in the apps.
CHART_BYTES = 372_000

#: The route sampled every this many nm to measure how far a field is
#: off it: a field's distance is then within half of it of the true one.
STEP_NM = 5.0


def _open_fields() -> dict:
    """{FAA ident: (the ident the app shows, lat, lon)} of every open field
    the FAA lists, closed ones left out (`_closed`, decision 0043)."""
    us = _us_airports(DEFAULT_CACHE_PATH)
    us = us[us["_closed"].isna()] if "_closed" in us.columns else us
    found = {}
    for local, shown, lat, lon in zip(us["local_code"], us["_display_ident"], us["latitude_deg"], us["longitude_deg"]):
        if isinstance(local, str) and local.strip():
            found.setdefault(local.strip().upper(), (str(shown), float(lat), float(lon)))
    return found


def _faa(ident: str) -> str:
    """A field's FAA ident: KSFO's is SFO, C81's its own."""
    return publications._faa_idents(ident)[-1]


def _next_at() -> str:
    """When the d-TPP cycle after this one takes over, 0901Z on its date."""
    return data_cycles.cycle("airac")["next_at"]


def by_state() -> dict:
    """The states whose plates can be kept, each with its fields' and
    charts' count and its size, about; of the cycle the cards show."""
    cycle, states = publications.states()
    opened = _open_fields()
    listed = []
    for code, entry in sorted(states.items()):
        fields = [i for i in entry["idents"] if i in opened]
        charts = sum(len(publications.terminal_charts(i)) for i in fields)
        if charts:
            listed.append({"id": code, "name": entry["name"], "fields": len(fields), "charts": charts, "bytes": charts * CHART_BYTES})
    return {"cycle": cycle, "next_at": _next_at(), "state": publications.editions()["plates"]["state"], "states": listed}


def state_charts(cycle: str, code: str) -> dict | None:
    """A state's open fields and each one's charts, of `cycle`; None where
    `cycle` is not the one served or the state files no plates."""
    held, states = publications.states()
    entry = states.get(code.strip().upper())
    if held != cycle or entry is None:
        return None
    opened = _open_fields()
    fields = []
    for ident in entry["idents"]:
        if ident in opened and (charts := publications.terminal_charts(ident)):
            fields.append({"ident": opened[ident][0], "charts": charts})
    return {"cycle": cycle, "next_at": _next_at(), "id": code.upper(), "name": entry["name"], "fields": fields}


def _picked_alternate(dest: str, at: tuple, eta: float, tas_kt: float | None) -> str | None:
    """The first of the fields that will do as the destination's alternate
    (91.169(c), the engine's ranking), reached at the airplane's own
    cruise; None with no cruise, or where the weather cannot be had."""
    if not tas_kt or tas_kt <= 0:
        return None
    try:
        found = alternates.nearby(at, dest, lambda lat, lon: eta + geo.distance_nm(*at, lat, lon) / tas_kt * 3600, limit=1)
    except weather.WeatherServiceError:
        log.warning("No alternate picked for %s: the weather could not be had", dest)
        return None
    return found[0]["ident"] if found else None


def _off_route_nm(path: list, fields: dict, range_nm: float) -> dict:
    """{FAA ident: nm off the route} of the open fields within `range_nm`."""
    if not fields:
        return {}
    lats, lons = geo.path_points(path, STEP_NM)
    idents = list(fields)
    flat = np.array([fields[i][1] for i in idents])
    flon = np.array([fields[i][2] for i in idents])
    off = np.asarray(geo.distance_nm(flat[:, None], flon[:, None], lats[None, :], lons[None, :])).min(axis=1)
    return {i: round(float(d), 1) for i, d in zip(idents, off) if d <= range_nm}


def for_flight(
    route: list, path: list, alternate: str | None, eta: float, tas_kt: float | None, usable_gal: float | None, burn_gph: float | None
) -> dict:
    """The plates Keep for the Air keeps for a flight over `route` (its
    fields in order, departure to destination) flown along `path`
    [(lat, lon), ...], arriving at `eta` (Unix seconds)."""
    reach = engine("diversion_range_nm", tas_kt=tas_kt, usable_gal=usable_gal, burn_gph=burn_gph)
    dest = route[-1]
    picked = None
    if not alternate:
        at = path[-1]
        alternate = picked = _picked_alternate(dest, at, eta, tas_kt)
    roles = [(route[0], "departure"), (dest, "destination"), *((s, "stop") for s in route[1:-1])]
    if alternate:
        roles.append((alternate, "alternate"))
    asked = [{"ident": ident, "role": role, "charts": publications.terminal_charts(ident)} for ident, role in roles]
    if reach["range_nm"]:
        opened = _open_fields()
        own = {_faa(i) for i, _ in roles}
        # Only the fields the d-TPP files plates for, some 3,000 of the
        # 20,000 the FAA lists, are measured.
        filed = {i for entry in publications.states()[1].values() for i in entry["idents"]}
        with_plates = {i: f for i, f in opened.items() if i in filed and i not in own}
        for ident, off in _off_route_nm(path, with_plates, reach["range_nm"]).items():
            charts = publications.terminal_charts(ident)
            if charts:
                asked.append({"ident": opened[ident][0], "role": "diversion", "off_nm": off, "charts": charts})
    kept = engine("plates_kept", range_nm=reach["range_nm"], fields=asked)
    charts = sum(len(f["charts"]) for f in kept)
    cycle = publications.editions()["plates"]
    return {
        **reach,
        "cycle": cycle["edition"],
        "state": cycle["state"],
        "next_at": _next_at(),
        "alternate": alternate,
        "alternate_picked": picked is not None,
        "fields": kept,
        "charts": charts,
        "bytes": charts * CHART_BYTES,
    }
