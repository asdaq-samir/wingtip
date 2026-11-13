"""Configurable aircraft performance profiles.

Altitude selection needs a service ceiling to check against, but that
number varies enormously by aircraft type -- so it's never hardcoded,
only ever a parameter loaded from a plain JSON profile.
"""

import json
from functools import lru_cache
from pathlib import Path

DEFAULT_PROFILE_DIR = Path(__file__).resolve().parents[3] / "data" / "aircraft"

# What the nav log cannot be worked out without: the ceiling for the
# altitude selection, the airspeed and burn for every leg. Checked when a
# profile is loaded, so a file missing one is refused by name here rather
# than failing leg by leg further in (wingtip.navlog.assemble_leg used to be
# the first place anything noticed).
REQUIRED_FIELDS = {"service_ceiling_ft", "cruise_tas_kt", "fuel_burn_gph"}


@lru_cache(maxsize=32)
def _load(path_str: str) -> dict:
    """The disk read and the validation, cached by resolved path. Every
    caller of load_aircraft_profile -- planning.py's aircraft_profile --
    gets called on every plan or nav log request, for one of a handful of checked-in JSON files that only
    change on a deploy. A ValueError is not cached: lru_cache never
    remembers an exception, so a fixed file is picked up on the next call
    without needing a restart.
    """
    with open(path_str) as f:
        profile = json.load(f)
    missing = REQUIRED_FIELDS - profile.keys()
    if missing:
        raise ValueError(f"{path_str} is missing required field(s): {missing}")
    return profile


@lru_cache(maxsize=1)
def _profile_files() -> dict:
    return {path.stem: path for path in DEFAULT_PROFILE_DIR.glob("*.json")}


def profile_path(name: str) -> Path | None:
    """The stock profile's file by its bare name ("c172"); None for any
    other name. Looked up among the files there are rather than joined
    onto the directory, so a name from a request -- one with a suffix was
    opened as a path of its own (CodeQL's py/path-injection) -- only ever
    picks one of them."""
    return _profile_files().get(name)


def load_aircraft_profile(name_or_path) -> dict:
    """`name_or_path` can be a bare profile name (e.g. "c172", resolved
    against data/aircraft/c172.json) or a full path to a JSON file.

    A fresh dict every call, cache hit or not: planning.py's
    aircraft_profile() overrides cruise_tas_kt/fuel_burn_gph/
    usable_fuel_gal on the dict it gets back, in place -- handing out
    the cached object itself would let a pilot's own aeroplane numbers
    on one request leak into the stock profile every other pilot gets
    next. All the fields are scalars (checked against
    data/aircraft/*.json), so a shallow copy is enough.
    """
    path = Path(name_or_path)
    if not path.suffix:
        path = DEFAULT_PROFILE_DIR / f"{path.name}.json"
    return dict(_load(str(path)))


class UnknownAircraft(ValueError):
    """No stock profile goes by the name asked: the planner answers it a
    422 (app.main), raised by aircraft_profile below."""


#: The name a pilot's own airplane of no stock type is asked by: its
#: profile is its record's figures alone, with no stock airplane under
#: them (the owner, 2026-11-09: nothing assumes a Cessna 172). A figure
#: its record lacks is then missing, and each rule that needs it says so
#: rather than taking another airplane's.
OWN_AIRPLANE = "own"


def aircraft_profile(
    name: str,
    cruise_tas_kt: float | None = None,
    fuel_burn_gph: float | None = None,
    usable_fuel_gal: float | None = None,
    climb_tas_kt: float | None = None,
    climb_fuel_burn_gph: float | None = None,
    descent_ias_kt: float | None = None,
    descent_fuel_burn_gph: float | None = None,
    cruise_power_pct: float | None = None,
    service_ceiling_ft: float | None = None,
    climb_rate_fpm: float | None = None,
    taxi_fuel_gal: float | None = None,
    glide_ratio: float | None = None,
) -> dict:
    """One of data/aircraft's profiles, with a pilot's own aeroplane's
    numbers on top when given: the profile supplies the service ceiling
    the altitude selection needs unless the pilot set their own, the
    overrides supply what the legs, their climbs and the fuel check need.

    `name` OWN_AIRPLANE is a pilot's own airplane of no stock type: the
    figures given alone, its cruise speed and burn required (every leg's
    time and fuel), the rest left out where not given -- no ceiling, no
    climb, no start and taxi allowance, no glide, no loading -- never a
    stock profile's in their place."""
    if name == OWN_AIRPLANE:
        if cruise_tas_kt is None or fuel_burn_gph is None:
            raise UnknownAircraft("A pilot's own airplane is planned on its own cruise speed and fuel burn: give both.")
        profile: dict = {"type": None}
    else:
        # One of the stock profiles by its bare name, never a path: the name
        # is the request's, and the loader opens one with a suffix as it is.
        path = profile_path(name)
        if path is None:
            raise UnknownAircraft(f"No aircraft profile is named {name!r}.")
        profile = load_aircraft_profile(path)
    overrides = {
        "cruise_tas_kt": cruise_tas_kt,
        "fuel_burn_gph": fuel_burn_gph,
        "usable_fuel_gal": usable_fuel_gal,
        "climb_tas_kt": climb_tas_kt,
        "climb_fuel_burn_gph": climb_fuel_burn_gph,
        "descent_ias_kt": descent_ias_kt,
        "descent_fuel_burn_gph": descent_fuel_burn_gph,
        "cruise_power_pct": cruise_power_pct,
        "service_ceiling_ft": service_ceiling_ft,
        "climb_rate_fpm_sea_level": climb_rate_fpm,
        "taxi_fuel_gal": taxi_fuel_gal,
    }
    profile.update({k: v for k, v in overrides.items() if v is not None})
    if glide_ratio is not None:
        # The pilot's own still-air glide ratio, from their handbook's
        # Section 3, over the profile's: its best-glide speed, where the
        # profile has one, stays the book's.
        profile["glide"] = {**(profile.get("glide") or {}), "ratio": glide_ratio}
    return profile
