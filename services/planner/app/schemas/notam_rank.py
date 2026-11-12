"""The shapes app.routers.notam_rank sends and takes, as Pydantic models:
the engine's `notams_ranked` (engine/contract/engine.schema.json) with
each NOTAM's text as sent beside it."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class NotamsRankedAsk(BaseModel):
    """The flight as the Brief has it: its route, when it leaves (UTC when
    naive; now when not given), how long it is (two hours when not given),
    its cruise altitude and the runway in use at each field the pilot's
    plan has picked ({"KOSH": "36"})."""

    dep: str
    dest: str
    stops: list[str] = []
    depart: datetime | None = None
    ete_min: float | None = Field(default=None, gt=0, le=24 * 60)
    altitude_ft: float | None = Field(default=None, ge=0, le=60_000)
    runways: dict[str, str] = {}


class NotamReason(BaseModel):
    """Why it bears on the flight, or does not, in the engine's words."""

    key: Literal["time", "schedule", "field", "runway", "closed", "altitude", "airspace", "kind"]
    words: str


class TfrPoint(BaseModel):
    """A point in degrees (WGS-84)."""

    lat: float
    lon: float


class TfrContact(BaseModel):
    """Whom a TFR's NOTAM names to call, as its XNOTAM file gives them:
    the name in the FAA's capitals, a telephone, a frequency."""

    name: str
    phone: str | None = None
    frequency: str | None = None


class TfrFacts(BaseModel):
    """A TFR as tfr.faa.gov gives it, for the card to read (the engine's
    tfr_read) and show: its kind, rule, the list's title and its levels;
    its instructions, a line each, and its NOTAM's text, as sent; the
    facility it is coordinated through and its point of contact; and, on a
    field's card, whether its area takes the field in, the field and the
    nearest point of its areas."""

    kind: str | None = None
    rule: str | None = None
    title: str | None = None
    floor_ft: float | None = None
    floor_ref: str | None = None
    ceiling_ft: float | None = None
    ceiling_ref: str | None = None
    instructions: list[str] = []
    text: str | None = None
    facility: TfrContact | None = None
    contact: TfrContact | None = None
    over_field: bool | None = None
    field: TfrPoint | None = None
    edge: TfrPoint | None = None


class RankedNotam(BaseModel):
    """One NOTAM or TFR, ranked: its place in the list and score, whether it
    is one of the top three said first, whether its score is shared
    (`tied`), what was read of it, and its text as sent (`raw`)."""

    id: str
    kind: Literal["notam", "tfr"]
    rank: int
    score: int
    top: bool
    tied: bool
    field: str | None
    role: str | None
    keyword: str | None
    runways: list[str]
    closed: bool
    low_ft: float | None
    high_ft: float | None
    in_force: bool | None
    reasons: list[NotamReason]
    raw: str
    starts: str | None
    ends: str | None
    tfr: TfrFacts | None = None


class NotamsRanked(BaseModel):
    """The flight's NOTAMs best first, every one heard (`notams`), how many
    are said first (`top`), the day the NOTAM feed was first heard
    (`coverage_since`: earlier NOTAMs never changed since are not held) and
    what could not be checked ("tfrs")."""

    notams: list[RankedNotam]
    top: int
    coverage_since: str | None = None
    unchecked: list[str] = []
