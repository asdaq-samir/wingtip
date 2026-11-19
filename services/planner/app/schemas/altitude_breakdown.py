"""The altitude breakdown of a route: each leg's band, the airspace it crosses and the cautions, for app.schemas.plan's Plan."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .common import FlightRules, Hazard, SpecialUse
from .plan_legs import AirwayAltitudes


class AirspaceTransit(BaseModel):
    """Controlled airspace the route passes through: a radio call to
    make, not a ceiling constraint."""

    model_config = ConfigDict(populate_by_name=True)

    name: str
    class_: str = Field(alias="class")
    floor_ft_msl: float | None = None
    requires: str
    along_track_nm: float


class SpecialUseArea(SpecialUse):
    """One special-use area the route crosses."""

    along_track_nm: float
    #: The legs (between consecutive fixes) that cross it.
    legs: list[int] = []


class AltitudeSegment(BaseModel):
    """One leg's own band: its floor, the clouds and the service ceiling
    over it alone, and the legal cruising altitudes between -- what lets a
    plan step over high ground or under low cloud leg by leg."""

    from_nm: float
    to_nm: float
    floor_ft: float
    #: The aeroplane's service ceiling over this leg in the forecast air
    #: (see AltitudeBreakdown's).
    service_ceiling_ft: float | None = None
    #: The lowest cloud base (MSL) the TAFs near this leg forecast for
    #: the flight, and the station: the leg keeps 14 CFR 91.155's
    #: distance below it, up to `cloud_ceiling_ft`. None where no
    #: station near it forecasts one.
    cloud_base_ft: float | None = None
    cloud_station: str | None = None
    cloud_ceiling_ft: float | None = None
    #: False where the clouds leave this leg no altitude: VFR is not
    #: possible there as forecast, and its altitudes are the band's
    #: without the clouds.
    cloud_clearance_kept: bool = True
    band_ceiling_ft: float | None
    #: This leg's own magnetic course and half of the hemispheric rule,
    #: which its legal altitudes are rounded to.
    course_magnetic_deg: float | None = None
    eastbound: bool | None = None
    #: Where the rule begins over this leg (see AltitudeBreakdown's).
    hemispheric_rule_from_ft: float | None = None
    candidates_ft: list[float]
    #: No 500 ft step fits under this leg's ceiling, and its one altitude
    #: is the highest whole hundred under it that clears the floor (1,800
    #: ft under a 1,900 ft ceiling): legal, but tight (wingtip.altitude).
    tight: bool = False
    #: What the floor is from: the ground or the DOF obstacle it rests on
    #: and its height MSL, and the clearance over it. Under IFR (wingtip.ifr,
    #: 14 CFR 91.177(a)(2)) the highest within 4 nm of the leg's course,
    #: whether the leg is over a mountainous area (Part 95), and 2,000 ft
    #: there, 1,000 elsewhere. Under VFR (wingtip.terrain, 14 CFR 91.119) the
    #: one whose top and clearance are highest: 1,000 ft over or within
    #: 2,000 ft of a congested area (91.119(b)), 500 ft elsewhere (91.119(c)):
    #: 91.119's own minimum, which a caution measures a pilot's altitude
    #: against. The VFR floor is at or above it, the ground taking the
    #: planner's 1,000 ft everywhere.
    highest_ft: float | None = None
    highest_is_obstacle: bool | None = None
    mountainous: bool | None = None
    obstacle_clearance_ft: float | None = None
    #: Under VFR, the DOF obstacle's type where the floor rests on one
    #: (TOWER, BLDG ...), as the FAA writes it.
    obstacle_type: str | None = None
    #: Under VFR, whether the clearance is 91.119(b)'s for a congested area
    #: (the Census urban areas and places, wingtip.congested); None where the
    #: towns could not be read and it took the 1,000 ft anyway.
    congested: bool | None = None
    #: Under IFR along an airway (wingtip.airways): the segment's published
    #: altitudes, its MEA the floor (14 CFR 91.177(a)(1)) and its MAA a
    #: ceiling.
    airway: "AirwayAltitudes | None" = None


class AltitudeCaution(BaseModel):
    """An altitude the pilot set for a hop (`from_ident` to `to_ident`) and
    what is wrong with it against the planner's band there
    (wingtip.planning.own_altitude_caution): a warning, not a refusal."""

    from_ident: str
    to_ident: str
    altitude_ft: float
    reasons: list[str]


class AltitudeBreakdown(BaseModel):
    """The full reasoning behind one recommended cruise altitude.
    `low_ceiling_or_visibility` is None, not False, when the forecast
    call itself failed: unknown must not read as confirmed fine.
    `candidates_ft` are every legal altitude for the whole route;
    `segments` the same leg by leg, present when the nav log's fixes
    were known."""

    #: The rules it was chosen under: "vfr", or "ifr" -- 14 CFR 91.177's
    #: minimum IFR altitudes for its floors, 91.179(b)'s thousands by
    #: direction of flight, no cloud or Class A ceiling (wingtip.ifr).
    rules: FlightRules = "vfr"
    recommended_ft: float | None
    candidates_ft: list[float] = []
    # The magnetic course the hemispheric rule was applied to, and which
    # half of the rule that is: 000-179 flies odd thousands plus 500,
    # 180-359 even thousands plus 500.
    course_magnetic_deg: float
    eastbound: bool
    #: 14 CFR 91.159 applies only more than 3,000 ft above the surface:
    #: this is 3,000 ft over the lowest ground on the route, and below it
    #: every 500 ft is legal as well as the rule's altitudes.
    hemispheric_rule_from_ft: float | None = None
    floor_ft: float
    #: Always None: Class B is no ceiling, the route planned through it
    #: with its clearance (14 CFR 91.131(a)(1)). Kept only while the
    #: iPhone's altitude reasons still read it (apps/ios/Wingtip/Words/
    #: AltitudeWhy.swift, Profile/ProfileReasons.swift); goes with the
    #: phones' turn.
    airspace_ceiling_ft: float | None = None
    #: The aeroplane's service ceiling where it is in the forecast air,
    #: the lowest over any leg: a service ceiling is a density altitude
    #: (the profile's `service_ceiling_ft`, the book figure), so a warm
    #: day brings it down and a cold one lifts it. The book figure where
    #: the temperatures aloft could not be read.
    service_ceiling_ft: float | None = None
    #: The lowest forecast cloud base (MSL) along the route, and the TAF
    #: station it is from; `cloud_ceiling_ft` is the highest altitude
    #: that keeps 14 CFR 91.155's distance below it (500 ft, 1,000 ft at
    #: 10,000 and above), which the band keeps under.
    cloud_base_ft: float | None = None
    cloud_station: str | None = None
    cloud_ceiling_ft: float | None = None
    #: False where the clouds leave the route, or a leg of it, no
    #: altitude: those altitudes are the band's without the clouds.
    cloud_clearance_kept: bool = True
    airspace_transits: list[AirspaceTransit]
    #: Prohibited and restricted areas, MOAs and the like the legs cross
    #: (wingtip.sua); no candidate altitude enters a prohibited one.
    special_use: list[SpecialUseArea] = []
    freezing_level_ft: float | None
    #: The freezing level is at or below `freezing_level_ft`: it was
    #: already below 0 degC at the lowest altitude the forecast reports.
    freezing_level_at_or_below: bool = False
    #: A legal altitude reaches the freezing level and cloud or an icing
    #: AIRMET/SIGMET is forecast along the route. None where the freezing
    #: level could not be checked.
    icing_possible: bool | None = None
    band_ceiling_ft: float | None
    min_ceiling_ft: float | None
    min_visibility_sm: float | None
    hazards: list[Hazard]
    low_ceiling_or_visibility: bool | None
    weather_unavailable: list[Literal["freezing_level", "ceiling_visibility", "hazards", "special_use"]] = []
    segments: list[AltitudeSegment] = []
    #: Under IFR, some leg is over a designated mountainous area (14 CFR
    #: Part 95): its floor is 2,000 ft over the obstacles, not 1,000.
    mountainous: bool = False
