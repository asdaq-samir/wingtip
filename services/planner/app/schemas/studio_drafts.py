"""The shapes app.routers.studio_drafts sends: the Studio's crash drafts
(wingtip.crash_drafts, docs/STUDIO-PIPELINE.md)."""

from typing import Literal

from pydantic import BaseModel, Field

DraftStatus = Literal["needs_identity", "ready", "rendered", "dismissed"]


class StudioDraftSource(BaseModel):
    """One source's word of the event, as it gave it: "faa_statement",
    "faa_notice" or "ntsb"; its page (or the notice's file); its heading
    and its words, unchanged, which a caption quotes."""

    source: str
    url: str | None = None
    heading: str | None = None
    text: str | None = None


class StudioDraftCheck(BaseModel):
    """One of the identity check's checks (the engine's occurrence_identity)."""

    check: str
    ok: bool
    words: str


class StudioDraftWindow(BaseModel):
    """The time window the report gives, s since 1970 (UTC)."""

    start: float
    end: float


class StudioDraftNearest(BaseModel):
    """The track's report in the window nearest the reported place."""

    t: float
    lat: float
    lon: float
    distance_nm: float


class StudioDraftIdentity(BaseModel):
    """The engine's verdict on the draft's identity, each check made, the
    window it read the track in and the report nearest the place."""

    verdict: Literal["confirmed", "no_track", "needs_human"]
    checks: list[StudioDraftCheck]
    window: StudioDraftWindow | None = None
    nearest: StudioDraftNearest | None = None


class StudioDraftQuote(BaseModel):
    source: str | None = None
    words: str
    url: str | None = None


class StudioDraftCaptions(BaseModel):
    """The film's words, facts only: a title, "Preliminary ...", "No ADS-B
    track" where there is none, the sources' words quoted, the credits."""

    title: str
    status: str
    track: str | None = None
    quotes: list[StudioDraftQuote]
    credits: list[str]


class StudioDraft(BaseModel):
    """A crash draft: the event as reported (local date and time, place),
    the airplane (N-number, its Mode S code where the registry gave one),
    where it stands, and what the identity check found. `track` is "adsb",
    or "none" for a draft of the place alone; `fatal` None where no source
    says, which holds publishing as a fatal event does."""

    id: str
    status: DraftStatus
    n_number: str | None = None
    hex: str | None = None
    local_date: str
    local_time: str | None = None
    city: str | None = None
    state: str | None = None
    lat: float | None = None
    lon: float | None = None
    aircraft: str | None = None
    fatal: bool | None = None
    track: Literal["adsb", "none"] | None = None
    identity: StudioDraftIdentity | None = None
    #: "engine", "developer", or "rejected" once the developer said no.
    identity_by: str | None = None
    kit_at: float | None = None
    noticed_at: float | None = None
    rendered_at: float | None = None
    sources: list[StudioDraftSource]
    #: The kit's captions, on one draft asked for alone.
    captions: StudioDraftCaptions | None = None


class StudioDraftIdentityAsk(BaseModel):
    """The developer's word on a draft's identity: right (`confirm`), or
    not; with an N-number where the report gave none, which the job then
    checks against the registry and the track as it checks its own."""

    confirm: bool
    n_number: str | None = Field(default=None, pattern=r"^[Nn]?[1-9][0-9A-Za-z]{0,4}$")
