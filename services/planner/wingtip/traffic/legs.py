"""Where a flight heard on ADS-B starts and ends: a run of reports cut
into flights, the field each one left and landed at, and whether a
recorded track starts at its takeoff (the engine's track_left_from), for
wingtip.traffic.flights' history and the alerts' status."""

from __future__ import annotations

from .. import airports, geo
from ..engine import ask as engine

#: No report for this long, s, ends a flight: the airplane landed out of
#: the receivers' hearing (a small airplane low over a field often is)
#: and went again later.
LEG_GAP_S = 10 * 60
#: A flight's first or last report this near a landing field, nm, and
#: this little above its elevation, ft, is a takeoff from it or a landing
#: at it: low near a field where the receivers stopped or started hearing it.
FIELD_NEAR_NM = 5.0
FIELD_ABOVE_FT = 2000.0
#: Further out and higher, a report still is, where the airplane was
#: coming down to it (its last) or going up from it (its first): receivers
#: lose a small airplane well before it lands. N654FL's LWM to LCI on
#: 2026-10-11 was last heard 3,000 ft over Laconia, coming down.
FIELD_APPROACH_NM = 10.0
FIELD_APPROACH_FT = 3500.0
#: Coming down or going up: this fast, ft/min, or headed this near
#: straight at it or away from it, degrees (a light airplane levels off
#: for its pattern).
FIELD_APPROACH_FPM = 200.0
FIELD_APPROACH_DEG = 30.0
#: A flight shorter than this, s, is a blip, not a flight.
LEG_MIN_S = 120


def _field_at(point: dict, landing: bool) -> dict | None:
    """The landing field a flight's first or last (`landing`) report is at:
    one within FIELD_NEAR_NM, the report on the ground or within
    FIELD_ABOVE_FT of its elevation; or within FIELD_APPROACH_NM and
    FIELD_APPROACH_FT, coming down to it or going up from it. None where it
    was heard first or last on its way somewhere."""
    rate = point.get("vrate_fpm") or 0.0
    sloping = rate <= -FIELD_APPROACH_FPM if landing else rate >= FIELD_APPROACH_FPM
    track = point.get("track_deg")
    # The US's fields, then -- none of them near -- the rest of the
    # world's, so a flight abroad is named by its own airports (the owner
    # saw "— → —" for a Vueling A320 on 2026-10-12).
    near = airports.nearest(point["lat"], point["lon"], limit=3)
    if not near or near[0]["distance_nm"] > FIELD_APPROACH_NM:
        near = airports.nearest_abroad(point["lat"], point["lon"], limit=3)
    for field in near:
        if field["distance_nm"] > FIELD_APPROACH_NM:
            break
        above = None if point["alt_ft"] is None else point["alt_ft"] - (field.get("elevation_ft") or 0.0)
        close = field["distance_nm"] <= FIELD_NEAR_NM and (above is None or above <= FIELD_ABOVE_FT)
        # `bearing_deg` is from the report to the field: a landing heads along it, a takeoff away.
        toward = (field["bearing_deg"] if landing else field["bearing_deg"] + 180) % 360
        headed = track is not None and geo.angle_between(track, toward) <= FIELD_APPROACH_DEG
        if close or ((sloping or headed) and above is not None and above <= FIELD_APPROACH_FT):
            return {"ident": field["ident"], "name": field.get("name"), "city": field.get("municipality"), "region": field.get("region")}
    return None


def _legs(points: list[dict]) -> list[list[dict]]:
    """A run of points cut into flights: at readsb's own new leg, at a
    stretch on the ground, and at a silence of LEG_GAP_S; the points on the
    ground at either end kept, as the takeoff's and the landing's place."""
    legs, leg = [], []
    for point in points:
        gap = leg and point["t"] - leg[-1]["t"] > LEG_GAP_S
        landed = leg and point["alt_ft"] is None and any(p["alt_ft"] is not None for p in leg)
        if leg and (point["new_leg"] or gap):
            legs.append(leg)
            leg = []
        leg.append(point)
        if landed:
            legs.append(leg)
            leg = [point]
    if leg:
        legs.append(leg)
    flown = []
    for leg in legs:
        air = [p for p in leg if p["alt_ft"] is not None]
        if len(air) >= 2 and air[-1]["t"] - air[0]["t"] >= LEG_MIN_S:
            flown.append(leg)
    return flown


def _left_from(first: dict) -> dict | None:
    """The field a recorded track starts at, where it starts there: close
    to the nearest field and low over it, just off the ground (the
    engine's track_left_from, from AC 90-66C's departure). A track
    recorded from when a card was opened mostly starts in the air on the
    way somewhere -- N3429J's, opened over Burlington at 2,000 ft, was said
    to have left KBUU where it had left C81 -- and its departure is then
    not known."""
    if first.get("alt_ft") is None:
        return None
    for field in airports.nearest(first["lat"], first["lon"], limit=1):
        above = first["alt_ft"] - (field.get("elevation_ft") or 0.0)
        if engine("track_left_from", distance_nm=field["distance_nm"], above_ft=above)["left"]:
            return {"ident": field["ident"], "name": field.get("name"), "at": round(first["t"])}
    return None
