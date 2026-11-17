"""The sources of the readings in words: the planner's own figures --
the route's NOTAMs, its briefing, its Go / No-Go, a flown flight's
debrief, what changed in a briefing since the last look -- each put as a
line a sentence can cite and a pilot can read raw, at POST
/api/words/{kind}/sources. The gateway forwards none of them; it asks the
changes' lines itself for a pilot's flight watch (its ChangeLines).

The figures come from the planner as its other endpoints give them
(nothing is fetched here that the briefing, the Go / No-Go or the debrief
does not fetch already).

The ids a sentence cites: "flight:route"; "notam:<id>" ("notam:BJC
10/060"); "tfr:<notam id>"; "metar:<ident>"; "taf:<station>";
"hazard:<n>", "hazard-gone:<n>"; "gairmet:<n>", "gairmet-gone:<n>";
"pirep:<n>"; "below-vfr:<ident>"; "vfr-not-recommended"; "unchecked";
"verdict:line"; "finding:<key>"; "risk:line", "risk:<factor key>";
"pilot:record"; "time", "leg:<n>", "pass:<n>", "pattern:<ident>",
"note:<n>", "tolerances"."""

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from wingtip import notams, tfr

from ..router_basics import load_route
from ..figures.schemas import DebriefAnswer
from ..gonogo import ask as engine
from ..gonogo.schemas import RiskAssessment
from ..schemas.common import Briefing
from ..schemas.words import WordsSource as Source, WordsSources
from .. import route_briefing
from ..words_changes import briefing_changes
from ..words_sources import briefing_sources, departure_s, flight_source, notam_source, record_lines, tfr_source
from ..words_sources import debrief_sources as debrief_lines

router = APIRouter()

# --- The asks -----------------------------------------------------------


class RouteAsk(BaseModel):
    """A route as the words are asked for it: its ends, the stops landed
    at between them in order (app.router_basics.load_route) and when it leaves
    (UTC when naive; now when not given)."""

    dep: str
    dest: str
    stops: list[str] = []
    depart: datetime | None = None


class WeatherAsk(RouteAsk):
    """The briefing's own parameters besides the route (GET /api/briefing):
    the flight's minutes, and the nav log's fixes ("lat,lon;lat,lon") and
    each leg's minutes where the page has them, for each hazard to be
    placed where the flight meets it."""

    ete_min: float | None = None
    fixes: str = ""
    leg_min: str = ""


class VerdictLineLoose(BaseModel):
    finding: str
    words: str = ""


class VerdictItemLoose(BaseModel):
    key: str
    label: str
    finding: str
    detail: str = ""


class RiskVerdict(BaseModel):
    """The Go / No-Go as POST /api/go-no-go answers it (its line, its
    items, its risk assessment), or as the web app's own twin keeps it
    (lib/verdict: the line's finding and words on the object itself, its
    items, no risk assessment): either reads here, the extras dropped."""

    line: VerdictLineLoose | None = None
    finding: str | None = None
    words: str | None = None
    items: list[VerdictItemLoose] = []
    risk: RiskAssessment | None = None

    @property
    def over(self) -> VerdictLineLoose | None:
        """The line over the findings, however the client wrote it."""
        if self.line:
            return self.line
        return VerdictLineLoose(finding=self.finding, words=self.words or "") if self.finding else None


class RiskAsk(BaseModel):
    """The Go / No-Go as the client has it (RiskVerdict), and the pilot's
    own record as the client keeps it -- personal minimums, currency,
    recency, whatever it has, by its own keys -- given to the model as one
    source the words can cite."""

    verdict: RiskVerdict
    #: Bounded, as it all goes to the model: 50 keys, 20,000 characters.
    pilot: dict | None = Field(default=None, max_length=50)

    @field_validator("pilot")
    @classmethod
    def _pilot_small(cls, v):
        if v is not None and len(json.dumps(v)) > 20_000:
            raise ValueError("the pilot's record is at most 20,000 characters")
        return v


class DebriefWordsAsk(BaseModel):
    """The debrief as POST /api/debrief answered it (the debrief and the
    tolerances), or as the web app's own twin keeps it (lib/debrief: the
    figures alone, their keys camel-cased, without the flown line and the
    profile, thousands of points a sentence cannot use): `debrief_of`
    reads either."""

    debrief: dict


def _snake(value):
    """The web's camelCase keys as the planner's snake_case, all the way
    down: flownMin to flown_min, plannedAltFt to planned_alt_ft."""
    if isinstance(value, dict):
        return {re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", k).lower(): _snake(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_snake(v) for v in value]
    return value


def debrief_of(raw: dict) -> DebriefAnswer:
    """The debrief and its tolerances from what the client sent: the
    planner's own answer as it was, or the web's figures with the drawn
    lists left empty and the engine's tolerances put beside them."""
    if "tolerances" in raw or "debrief" in raw:
        return DebriefAnswer.model_validate(raw)
    # The web's twin keeps no marks (FlightPage works them beside each
    # figure), so they are put on here as /api/debrief puts them on.
    return DebriefAnswer.model_validate(engine("debrief_marked", debrief={"profile": [], "planned": [], "line": [], **_snake(raw)}))


class ChangesAsk(BaseModel):
    """A briefing read twice, as GET /api/briefing answered it then and
    now."""

    dep: str
    dest: str
    stops: list[str] = []
    then: Briefing
    now: Briefing


# --- Sources from the planner's figures ---------------------------------


def _coverage_since() -> str | None:
    """The day the store first heard the NOTAM feed, ISO date (UTC): NOTAMs
    issued before it and never changed are not held, so every NOTAM answer
    says from when it can speak."""
    t = notams.since()
    return None if t is None else datetime.fromtimestamp(t, timezone.utc).date().isoformat()


@router.post("/api/words/notams/sources")
def notam_sources(ask: RouteAsk) -> WordsSources:
    """The NOTAMs and TFRs of a flight as sources, with the flight itself
    first: the NOTAMs in force or to come at every field the route lands
    at, as the FAA's NOTAM feed gave them (wingtip.notams, SWIM's FNS),
    and the TFRs near the route over the briefing's hours
    (wingtip.tfr.along_route, as GET /api/briefing asks them: two hours of
    flight and an hour past, the route's own time not being known here).
    None at all where there is no NOTAM and no TFR: nothing to say.
    `coverage_since`, the day the NOTAM feed was first heard (UTC); `unchecked`, "tfrs"
    where tfr.faa.gov did not answer."""
    r = load_route(ask.dep, ask.dest, ask.stops)
    fields = list(dict.fromkeys(i for i, a in zip(r.idents, r.airports) if not a.get("fix")))
    start = departure_s(ask.depart)
    found = notams.at_fields(fields, now=start)
    path = [(a["lat"], a["lon"]) for a in r.airports]
    end = start + route_briefing.DEFAULT_ETE_MIN * 60 + route_briefing.MARGIN_S
    unchecked = []
    try:
        tfrs = tfr.along_route(path, datetime.fromtimestamp(start, timezone.utc), datetime.fromtimestamp(end, timezone.utc))
    except tfr.TfrUnavailable:
        tfrs, unchecked = [], ["tfrs"]
    items = [*map(notam_source, found), *map(tfr_source, tfrs)]
    sources = [flight_source(r.idents[0], r.idents[-1], ask.stops, start), *items] if items else []
    return WordsSources(sources=sources, coverage_since=_coverage_since(), unchecked=unchecked)


@router.post("/api/words/weather/sources")
def weather_sources(ask: WeatherAsk) -> WordsSources:
    """The briefing of a flight as sources (GET /api/briefing, asked here
    with the same parameters: its METARs, its TAF stations at the flight's
    time there, its hazards, G-AIRMETs, pilot reports and TFRs, the fields
    below VFR and its own "VFR flight not recommended"), the flight first.
    A briefing that cannot be had fails as it does there (a 502)."""
    raw = route_briefing.briefing(ask.dep, ask.dest, ",".join(ask.stops), ask.depart, ask.ete_min, ask.fixes, ask.leg_min)
    b = Briefing.model_validate(raw)
    flight = flight_source(
        ask.dep.upper(),
        ask.dest.upper(),
        ask.stops,
        departure_s(ask.depart),
        ask.ete_min if ask.ete_min is not None else route_briefing.DEFAULT_ETE_MIN,
    )
    return WordsSources(sources=[flight, *briefing_sources(b)])


@router.post("/api/words/risk/sources")
def risk_sources(ask: RiskAsk) -> WordsSources:
    """The Go / No-Go as sources (POST /api/go-no-go's line, each
    finding's line, the risk assessment's level and every factor it
    counted) and the pilot's own record as the client sends it."""
    v = ask.verdict
    sources = []
    if (line := v.over) is not None:
        sources.append(Source(id="verdict:line", label="Go / No-Go", text=f"{line.finding}: {line.words}"))
    sources += [Source(id=f"finding:{i.key}", label=f"{i.label}: {i.finding}", text=i.detail) for i in v.items]
    if v.risk:
        sources.append(
            Source(
                id="risk:line", label="Risk assessment", text=f"{v.risk.line}. {v.risk.words} {v.risk.score} points, level {v.risk.level}."
            )
        )
        for f in v.risk.factors:
            unlawful = " Makes the flight unlawful as planned." if f.stop else ""
            sources.append(Source(id=f"risk:{f.key}", label=f.label, text=f"{f.why or f.label}. {f.points} points.{unlawful}"))
    if ask.pilot:
        sources.append(Source(id="pilot:record", label="The pilot's record", text=record_lines(ask.pilot)))
    return WordsSources(sources=sources)


@router.post("/api/words/debrief/sources")
def debrief_sources(ask: DebriefWordsAsk) -> WordsSources:
    """A flown flight's debrief as sources (POST /api/debrief: the time in
    the air, each leg's altitude and course held, each checkpoint's time,
    each pattern entry, its notes, and the ACS tolerances they are marked
    against). A 422 where there is no debrief: the track never flew."""
    try:
        answer = debrief_of(ask.debrief)
    except (ValueError, KeyError, TypeError) as err:
        # A validation error, or the marks asked of figures with no legs,
        # passes or patterns at all: not a debrief either way.
        raise HTTPException(422, f"The debrief is not in a shape the words can read: {err!r}") from err
    if answer.debrief is None:
        raise HTTPException(422, "There is no debrief to put into words: the track never flew faster than taxiing.")
    return WordsSources(sources=debrief_lines(answer.debrief, answer.tolerances))


@router.post("/api/words/changes/sources")
def changes_sources(ask: ChangesAsk) -> WordsSources:
    """What changed between two readings of a flight's briefing, each
    change a source with both readings (briefing_changes), the flight
    first; none at all where nothing did, which is most half hours of a
    flight watch, so the watch sends nothing then."""
    changes = briefing_changes(ask.then, ask.now)
    return WordsSources(sources=[flight_source(ask.dep.upper(), ask.dest.upper(), ask.stops), *changes] if changes else [])
