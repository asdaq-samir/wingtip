"""An approach's plate on the map and the CIFP's own figures for its
fixes' tags (wingtip.plates, wingtip.plate_page, wingtip.approach_facts)."""

from __future__ import annotations

from pydantic import BaseModel


class PlateCorner(BaseModel):
    """A corner of a plate's page on the ground."""

    lat: float
    lon: float


class PlatePage(BaseModel):
    """An approach plate's whole page placed on the map (wingtip.plate_page):
    its picture at /api/approach-plate-page/{cycle}/{ident}/{procedure}.png,
    greyscale on white, `width` by `height` pixels, drawn between its four
    corners on the ground, which put its plan view where the plate's own
    georeference does; the rest of the page goes round it at the same scale
    and turn, as ForeFlight lays a plate on its chart. The page may turn a
    little from north up (the plate's Lambert projection's meridians lean),
    so it is drawn between the four corners, not in a box."""

    width: int
    height: int
    top_left: PlateCorner
    top_right: PlateCorner
    bottom_right: PlateCorner
    bottom_left: PlateCorner


class PlateOverlay(BaseModel):
    """An approach's plate's plan view placed on the map (wingtip.plates): the
    FAA's plate of `name` in d-TPP cycle `cycle`, its picture at
    /api/approach-plate/{cycle}/{ident}/{procedure}.png, black on clear,
    north up between these latitudes and longitudes, as the plate's own
    georeference places it; `fixes` the approach's fixes inside it;
    `circling` whether the plate publishes circling minimums, so a pilot
    flying the approach may circle to land on another runway; `page` the
    whole page placed (PlatePage), None where its page is turned in the
    PDF and so not placed."""

    cycle: str
    name: str
    south: float
    west: float
    north: float
    east: float
    fixes: list[str]
    circling: bool
    page: PlatePage | None = None


class ApproachRunway(BaseModel):
    """The approach's runway as the CIFP's runway record gives it: its
    threshold (`ident` "RW36"), the threshold's elevation (ARINC 424-18
    5.68) and the threshold crossing height (5.67), ft; and its touchdown
    zone elevation, ft MSL to a tenth, from NASR (APT_RWY_END's TDZ_ELEV),
    None where NASR has none."""

    ident: str
    lat: float
    lon: float
    threshold_ft: int
    tch_ft: int
    tdze_ft: float | None = None


class ApproachCoded(BaseModel):
    """An altitude a final codes beside a fix's limits (ARINC 424-18 5.29,
    its second altitude): `code` "G" or "H" the glide slope's at the final
    approach fix, "I" or "J" the glide slope's intercept at the final
    approach course fix, "V" the vertical path's at a step-down fix."""

    fix: str
    code: str
    ft: int


class ApproachFacts(BaseModel):
    """What the CIFP says of an approach besides its legs
    (wingtip.approach_facts): its runway, the altitudes coded beside its
    fixes' limits, and the levels of service it authorises (ARINC 424-19
    5.275, 5.276: "LPV", "LNAV/VNAV", "LNAV", ...). No decision altitude or
    MDA: those are the plate's minimums alone."""

    runway: ApproachRunway | None = None
    coded: list[ApproachCoded] = []
    levels: list[str] = []
