"""A pilot's proficiency plan in words: POST /api/words/coach.

The plan is the engine's (proficiency_plan, asked by the app through the
planner's POST /api/pilot/coach): what is due and when, the weak areas
the pilot's own debriefs show and the sessions. Nothing here decides any
of it. The planner puts the plan as lines with ids ("due:<key>",
"ev:<n>", "session:<n>", its POST /api/words/coach/sources), and the
model writes one short paragraph and a line for each session, every
sentence citing the ids it rests on; app.words' check drops a sentence
citing anything else, and here a sentence with a number its sources do
not hold goes too, so no day, hour or altitude on screen is the model's.
The sessions themselves -- what, where, how long -- are the engine's, and
the screen shows them as it gave them, the model's line under each.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from . import words
from .generated import planner_client as planner
from .gateway import gateway
from .words import Sentence, Source, WordsAnswer, WordsSaid

log = logging.getLogger(__name__)
router = APIRouter()

#: A paragraph a pilot reads at a glance (the owner, 2026-11-03: "just
#: look and go"): three short sentences; and one line a session, of the
#: engine's four at most.
MOST_SENTENCES = 3
MOST_SESSIONS = 4

COACH_ASK = (
    "Put this pilot's own proficiency plan into words, as their instructor would. The plan was worked out already: "
    "what is due and when, what their debriefed flights show, and the sessions. First, at most three short sentences: "
    "what is most pressing and why, from the due items and the evidence, naming the days as the sources give them. Then, "
    "for each session source, one line saying what to practise and why, citing that session's id and the ids it answers. "
    "Say a WINGS credit only as the source says it: it may count, never that it does. Do not add a session, a field, a "
    "time or a rule the sources do not give, and do not tell the pilot they are or are not fit to fly: the pilot in "
    "command decides (14 CFR 91.3)."
)


class SessionLine(BaseModel):
    session: str = Field(description="The session's id, exactly as given (\"session:1\").")
    text: str = Field(description="One short sentence: what to practise there and why.")
    sources: list[str] = Field(description="The ids it rests on: its session's and those the session answers.")


class CoachWords(WordsSaid):
    """What the model fills in: the paragraph's sentences and a line for
    each session."""

    session_lines: list[SessionLine] = Field(default=[], description="One line for each session, in the sessions' order.")


class CoachWordsAnswer(WordsAnswer):
    """The paragraph that passed the check, the line kept for each
    session (by its id), the sources they cite and which model wrote them."""

    session_lines: list[SessionLine] = []


_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def _numbers_held(text: str, cited: list[Source]) -> bool:
    """Whether every number in `text` is written in one of its sources:
    a day, an altitude or a minute count the model made up is dropped."""
    held = " ".join(s.text + " " + s.label for s in cited)
    return all(n in held for n in _NUMBER.findall(text))


def _kept(sentences: list[Sentence], sources: list[Source]) -> list[Sentence]:
    by_id = {s.id: s for s in sources}
    kept = []
    for s in sentences:
        if _numbers_held(s.text, [by_id[i] for i in s.sources if i in by_id]):
            kept.append(s)
        else:
            log.info("Dropped a sentence with a number its sources do not hold: %r", s.text[:120])
    return kept


def _lines(lines: list[SessionLine], sources: list[Source]) -> list[SessionLine]:
    """A line for a session given, citing it and only ids given, each
    number held by them; the first line of each session kept."""
    given = {s.id: s for s in sources}
    out: dict[str, SessionLine] = {}
    for line in lines:
        ids = list(dict.fromkeys(i.strip() for i in line.sources if i.strip()))
        ok = (line.session in given and line.session.startswith("session:") and line.session in ids
              and all(i in given for i in ids) and _numbers_held(line.text, [given[i] for i in ids]))
        if ok and line.session not in out and line.text.strip():
            out[line.session] = SessionLine(session=line.session, text=line.text.strip(), sources=ids)
        elif not ok:
            log.info("Dropped a session line citing %s: %r", ids, line.text[:120])
    return list(out.values())[:MOST_SESSIONS]


#: The pilot's plan, a few KB; the paid words' gate and allowance.
COACH = gateway("signed-in", paid="WORDS", body_limit=64 * 1024)


@router.post("/api/words/coach", openapi_extra=COACH)
def coach_words(plan: dict = Body(..., description="The planner's POST /api/pilot/coach answer, passed on whole.")) -> CoachWordsAnswer:
    """A proficiency plan in a short paragraph and a line a session, each
    citing the plan's own ids. The plan is the engine's; where the model
    cannot be reached the answer has no words and says why, and the
    screen shows the plan as it is."""
    try:
        found = planner.coach_sources(body=plan)
    except planner.PlannerError as err:
        raise HTTPException(err.status, err.detail) from err
    sources = [Source(id=s.id or "", label=s.label or "", text=s.text or "") for s in found.sources or []]
    said = words.say(COACH_ASK, sources, most=MOST_SENTENCES, output=CoachWords, answer=CoachWordsAnswer)
    sentences = _kept(said.sentences, sources)
    lines = _lines(said.session_lines, sources)
    cited = {i for s in sentences for i in s.sources} | {i for line in lines for i in line.sources}
    return CoachWordsAnswer(sentences=sentences, session_lines=lines, sources=[s for s in sources if s.id in cited],
                            model=said.model, unavailable=said.unavailable)
