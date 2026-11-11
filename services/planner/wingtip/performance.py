"""The atmosphere the planner's Python still reads, the engine's
(wingtip_flight::flight). The service ceiling on the day is the engine's
too (`service_ceiling_on_the_day`, which wingtip.altitude asks).

The airplane's performance in the day's air -- its cruise at an altitude,
its climbs, the reference altitude its figures are at -- moved into the
engine with the nav log (wingtip_flight::performance, #482 phase 4):
`performance_cruise` and `performance_climb` by name, the reference
altitude in `planning_figures`.
"""

from .engine import ask as engine


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
