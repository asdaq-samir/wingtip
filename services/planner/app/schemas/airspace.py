"""The shapes app.routers.airspace sends and takes, as Pydantic models."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .common import SpecialUse, TfrInfo


class VfrMinimums(BaseModel):
    """14 CFR 91.155(a)'s basic VFR weather minimums: the flight
    visibility, and the distance from clouds -- clear of them, or so far
    below, above and to the side (5,280 ft is a statute mile)."""

    visibility_sm: float
    clear_of_clouds: bool
    below_ft: float | None = None
    above_ft: float | None = None
    horizontal_ft: float | None = None


class DayNightMinimums(BaseModel):
    day: VfrMinimums
    night: VfrMinimums


class AirspaceBand(BaseModel):
    """One class of airspace over a point, from `floor_ft` to
    `ceiling_ft` MSL (wingtip.airspace_at): its name where it is a B, C or
    D; the VFR minimums in it (None in A); what it takes to go in; the
    equipment it asks for; and the 91.117 speed limit there."""

    floor_ft: float
    ceiling_ft: float
    class_: Literal["A", "B", "C", "D", "E", "G"] = Field(alias="class")
    name: str | None = None
    minimums: DayNightMinimums | None = None
    entry: str
    equipment: str | None = None
    speed_kt: int | None = None

    model_config = ConfigDict(populate_by_name=True)


class ModeCVeil(BaseModel):
    """The Class B primary airport whose 30 nm Mode C veil the point is in."""

    ident: str
    name: str | None = None
    distance_nm: float


class TfrHere(TfrInfo):
    """A TFR over the point, and whether it is in force now."""

    active_now: bool


class PointOffFix(BaseModel):
    """A point named as the pilot's own point off the nearest fix a pilot
    knows (wingtip.fixes.frd_near): "VPBNG/095/14.2", its fix, its magnetic
    course from it (a VOR's radial where `radial`), its distance, and its
    name, "14.2 nm on 095° from VPBNG"."""

    ident: str
    base: str
    course_deg: int
    distance_nm: float
    radial: bool
    name: str


class AirspaceAt(BaseModel):
    """The airspace over a point on the chart, from the ground up: the
    classes in bands, the Mode C veil, the special-use areas and the
    TFRs there. `ground_ft` is the ground's height the AGL floors were
    placed from (Terrain Tiles); None where it could not be read, and
    the bands are then measured from sea level. Either source of areas
    out is said so rather than shown as none."""

    lat: float
    lon: float
    ground_ft: float | None
    bands: list[AirspaceBand]
    mode_c_veil: ModeCVeil | None = None
    special_use: list[SpecialUse] = []
    special_use_unavailable: bool = False
    tfrs: list[TfrHere] = []
    tfrs_unavailable: bool = False
    #: The point named off the nearest fix, for the route (the card's Add
    #: to route, Direct to, Hold here); None with none within 40 nm.
    point: PointOffFix | None = None


class AheadAlert(BaseModel):
    """One thing ahead of the airplane (wingtip.alerts): airspace, a special-
    use area or a TFR its track goes into in the next five minutes, or the
    ground or an obstacle it comes within 500 ft of in the next minute.
    `seconds` and `distance_nm` are how long and how far until it at the
    ground speed, 0 where it is now; `lat`/`lon` where the track meets it
    (the obstacle itself, the ground's highest point)."""

    id: str
    kind: Literal["airspace", "special_use", "tfr", "terrain", "obstacle"]
    level: Literal["warning", "caution"]
    #: As the FAA names it ("CHICAGO CLASS B", "R-6901A", a TFR's title),
    #: an obstacle's kind ("TOWER"), or "Terrain".
    name: str
    #: B, C or D; P, R, MOA, W or A.
    class_: str | None = Field(default=None, alias="class")
    #: What it takes, with the rule's section.
    need: str
    inside: bool = False
    seconds: float
    distance_nm: float
    lat: float
    lon: float
    #: Its floor and ceiling, feet MSL; None at the surface or with no top.
    floor_ft: float | None = None
    ceiling_ft: float | None = None
    #: The ground's or the obstacle's top, feet MSL, and the airplane's
    #: projected height over it there.
    top_ft: float | None = None
    clearance_ft: float | None = None
    times_of_use: str | None = None
    notam_id: str | None = None
    #: A special-use area's status now as SFDPS has it (wingtip.saa): active
    #: (True) or cold (False), and until when (UNIX s); None where it has none.
    sfdps_active: bool | None = None
    sfdps_until: float | None = None

    model_config = ConfigDict(populate_by_name=True)


class AlertsAhead(BaseModel):
    """What is ahead of the airplane, warnings first, then the soonest;
    `unavailable` names what could not be read (special-use airspace,
    TFRs, terrain, obstacles), said rather than shown as nothing there."""

    alerts: list[AheadAlert]
    unavailable: list[str] = []


class AirspaceVolumes(BaseModel):
    """The volumes in a box as GeoJSON (wingtip.airspace_volumes): each
    feature a Class B, C, D or surface E volume (`layer` "airspace") or a
    special use area (`layer` "special_use"), with the fields of the
    cycle's overlay tiles' layer of that name and `label`, the point its
    name is written at; `cycle`, the pack's, None before one is built."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]
    cycle: str | None = None
