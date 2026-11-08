"""A pilot's currency and a student's 61.109 experience from their
logbook, for the gateway: it keeps the logbook and the dates the pilot
gives, and asks here for what they mean (CLAUDE.md: Spring Boot holds no
aviation logic). The rules are the shared engine's (pilot_currency,
pilot_experience: engine/crates/pilot/src/pilot/currency.rs), asked by
name through wingtip_native.call; this only carries the logbook across.

The entries are the gateway's LogbookEntry, camelCase, as the engine
reads them, and the answers its CurrencyDto and ExperienceItemDto, so the
gateway hands them on as they come."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..gonogo import ask as engine

router = APIRouter()


class LogbookEntry(BaseModel):
    """One logbook entry, the columns the rules read; a column missing is
    none of it."""
    model_config = ConfigDict(extra="ignore")

    flownOn: date
    totalHours: float = 0
    nightHours: float = 0
    crossCountryHours: float = 0
    dayLandings: int = Field(0, description="Every landing, by day or at night (14 CFR 61.57(a)).")
    nightLandings: int = Field(0, description="Landings to a full stop at night (61.57(b)).")
    dualHours: float = 0
    soloHours: float = 0
    instrumentHours: float = 0
    toweredLandings: int = 0
    distanceNm: float = 0
    longestLegNm: float = 0
    approaches: int = 0
    holding: bool = False
    tracking: bool = False


class CurrencyAsk(BaseModel):
    """The logbook, the dates the pilot gives and the day it is asked for
    (the pilot's own calendar's)."""
    entries: list[LogbookEntry]
    flightReviewOn: date | None = None
    medicalExpiresOn: date | None = None
    ipcOn: date | None = None
    today: date


class Currency(BaseModel):
    """Where the pilot stands (the engine's pilot_currency): each date
    null where it cannot be had."""
    dayPassengersUntil: date | None = Field(description="90 days after the third most recent landing (14 CFR 61.57(a)).")
    nightPassengersUntil: date | None = Field(description="90 days after the third most recent night full-stop landing (61.57(b)).")
    flightReviewOn: date | None
    flightReviewUntil: date | None = Field(description="The end of the 24th calendar month after the flight review's (61.56(c)).")
    medicalExpiresOn: date | None
    totalHours: float
    nightHours: float
    crossCountryHours: float
    landings: int
    flights: int
    instrumentCurrentUntil: date | None = Field(
        description="The last day of instrument currency (61.57(c)(1), or 61.57(d)'s check); in the past where it has lapsed.")
    ipcOn: date | None
    ipcNeededAfter: date | None = Field(description="The day after which only an instrument proficiency check restores it (61.57(d)).")
    approachesInWindow: int = Field(description="Approaches logged in the 6 calendar months before this one (61.57(c)(1)(i)).")
    holdingInWindow: bool
    trackingInWindow: bool


class ExperienceAsk(BaseModel):
    """The student's logbook and the day it is asked for."""
    entries: list[LogbookEntry]
    today: date


class ExperienceItem(BaseModel):
    """One of 14 CFR 61.109(a)'s requirements: how much of it the logbook
    shows of how much, and whether that is met."""
    key: str
    rule: str
    label: str
    have: float
    need: float
    unit: Literal["h", "landings", "flights"]
    met: bool


def _entries(entries: list[LogbookEntry]) -> list[dict]:
    return [e.model_dump(mode="json") for e in entries]


def _ask(name: str, **given):
    try:
        return engine(name, **given)
    except ValueError as refused:   # the engine's Err: input not of its shape
        raise HTTPException(status_code=422, detail=str(refused)) from refused


@router.post("/api/pilot/currency")
def currency(ask: CurrencyAsk) -> Currency:
    """The pilot's currency from their logbook (14 CFR 61.56, 61.57)."""
    return Currency(**_ask("pilot_currency", entries=_entries(ask.entries), today=ask.today.isoformat(),
                           flight_review_on=ask.flightReviewOn, medical_expires_on=ask.medicalExpiresOn, ipc_on=ask.ipcOn))


@router.post("/api/pilot/experience")
def experience(ask: ExperienceAsk) -> list[ExperienceItem]:
    """A student's private pilot experience from their logbook, item by
    item (14 CFR 61.109(a))."""
    return [ExperienceItem(**i) for i in _ask("pilot_experience", entries=_entries(ask.entries), today=ask.today.isoformat())]
