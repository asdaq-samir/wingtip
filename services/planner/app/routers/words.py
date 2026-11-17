"""What changed in a flight's briefing since the last look, each change a
line a sentence can cite and a pilot can read raw, at POST
/api/words/changes/sources: the gateway asks it for a pilot's flight
watch (its ChangeLines) and forwards it to no app.

The figures come from the planner as GET /api/briefing gives them
(nothing is fetched here).

The ids a sentence cites: "flight:route"; "tfr:<notam id>";
"hazard:<n>", "hazard-gone:<n>"; "gairmet:<n>", "gairmet-gone:<n>";
"below-vfr:<ident>"; "metar:<ident>"; "taf:<station>"."""

from fastapi import APIRouter
from pydantic import BaseModel

from ..schemas.common import Briefing
from ..schemas.words import WordsSources
from ..words_changes import briefing_changes
from ..words_sources import flight_source

router = APIRouter()


class ChangesAsk(BaseModel):
    """A briefing read twice, as GET /api/briefing answered it then and
    now."""

    dep: str
    dest: str
    stops: list[str] = []
    then: Briefing
    now: Briefing


@router.post("/api/words/changes/sources")
def changes_sources(ask: ChangesAsk) -> WordsSources:
    """What changed between two readings of a flight's briefing, each
    change a source with both readings (briefing_changes), the flight
    first; none at all where nothing did, which is most half hours of a
    flight watch, so the watch sends nothing then."""
    changes = briefing_changes(ask.then, ask.now)
    return WordsSources(sources=[flight_source(ask.dep.upper(), ask.dest.upper(), ask.stops), *changes] if changes else [])
