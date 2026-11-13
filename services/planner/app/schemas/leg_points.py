"""The points on a leg the nav log cuts it at: a top of climb and a top
of descent (the engine's with_climbs and with_descents)."""

from pydantic import BaseModel


class LegPoint(BaseModel):
    """A point on a leg that the nav log has a row for, the leg cut there.
    The miles, minutes and gallons are from the leg's start;
    `altitude_ft`, the level there."""

    along_nm: float
    ete_min: float
    fuel_gal: float | None
    altitude_ft: float
    lat: float
    lon: float


class TopOfClimb(LegPoint):
    """Where a climb tops out (TOC), and the climb's own figures on the
    way up to it (the engine's with_climbs): its true airspeed, its wind
    correction, headings and ground speed in the leg's wind, and its fuel
    flow, so the nav log's row up to the top is the climb's."""

    tas_kt: float
    groundspeed_kt: float
    fuel_burn_gph: float | None = None
    wca_deg: float | None = None
    true_heading_deg: float | None = None
    magnetic_heading_deg: float | None = None


class TopOfDescent(LegPoint):
    """Where a descent starts (TOD): down from `altitude_ft` to `to_ft` --
    the pattern altitude of the field landed at, the altitude an
    approach's first fix is crossed at, or the next leg's lower level --
    at `fpm`, three to one at the descent's ground speed, or steeper where
    the climb before it left less room (the engine's with_descents)."""

    to_ft: float
    # Whether `to_ft` is the pattern altitude at the field the flight
    # lands at, rather than a lower level on the way.
    pattern: bool
    # The approach's fix `to_ft` is crossed at, where the flight lands by
    # one (plan.approach_end).
    fix: str | None = None
    fpm: float
    # The descent's own figures for the piece of the leg after the top,
    # where the airplane's profile gives its descent speed and flow (the
    # engine's descent_phase): its TAS, wind correction, headings, the
    # piece's ground speed (its miles over its minutes) and the flow.
    tas_kt: float | None = None
    groundspeed_kt: float | None = None
    fuel_burn_gph: float | None = None
    wca_deg: float | None = None
    true_heading_deg: float | None = None
    magnetic_heading_deg: float | None = None
    # With an airplane, whether the descent is flown on the cruise's
    # figures for want of its own (the app asks for them); None with none.
    descent_at_cruise: bool | None = None
