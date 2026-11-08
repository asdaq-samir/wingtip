"""The atmosphere the planner's Python still reads, the engine's
(wingtip_flight::flight), and the service ceiling on the day.

The airplane's performance in the day's air -- its cruise at an altitude,
its climbs, the reference altitude its figures are at -- moved into the
engine with the nav log (wingtip_flight::performance, #482 phase 4):
`performance_cruise`, `performance_climb` and `performance_reference_ft`
by name.
"""
from .engine import ask as engine

# The altitudes the halving below searches from: below the lowest field.
_LOWEST_FT = -2000.0


def isa_temp_c(altitude_ft: float) -> float:
    """A standard day's temperature at a pressure altitude (ICAO Doc 7488),
    the engine's."""
    return engine("isa_temp_c", altitude_ft=altitude_ft)


def density_ratio(altitude_ft: float, oat_c: float) -> float:
    """Sigma: the air's density at a pressure altitude and temperature,
    over a standard day's at sea level -- the engine's."""
    return engine("density_ratio", altitude_ft=altitude_ft, oat_c=oat_c)


def density_altitude_ft(sigma: float) -> float:
    """The altitude at which a standard day's air has density sigma."""
    return engine("density_altitude_ft", sigma=sigma)


def altitude_at_density_altitude(density_altitude: float, temp_at) -> float:
    """The altitude whose density altitude is `density_altitude` in air
    whose temperature at an altitude is `temp_at(altitude_ft)` -- where
    the service ceiling is on the day. Density altitude rises with
    altitude in any air an airplane flies in, so it is found by halving.

    TODO(phase3): the engine has this (wingtip_flight::performance::
    altitude_at_density_altitude); the altitude selection asks it here,
    with the forecast's temperatures as a function, until it moves into
    the engine itself and this copy is deleted."""
    low, high = _LOWEST_FT, density_altitude + 10000.0
    for _ in range(40):
        mid = (low + high) / 2
        if density_altitude_ft(density_ratio(mid, temp_at(mid))) < density_altitude:
            low = mid
        else:
            high = mid
    return (low + high) / 2
