"""The planner's batched pilot records (POST /api/pilot/records-batch) and
the same-field question (POST /api/pilot/same-field), both asked by the
gateway alone for an instructor's page and a lesson's flights; kept apart
from schemas.pilot's one-pilot shapes, which they are made of."""

from typing import Annotated

from pydantic import BaseModel, Field

from .pilot import Endorsements, EndorsementsAsk, ExperienceAsk, ExperienceItem

#: The most asks one batch call takes: well above an instructor's
#: students and reviews, or one owner's airplanes.
MAX_BATCH = 500


class RecordsBatchAsk(BaseModel):
    """Many students' records asked at once, for an instructor's page:
    each student's experience (ExperienceAsk) and every endorsements ask
    (EndorsementsAsk: a student's solo day, a review's 61.93(d) checks,
    a signed list's last good days), answered in the same order. One
    round trip for the page rather than two a student and two a review."""

    # A bound on one call, which only the gateway makes, from one
    # instructor's own students and reviews (the deep security review of
    # 2026-11-21): without one, a body of any length held a worker through
    # one engine call an ask.
    experience: list[ExperienceAsk] = Field(default=[], max_length=MAX_BATCH)
    endorsements: list[EndorsementsAsk] = Field(default=[], max_length=MAX_BATCH)


class RecordsBatch(BaseModel):
    """The answers to a RecordsBatchAsk, each list in the order asked."""

    experience: list[list[ExperienceItem]]
    endorsements: list[Endorsements]


class SameFieldAsk(BaseModel):
    """Which of `idents` name the field `field`: a lesson's field and the
    stops and ends of the flights put to its instructor."""

    field: str = Field(max_length=8)
    idents: list[Annotated[str, Field(max_length=8)]] = Field(default=[], max_length=MAX_BATCH)


class SameField(BaseModel):
    """For each ident asked, in order, whether it names the field."""

    same: list[bool]
