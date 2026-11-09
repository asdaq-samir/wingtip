"""The shapes of POST /api/read-document: what the app sends (a photo and
what it is of), what the model fills in from the photo (the reads, which
are the engine's rules' inputs member for member: handbook_read_check's
and logbook_read_check's in engine/contract/engine.schema.json), and what
the engine answered about them (its answers' shapes, which the contract
states; read into these so the apps get typed models from this service's
openapi.json)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Kind = Literal["poh-performance", "weight-balance", "logbook-page", "clearance"]
MediaType = Literal["image/jpeg", "image/png", "image/webp", "image/gif"]


class ReadAsk(BaseModel):
    """A photo of a page and what it is of. `image` is the photo's bytes in
    base64 (a JPEG the phone's scanner or the browser made, its long edge
    about 2,000 px); `today` the app's own date, which a logbook row may
    not be after."""

    kind: Kind
    image: str = Field(min_length=100, max_length=5_000_000)
    media_type: MediaType = "image/jpeg"
    today: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


# --- What the model reads (the engine's inputs) ----------------------------

SpeedUnit = Literal["kt", "mph", "kmh"]


class CruiseRow(BaseModel):
    altitude_ft: float | None = Field(None, description="Pressure altitude, feet.")
    power_pct: float | None = Field(None, description="Percent brake horsepower.")
    rpm: float | None = None
    tas: float | None = Field(None, description="True airspeed, in speed_unit.")
    burn: float | None = Field(None, description="Fuel flow, in burn_unit.")


class Climb(BaseModel):
    speed: float | None = Field(None, description="Best rate of climb speed (Vy), indicated, in speed_unit.")
    rate_fpm: float | None = Field(None, description="Rate of climb, feet a minute, at sea level where the page has several.")
    burn: float | None = Field(None, description="The climb's fuel flow, in burn_unit.")


class Glide(BaseModel):
    speed: float | None = Field(None, description="Best glide speed, indicated, in speed_unit.")
    ratio: float | None = Field(None, description="Glide ratio, feet forward for each foot down (9 for 9:1).")


class DistanceRow(BaseModel):
    pressure_altitude_ft: float | None = None
    temp_c: float | None = Field(None, description="Outside air temperature, degrees Celsius.")
    ground_roll: float | None = Field(None, description="In distance_unit.")
    over_obstacle: float | None = Field(None, description="Total distance to clear a 50 ft obstacle, in distance_unit.")


class Empty(BaseModel):
    weight: float | None = Field(None, description="Basic empty weight, in weight_unit.")
    arm: float | None = Field(None, description="Its arm (CG), in arm_unit.")
    moment: float | None = Field(None, description="Its moment exactly as printed.")
    moment_divisor: float | None = Field(None, description="1000 where the column is moment/1000; 1 where it is the moment itself.")


class Corner(BaseModel):
    arm: float | None = Field(None, description="In arm_unit.")
    weight: float | None = Field(None, description="In weight_unit.")


class Fuel(BaseModel):
    total: float | None = Field(None, description="Total capacity, in fuel_unit.")
    usable: float | None = Field(None, description="Usable fuel, in fuel_unit.")


class HandbookRead(BaseModel):
    """A handbook's performance or weight and balance page, as read:
    every figure in the units the page prints, the units named once.
    What the page does not show is null or left empty."""

    speed_unit: SpeedUnit | None = Field(None, description="The speeds' unit as printed: KTAS/KIAS are kt, MPH mph.")
    cruise_speed_kind: Literal["tas", "ias", "cas"] | None = Field(
        None, description="What the cruise table's speeds are: KTAS tas, KIAS ias, KCAS cas.")
    distance_unit: Literal["ft", "m"] | None = None
    weight_unit: Literal["lb", "kg"] | None = None
    arm_unit: Literal["in", "cm", "mm"] | None = None
    fuel_unit: Literal["gal", "l"] | None = Field(None, description="US gallons or litres.")
    burn_unit: Literal["gph", "lph", "pph"] | None = Field(None, description="Gallons, litres or pounds an hour.")
    cruise: list[CruiseRow] = Field(default_factory=list, description="Every row of the cruise performance table.")
    climb: Climb | None = None
    glide: Glide | None = None
    takeoff: list[DistanceRow] = Field(default_factory=list, description="Every row of the takeoff distance table.")
    landing: list[DistanceRow] = Field(default_factory=list, description="Every row of the landing distance table.")
    empty: Empty | None = None
    max_takeoff_weight: float | None = Field(
        None, description="Maximum takeoff (or ramp, where only that is printed) weight, in weight_unit.")
    envelope: list[Corner] = Field(default_factory=list, description="The CG envelope's corners, in order going round its outline.")
    fuel: Fuel | None = None


class LogbookRow(BaseModel):
    date: str | None = Field(None, description="YYYY-MM-DD; null where the day, month or year cannot be read.")
    aircraft_type: str | None = Field(None, description="As written: C172, PA-28-181.")
    aircraft_id: str | None = Field(None, description="The registration as written: N12345.")
    from_: str | None = Field(None, alias="from", description="Departure point as written: KANE.")
    to: str | None = Field(None, description="Arrival point as written.")
    via: list[str] = Field(default_factory=list, description="Points between, as written.")
    total: float | None = Field(None, description="Total flight time, hours and tenths.")
    night: float | None = None
    cross_country: float | None = None
    dual: float | None = Field(None, description="Dual received.")
    solo: float | None = None
    instrument_actual: float | None = None
    instrument_simulated: float | None = Field(None, description="Simulated instrument (hood).")
    day_landings: float | None = None
    night_landings: float | None = Field(None, description="Night landings to a full stop.")
    approaches: float | None = Field(None, description="Instrument approaches, the count.")
    holding: bool | None = None
    remarks: str | None = None

    model_config = {"populate_by_name": True}


class PageTotals(BaseModel):
    total: float | None = None
    night: float | None = None
    cross_country: float | None = None
    dual: float | None = None
    solo: float | None = None
    instrument_actual: float | None = None
    instrument_simulated: float | None = None
    day_landings: float | None = None
    night_landings: float | None = None
    approaches: float | None = None


class LogbookPageRead(BaseModel):
    """A paper logbook page, as read: a row for each flight written on it,
    and the page's "total this page" row where it has one (not the amount
    forwarded, nor the total to date)."""

    rows: list[LogbookRow] = Field(default_factory=list)
    page_totals: PageTotals | None = None


class ClearanceNote(BaseModel):
    """A clearance or ATIS copied down in a pilot's shorthand, as written
    and as a controller would say it, for the app's clearance reader."""

    written: str = Field(description="The note as written, line by line, shorthand kept.")
    said: str = Field(description="The same clearance as the controller said it, in words, figures as digits, nothing added.")


class Unreadable(BaseModel):
    """What the model says besides the figures: what it could not make out."""

    notes: list[str] = Field(
        default_factory=list, description="Each figure or part of the page that could not be read, in a short sentence.")
    unreadable: str | None = Field(None, description="Why nothing could be read, where nothing could: not this kind of page, too blurred.")


class HandbookPage(HandbookRead, Unreadable):
    pass


class LogbookPage(LogbookPageRead, Unreadable):
    pass


class ClearancePage(Unreadable):
    clearance: ClearanceNote | None = None


# --- What the engine answered ----------------------------------------------


class DocumentFlag(BaseModel):
    level: Literal["check", "wrong"]
    field: str | None = None
    says: str


class HandbookFigure(BaseModel):
    path: str
    label: str
    value: float
    unit: str
    app_value: float
    app_unit: str


class HandbookItem(BaseModel):
    key: str
    group: str
    title: str
    figures: list[HandbookFigure]
    flags: list[DocumentFlag]


class HandbookProfile(BaseModel):
    cruise_tas_kt: float | None = None
    fuel_burn_gph: float | None = None
    cruise_power_pct: float | None = None
    cruise_from: str | None = None
    climb_fuel_burn_gph: float | None = None
    usable_fuel_gal: float | None = None


class HandbookCruise(BaseModel):
    altitude_ft: float
    power_pct: float | None = None
    rpm: float | None = None
    tas_kt: float
    burn_gph: float


class HandbookDistance(BaseModel):
    pressure_altitude_ft: float
    temp_c: float
    ground_roll_ft: float
    over_obstacle_ft: float


class HandbookCorner(BaseModel):
    arm_in: float
    weight_lb: float


class HandbookFigures(BaseModel):
    """Every figure in the app's units (knots, feet, pounds, inches,
    gallons), as the airplane's record keeps them."""

    cruise: list[HandbookCruise] = []
    climb_speed_kias: float | None = None
    climb_rate_fpm: float | None = None
    climb_burn_gph: float | None = None
    glide_speed_kias: float | None = None
    glide_ratio: float | None = None
    takeoff: list[HandbookDistance] = []
    landing: list[HandbookDistance] = []
    empty_weight_lb: float | None = None
    empty_arm_in: float | None = None
    max_takeoff_weight_lb: float | None = None
    envelope: list[HandbookCorner] = []
    fuel_total_gal: float | None = None
    usable_fuel_gal: float | None = None


class HandbookCheck(BaseModel):
    """handbook_read_check's answer: the items to confirm, every figure in
    the app's units, and the airplane form's figures from them."""

    items: list[HandbookItem]
    handbook: HandbookFigures
    profile: HandbookProfile


class LogbookEntryDraft(BaseModel):
    """The gateway's LogbookEntryRequest as the row gives it; `flownOn`
    is null where no date was read, and such a row cannot be saved."""

    flownOn: str | None = None
    aircraft: str | None = None
    aircraftType: str | None = None
    route: str | None = None
    totalHours: float = 0
    nightHours: float = 0
    crossCountryHours: float = 0
    dayLandings: int = 0
    nightLandings: int = 0
    remarks: str | None = None
    dualHours: float = 0
    soloHours: float = 0
    instrumentHours: float = 0
    toweredLandings: int = 0
    distanceNm: float = 0
    longestLegNm: float = 0
    approaches: int = 0
    holding: bool = False
    tracking: bool = False
    airHours: float = 0
    touchAndGoes: int = 0
    fromTrack: bool = False
    flightId: int | None = None


class LogbookRowCheck(BaseModel):
    entry: LogbookEntryDraft
    flags: list[DocumentFlag]


class LogbookCheck(BaseModel):
    rows: list[LogbookRowCheck]
    flags: list[DocumentFlag]


class DocumentRead(BaseModel):
    """The page read and checked: the read (the engine rule's input, for
    the app to edit and ask again), the engine's answer, what could not be
    read, and the model. `unreadable` with nothing else where the page
    could not be read at all."""

    kind: Kind
    model: str
    handbook: HandbookRead | None = None
    handbook_check: HandbookCheck | None = None
    logbook: LogbookPageRead | None = None
    logbook_check: LogbookCheck | None = None
    clearance: ClearanceNote | None = None
    notes: list[str] = []
    unreadable: str | None = None
