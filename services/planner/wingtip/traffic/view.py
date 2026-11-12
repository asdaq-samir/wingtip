"""The map's traffic round a point: adsb.lol's region, ADS-B Exchange where it turns us away, the
watched airplanes and the FAA's radar merged, set on the nearest altimeter setting."""

from __future__ import annotations

import numpy as np

from .. import weather
from ..engine import ask as engine
from ..geo import distance_nm
from .common import TrafficUnavailable, _LOCK, _clock
from .adsb_lol import ADSB_LOL_SOURCE, MAX_RADIUS_NM, _FROM_ADSBX, _REGIONS, _covering, _region, _region_answer
from .adsbx import ADSBX_SOURCE, _adsbx
from .radar import _elsewhere_near, looked_at
from .watched import _WATCH_SOURCE, _watched_near


def near(lat: float, lon: float, radius_nm: float) -> dict:
    """The airplanes in the air within `radius_nm` (at most 165) of a
    point, as `_aircraft` gives each, and `age_s`, how many seconds before
    now they were where they are given (each `seen_s` more): {"aircraft",
    "age_s"}. Raises TrafficUnavailable where adsb.lol has not answered
    for a minute."""
    radius = min(MAX_RADIUS_NM, radius_nm)
    # Where the FAA's radar is worth reading (ingest asks radar_wanted).
    looked_at(lat, lon, radius)
    region = _region(lat, lon, radius)
    credit: dict = {}
    try:
        at, planes = _region_answer(region)
        with _LOCK:
            if region in _FROM_ADSBX:
                credit = ADSBX_SOURCE
    except TrafficUnavailable:
        # A view panned into a region not asked about yet while adsb.lol
        # waits out a refusal, or behind other regions' turns, was a 503
        # and "Traffic isn't available" over the map (the owner's, over
        # Indiana, 2026-10-11). Another region's answer that holds the
        # whole view -- the wide one it was zoomed out from, the one next
        # door -- is given instead, with its age.
        covering = _covering(lat, lon, radius)
        if covering is None:
            # None to give: ADS-B Exchange asked for the region instead,
            # kept as adsb.lol's answer would be, and credited.
            asked = _clock()
            planes = _adsbx(f"lat/{region[0]:.2f}/lon/{region[1]:.2f}/dist/{min(250, region[2])}")
            with _LOCK:
                _REGIONS[region] = (asked, planes)
                _FROM_ADSBX.add(region)
            covering = (asked, planes)
            credit = ADSBX_SOURCE
        at, planes = covering
    if planes:
        lats = np.array([p["lat"] for p in planes])
        lons = np.array([p["lon"] for p in planes])
        nm = distance_nm(lat, lon, lats, lons)
        planes = [p for p, d in zip(planes, nm) if d <= radius]
    # An airplane whose card is open and that adsb.lol does not hear (a UAT
    # airplane ADS-R rebroadcasts), from its own asks: on the map with the
    # rest, whose its report was credited with the region's.
    have = {p["hex"].lower() for p in planes}
    watched = _watched_near(lat, lon, radius, have)
    if watched:
        with _LOCK:
            whose = {_WATCH_SOURCE.get(p["hex"].lower(), ADSBX_SOURCE["source"]) for p in watched}
        base = (credit or ADSB_LOL_SOURCE)["source"]
        named = [base, *sorted(whose - {base})]
        credit = {**(credit or ADSB_LOL_SOURCE), "source": " and ".join(named)}
    # And the FAA's terminal radar's (ingest, services/ingest): every airplane with a
    # transponder its STARS facilities track, which no ADS-B network may hear.
    radar = _elsewhere_near(lat, lon, radius, have | {p["hex"] for p in watched})
    return {"aircraft": on_altimeter(planes + watched + radar, lat, lon), "age_s": round(_clock() - at, 1), **credit}


#: How far the METAR whose altimeter setting corrects the view's pressure
#: altitudes may be, nm: a view a state wide is under one setting to within
#: a few hundredths of an inch, a few tens of feet.
ALTIMETER_NM = 100.0


def on_altimeter(planes: list[dict], lat: float, lon: float) -> list[dict]:
    """The airplanes that send only their pressure altitude (`alt_baro`,
    the FAA's radar's Mode C: 29.92 inHg, 14 CFR 91.217(a)(2)) set on the
    nearest METAR's altimeter setting, as an altimeter there reads them --
    about 1,000 ft an inch of mercury (FAA-H-8083-25C ch. 11, Figure 11-3)
    -- so they compare with own ship's height above sea level: an airplane
    level with it on a 30.42 day read about 460 ft above. Left as sent, and
    marked so, with no setting near (the engine's traffic_marks then widens
    its near band for them)."""
    if not any(p.get("pressure_altitude") and p.get("altitude_ft") is not None for p in planes):
        return planes
    try:
        near = weather.nearest_report(lat, lon, within_nm=ALTIMETER_NM)
    except weather.WeatherServiceError:
        return planes
    setting = ((near or {}).get("metar") or {}).get("altimeter_in_hg")
    if not setting:
        return planes
    # Pressure altitude is the field's height plus the standard atmosphere's
    # height of 29.92 above the setting (the engine's pressure_altitude_ft):
    # at a field at sea level it is the setting's own shift, the other way.
    shift = -engine("pressure_altitude_ft", elevation_ft=0.0, altimeter_inhg=setting)
    return [
        {**p, "altitude_ft": round(p["altitude_ft"] + shift), "pressure_altitude": False}
        if p.get("pressure_altitude") and p.get("altitude_ft") is not None
        else p
        for p in planes
    ]
