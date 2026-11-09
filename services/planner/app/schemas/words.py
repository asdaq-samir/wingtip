"""The shapes app.routers.words sends and takes, as Pydantic models."""

from pydantic import BaseModel


class WordsSource(BaseModel):
    """The raw thing a sentence can rest on, as the pilot can read it: a
    METAR or a NOTAM as sent, a TAF line, a hazard's words, a finding's
    line, a debrief figure's line. `id` is what a sentence cites
    ("metar:KDLH", "finding:fuel"); `label` is its heading on screen."""

    id: str
    label: str
    text: str


class WordsSources(BaseModel):
    """A reading's sources, in the order they bear on the flight; for the
    NOTAMs, the day the NOTAM feed was first heard (`coverage_since`, ISO
    date) and what could not be checked ("tfrs"). The feed (SWIM's FNS)
    sends what is issued or changed once it is heard, so NOTAMs issued
    before that day and never changed are not in the store: the list is
    what was heard since, not every NOTAM in force (the owner, 2026-11-09,
    chose the feed alone over the FAA NOTAM API's full load)."""

    sources: list[WordsSource]
    coverage_since: str | None = None
    unchecked: list[str] = []
