"""POST /api/logbook-draft's ask and answer: a flown track in, the draft
logbook entry the engine draws from it out (logbook_from_track, its
shapes in engine/contract/engine.schema.json). The entry's columns are
the gateway's LogbookEntryRequest, camelCase, so the app sends them on
to POST /api/logbook as they come once the pilot confirms."""

from typing import Literal

from pydantic import BaseModel, Field


class DraftTrackPoint(BaseModel):
    """A point of the app's recorded track: when, ms since 1970; GPS
    altitude, ft MSL, where the phone gave one."""

    t: float
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    alt_ft: float | None = None


class LogbookDraftAsk(BaseModel):
    """The track (as many points as the gateway keeps of one, thinned by
    the app) and what the app knows besides: the airplane, the pilot's
    clock and the approach picked for the flight."""

    points: list[DraftTrackPoint] = Field(min_length=2, max_length=5000)
    aircraft: str | None = Field(None, max_length=16, description="The airplane's N-number.")
    aircraftType: str | None = Field(None, max_length=16)
    utcOffsetMin: float = Field(0, ge=-14 * 60, le=14 * 60, description="The pilot's clock against UTC, minutes.")
    picked: str | None = Field(None, max_length=16, description="The approach picked for the flight, its CIFP id.")


class DraftEntry(BaseModel):
    """The entry as the gateway's form takes it (LogbookEntryRequest)."""

    flownOn: str
    aircraft: str | None
    aircraftType: str | None
    route: str
    totalHours: float = Field(description="14 CFR 1.1's flight time, to the tenth.")
    airHours: float = Field(description="Takeoff roll to landing roll.")
    nightHours: float = Field(description="Of the flight time, in 1.1's night.")
    crossCountryHours: float = Field(description="Where a landing was more than 50 nm from the departure (61.1(b)(ii)).")
    dayLandings: int = Field(description="Every landing not counted at night (61.57(a)).")
    nightLandings: int = Field(description="To a full stop in 61.57(b)'s period.")
    touchAndGoes: int = Field(description="Of the day landings, the touch-and-goes.")
    toweredLandings: int
    distanceNm: float
    longestLegNm: float
    approaches: int
    holding: bool
    tracking: bool
    remarks: str


class DraftInstrument(BaseModel):
    """61.57(c)(1)'s items the track shows, added to the entry only where
    the pilot says it was flown by instruments (61.51(g)(1))."""

    approaches: int
    holding: bool
    tracking: bool


class DraftTakeoff(BaseModel):
    t: float
    lat: float
    lon: float
    field: str | None
    towered: bool
    night: bool = Field(description="1.1's night there and then.")
    passenger_night: bool = Field(description="61.57(b)'s period: from 1 hour after sunset to 1 hour before sunrise.")


class DraftLanding(DraftTakeoff):
    kind: Literal["full_stop", "touch_and_go"]
    counts_night: bool = Field(description="To a full stop in 61.57(b)'s period.")


class DraftApproach(BaseModel):
    airport: str
    id: str
    name: str
    faf_at: float = Field(description="When it crossed the final approach fix inbound, ms.")
    outcome: Literal["landed", "missed", "unknown"]
    also_fits: list[str]


class DraftHold(BaseModel):
    model_config = {"populate_by_name": True}

    from_: float = Field(alias="from")
    to: float
    racetracks: int
    lat: float
    lon: float
    fix: str | None


class DraftBlock(BaseModel):
    model_config = {"populate_by_name": True}

    from_: float | None = Field(alias="from")
    to: float | None


class DraftCrossCountry(BaseModel):
    landed_elsewhere: bool = Field(description="A landing elsewhere: 61.1(b)(i).")
    over_50_nm: bool = Field(description="A landing more than 50 nm from the departure: 61.1(b)(ii).")
    farthest_nm: float


class DraftReason(BaseModel):
    item: str
    says: str
    source: str


class LogbookDraft(BaseModel):
    """The draft: the entry, 61.57(c)'s items apart, what the track
    showed, and a reason for each figure."""

    entry: DraftEntry
    instrument: DraftInstrument
    takeoffs: list[DraftTakeoff]
    landings: list[DraftLanding]
    approaches: list[DraftApproach]
    holds: list[DraftHold]
    block: DraftBlock
    cross_country: DraftCrossCountry
    ends_airborne: bool
    reasons: list[DraftReason]
