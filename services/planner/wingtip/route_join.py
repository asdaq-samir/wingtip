"""A route's hops joined into the route: the course line drawn between two
points, the hops' altitude selections joined into one, and the totals of
the hops' figures."""

import math

from . import geo


def course_line(start: tuple, end: tuple, step_nm: float = 5.0) -> list:
    """The course line as [[lat, lon], ...], following the great circle, a
    point at most `step_nm` apart, both ends the points given.

    On the geodesic itself (geo.great_circle_points), in one vectorised
    ask of the engine: stepping with the bearing worked out again at every
    point took two engine calls a step, some 120 for a 300 nm leg (the
    reuse audit of 2026-11-23, M8). Holding the first bearing instead
    would trace a rhumb-like path a couple of miles off true course
    mid-leg, and checkpoints placed by great-circle cross-track distance
    would show off a line drawn so.
    """
    total = geo.distance_nm(start[0], start[1], end[0], end[1])
    lats, lons = geo.great_circle_points(start, end, math.ceil(total / step_nm) + 1)
    return [[float(lat), float(lon)] for lat, lon in zip(lats, lons)]


def route_line(r) -> list:
    """The course line of a route with any number of stops: each hop's
    great circle (course_line) in turn, a stop once where two meet."""
    points: list = []
    for hop in r.hops:
        hop_line = course_line(hop.start, hop.end)
        points += hop_line if not points else hop_line[1:]
    return points


def _least(values):
    known = [v for v in values if v is not None]
    return min(known) if known else None


def _either(values) -> bool | None:
    """True where any is, unknown where any is unknown, False otherwise:
    a hop's "could not be checked" must not read as the route's "fine"."""
    values = list(values)
    return True if any(v is True for v in values) else None if any(v is None for v in values) else False


def join_selections(selections: list[dict], offsets: list[float]) -> dict:
    """One altitude breakdown for a route with stops, from each hop's
    (wingtip.altitude.select_cruise_altitude): the hops' segments in turn,
    along the whole route, with what they cross; and the route-wide
    figures the most limiting of the hops', as a hop's are the most
    limiting of its legs' -- the highest floor, the lowest ceilings and
    cloud. Legal for the whole route is what is legal on every hop. The
    magnetic course is the first hop's, the one flown out on."""
    if len(selections) == 1:
        return selections[0]

    def shifted(items, keys, offset):
        return [{**item, **{k: round(item[k] + offset, 1) for k in keys if item.get(k) is not None}} for item in items]

    special_use, legs_before = [], 0
    for sel, offset in zip(selections, offsets):
        for area in sel.get("special_use", []):
            special_use.append(
                {
                    **area,
                    "along_track_nm": round(area["along_track_nm"] + offset, 1),
                    "legs": [i + legs_before for i in area.get("legs", [])],
                }
            )
        legs_before += len(sel.get("segments", []))
    clouds = [(sel["cloud_base_ft"], sel.get("cloud_station")) for sel in selections if sel.get("cloud_base_ft") is not None]
    cloud_base_ft, cloud_station = min(clouds) if clouds else (None, None)
    candidates = sorted(set.intersection(*(set(sel.get("candidates_ft", [])) for sel in selections)))

    def least(key):
        return _least(sel.get(key) for sel in selections)

    def either(key):
        return _either(sel.get(key) for sel in selections)

    return {
        **selections[0],
        "recommended_ft": candidates[0] if candidates else None,
        "candidates_ft": candidates,
        "hemispheric_rule_from_ft": least("hemispheric_rule_from_ft"),
        "floor_ft": max(sel["floor_ft"] for sel in selections),
        "service_ceiling_ft": least("service_ceiling_ft"),
        "cloud_base_ft": cloud_base_ft,
        "cloud_station": cloud_station,
        "cloud_ceiling_ft": least("cloud_ceiling_ft"),
        "cloud_clearance_kept": all(sel.get("cloud_clearance_kept", True) for sel in selections),
        "airspace_transits": [
            t for sel, offset in zip(selections, offsets) for t in shifted(sel.get("airspace_transits", []), ("along_track_nm",), offset)
        ],
        "special_use": special_use,
        "freezing_level_ft": least("freezing_level_ft"),
        "freezing_level_at_or_below": any(sel.get("freezing_level_at_or_below") for sel in selections),
        "icing_possible": either("icing_possible"),
        "band_ceiling_ft": least("band_ceiling_ft"),
        "min_ceiling_ft": least("min_ceiling_ft"),
        "min_visibility_sm": least("min_visibility_sm"),
        "hazards": list({h.get("raw") or repr(h): h for sel in selections for h in sel.get("hazards", [])}.values()),
        "low_ceiling_or_visibility": either("low_ceiling_or_visibility"),
        "weather_unavailable": sorted({w for sel in selections for w in sel.get("weather_unavailable", [])}),
        "segments": [
            seg for sel, offset in zip(selections, offsets) for seg in shifted(sel.get("segments", []), ("from_nm", "to_nm"), offset)
        ],
        "mountainous": any(sel.get("mountainous") for sel in selections),
    }


def route_totals(per_hop: list[dict], hops: list) -> dict:
    """The trip's sums for a route that lands on the way, from each
    flight's own (flight_totals) -- each from one landing to the next --
    and each with its own fuel check: the tanks are filled at every
    stop, so one check over the whole trip would mean nothing -- the
    route's own fuel figures are left out, and `hops` holds each one's.
    A route with no landings on the way is its one flight's."""
    if len(per_hop) == 1:
        return per_hop[0]

    def total(key):
        values = [t[key] for t in per_hop]
        return None if any(v is None for v in values) else round(sum(values), 1)

    return {
        "distance_nm": round(sum(t["distance_nm"] for t in per_hop), 1),
        "procedure_nm": round(sum(t.get("procedure_nm", 0.0) for t in per_hop), 1),
        "ete_min": total("ete_min"),
        "fuel_gal": total("fuel_gal"),
        # The fuel on board at engine start, the departure's: its loading.
        "on_board_gal": per_hop[0].get("on_board_gal"),
        "unflyable_legs": sum(t["unflyable_legs"] for t in per_hop),
        "legs_without_wind": sum(t["legs_without_wind"] for t in per_hop),
        "night": _either(t.get("night") for t in per_hop),
        "night_passengers": _either(t.get("night_passengers") for t in per_hop),
        "lights": _either(t.get("lights") for t in per_hop),
        "rules": per_hop[0].get("rules", "vfr"),
        "alternate": per_hop[-1].get("alternate"),
        "planned_at": per_hop[0].get("planned_at"),
        "winds": per_hop[0].get("winds"),
        "hops": [{"departure": hop.dep_ident, "destination": hop.dest_ident, "totals": t} for hop, t in zip(hops, per_hop)],
    }
