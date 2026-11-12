"""The GFS's winds and temperatures aloft at the old FB stations, by
period (the weather service's "winds-06", "-12", "-24",
services/weather/app/gfs.py): what a plan flies past the end of the map's
winds-aloft grid (wingtip.winds_aloft), whose timeline runs twelve hours
ahead while these run to twenty-seven, and what the forecast run and the
map's station winds read. Moved from wingtip.weather (its size).

The FB itself is gone (NWS Service Change Notice 26-47: its bulletins
ended with the NAM at 1200Z on 3 Nov 2026), so these are the winds aloft
said to be modelled wherever they are shown.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from . import weather, weather_store
from .engine import ask


class FdStations(dict):
    """The winds and temperatures aloft at each station ({station_id:
    {altitude_ft: {"wind_dir_true_deg", "wind_speed_kt", "temp_c"}}}), and
    the period they are for: `period` is {"valid_at", "use_from",
    "use_to", "run", "forecast_hour"}, ISO UTC and the GFS forecast hour
    (services/weather/app/gfs.py's period_of)."""

    period: dict | None = None
    #: Model output, not an issued forecast: always so since the FB ended.
    modelled: bool = False


# Each period's FdStations, made once per record: fcst_hr -> (record, stations).
_FD: dict = {}


def fd_stations(fcst_hr: str = "06") -> FdStations:
    """The winds and temperatures aloft for one period, as the weather
    service stored them: the GFS's levels at the old FB stations. The
    altitude plans look the winds up at every legal altitude of every leg
    -- well over a hundred lookups for one route -- so the record is
    turned into an FdStations once per copy, never per lookup.
    WeatherServiceError, in a pilot's words, where no copy inside its own
    window is held (the record's `until`, the engine's rule for when a
    winds forecast stops counting, validity.rs)."""
    weather_store.mark_asked()
    record = weather_store.read(f"winds-{fcst_hr}")
    if not weather_store.servable(record):
        raise weather.WeatherServiceError("Winds aloft (GFS model) unavailable from NOAA just now")
    held = _FD.get(fcst_hr)
    if held is not None and held[0] is record:
        return held[1]
    out = FdStations({code: {int(alt): level for alt, level in levels.items()} for code, levels in record.data["stations"].items()})
    out.period = record.data["period"]
    out.modelled = True
    _FD[fcst_hr] = (record, out)
    return out


# The FD stations' own rows of the airports table, per set of station
# ids: filtering 80,000 rows for the same two hundred stations on every
# wind lookup was the other half of what a plan cost.
_STATION_ROWS: dict = {}


def station_rows(station_ids, airports_df):
    key = (frozenset(station_ids), id(airports_df))
    rows = _STATION_ROWS.get(key)
    if rows is None:
        # local_code isn't globally unique (e.g. "MSP" also matches
        # airports in Argentina and Colombia by coincidence) -- FD
        # stations are US-only, so restrict the match accordingly.
        candidates = airports_df[airports_df["local_code"].isin(station_ids) & (airports_df["iso_country"] == "US")]
        rows = (
            candidates["local_code"].to_numpy(),
            np.radians(candidates["latitude_deg"].to_numpy(dtype=float)),
            np.radians(candidates["longitude_deg"].to_numpy(dtype=float)),
        )
        _STATION_ROWS[key] = rows
    return rows


def nearest_station(lat: float, lon: float, station_ids, airports_df) -> str | None:
    codes, lats, lons = station_rows(station_ids, airports_df)
    if len(codes) == 0:
        return None
    # Great-circle distance to every station at once, the same formula
    # as wingtip.geo.distance_nm; the radius cancels out of an argmin.
    lat0, lon0 = np.radians(lat), np.radians(lon)
    a = np.sin((lats - lat0) / 2) ** 2 + np.cos(lat0) * np.cos(lats) * np.sin((lons - lon0) / 2) ** 2
    return str(codes[int(np.argmin(a))])


def _levels_near(lat: float, lon: float, fcst_hr: str) -> dict | None:
    from . import airports

    stations = fd_stations(fcst_hr)
    station_id = nearest_station(lat, lon, set(stations.keys()), airports.load_airports())
    return None if station_id is None else stations[station_id]


def temperatures_aloft(lat: float, lon: float, fcst_hr: str = "06") -> list:
    """The nearest station's forecast temperatures, [(altitude_ft,
    temp_c)] from the lowest level up -- the GFS's 925 hPa, about 2,500 ft
    (services/weather/app/gfs.py), each at its own height. Empty where no
    station is found or it reports no temperature."""
    return _profile(_levels_near(lat, lon, fcst_hr))


def _profile(levels: dict | None) -> list:
    if levels is None:
        return []
    return sorted((float(alt), v["temp_c"]) for alt, v in levels.items() if v["temp_c"] is not None)


def air_at(lat: float, lon: float, altitudes: list, fcst_hr: str = "06") -> list[dict]:
    """The wind (wind_at_altitude) and the temperature (temperatures_aloft
    read at the altitude, weather.temperature_at) at each of `altitudes`,
    [{"wind", "temp_c"}]: the nearest station found once for them all,
    not twice an altitude, the figures each the same."""
    if not altitudes:
        return []
    levels = _levels_near(lat, lon, fcst_hr)
    profile = _profile(levels)
    return [
        {"wind": None if levels is None else wind_in_levels(levels, ft), "temp_c": weather.temperature_at(profile, ft)} for ft in altitudes
    ]


def wind_at_altitude(lat: float, lon: float, altitude_ft: float, fcst_hr: str = "06") -> dict | None:
    """The nearest station's wind at `altitude_ft` (wind_in_levels); None
    where no station is found -- no wind known, not calm."""
    levels = _levels_near(lat, lon, fcst_hr)
    return None if levels is None else wind_in_levels(levels, altitude_ft)


def wind_in_levels(levels: dict, altitude_ft: float) -> dict | None:
    """One FD station's wind at altitude_ft from its levels ({altitude:
    {"wind_dir_true_deg", "wind_speed_kt", ...}}): the engine's (winds.rs
    wind_at_altitude) -- interpolated between the levels either side,
    clamped at the ends, light and variable left out; None with no usable
    level."""
    return ask("wind_at_altitude", levels={str(alt): level for alt, level in levels.items()}, altitude_ft=altitude_ft)


def wind_points(box: tuple, fcst_hr: str, altitudes: list) -> list[dict]:
    """Every FD station's wind at each of `altitudes`, [{"lat", "lon",
    "winds": [[dir, kt] or None]}] -- the whole lot, as the engine's route
    options take the nearest to each cell (`box` is the grid's, unused
    here: the stations are few)."""
    from . import airports

    stations = fd_stations(fcst_hr)
    codes, lats, lons = station_rows(set(stations.keys()), airports.load_airports())
    out = []
    for lat, lon, code in zip(np.degrees(lats), np.degrees(lons), codes):
        winds = []
        for alt in altitudes:
            wind = wind_in_levels(stations[str(code)], float(alt))
            winds.append([wind["wind_dir_true_deg"], wind["wind_speed_kt"]] if wind else None)
        out.append({"lat": float(lat), "lon": float(lon), "winds": winds})
    return out


def winds_period(fcst_hr: str = "06") -> dict | None:
    """The period the winds a plan flies are for (FdStations.period), with
    `modelled` and the label the nav log says ("NOAA GFS, 12Z +18 h"):
    None where they cannot be had."""
    try:
        stations = fd_stations(fcst_hr)
    except weather.WeatherServiceError:
        return None
    period = getattr(stations, "period", None)
    if not period:
        return None
    run = _utc(period["run"]) if period.get("run") else None
    label = "NOAA GFS" + (f", {run:%H}Z +{period.get('forecast_hour')} h" if run else "")
    return {**period, "modelled": stations.modelled, "source": "gfs-stations", "label": label, "fallback": False, "stale": False}


def station_period_for(depart: datetime | None) -> str:
    """The stations' period for a departure time -- now, when none is
    given. A naive time is taken as UTC, the way the API documents.

    The product whose own "for use" window holds the departure: each of
    the 6-, 12- and 24-hour forecasts is to be used between the FOR USE
    times its header gives, set by the clock, not by hours ahead
    (FAA-H-8083-28B Table 27-2). Planned at 1400Z for 2230Z, eight and a
    half hours out, the hours-ahead rule flew the 6-hour product (for use
    1400-2100Z) where the 12-hour one (2100-0600Z) applies. The rule by
    hours stays where no header can be read."""
    if depart is None:
        return weather.forecast_hour(None)
    if depart.tzinfo is None:
        depart = depart.replace(tzinfo=timezone.utc)
    for fcst_hr in weather_store.WIND_PERIODS:
        period = weather.winds_period(fcst_hr)
        if period and _utc(period["use_from"]) <= depart < _utc(period["use_to"]):
            return fcst_hr
    return weather.forecast_hour((depart - datetime.now(timezone.utc)).total_seconds() / 3600)


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))
