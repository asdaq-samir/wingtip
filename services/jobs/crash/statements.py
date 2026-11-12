"""The FAA's Statements on Aviation Accidents and Incidents
(faa.gov/newsroom/statements/accident_incidents): the same day's word of
an accident, read into leads. The page is plain HTML, each day an <h3>
("November 8, 2026") and each event under it a paragraph with a bold
"General Aviation / Mayfield, Kentucky" and the statement's words after
it. The statements seldom give an N-number (the preliminary notices do,
a day or two later; notices.py), and send the press to local authorities
for the names of those on board, which no lead carries.

Read with BeautifulSoup (beautifulsoup4, Python's own html.parser under
it), and only the events whose words say an aircraft crashed: a safe
diversion or a passenger disturbance is no film."""

from __future__ import annotations

import datetime as dt
import re

import requests
from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from wingtip.config import FAA_HEADERS

from . import places

URL = "https://www.faa.gov/newsroom/statements/accident_incidents"
SOURCE = "faa_statement"
TIMEOUT_S = 30

_DAY = re.compile(r"^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$")
_MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
#: "on Sunday, Nov. 8" / "on Nov. 8": the event's own date, which may be
#: before the day the statement is listed under.
_ON = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})\b")
#: "around 1:15 p.m.", "around 9 a.m." -- a time with no a.m. or p.m. ("around 2:25 local
#: time") is not read: it could be either, and the engine then takes the
#: whole local day.
_TIME = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.\s*m\.", re.I)
_CRASH = re.compile(r"\b(crash(?:ed|es)?|ditched|collided|went down|impacted)\b", re.I)
_FATAL = re.compile(r"\b(died|killed|fatal(?:ly|ities)?|deceased|did not survive)\b", re.I)
#: An N-number as the FAA writes one (N1 to N99999, up to two letters after).
N_NUMBER = re.compile(r"\bN[1-9][0-9]{0,4}[A-HJ-NP-Z]{0,2}\b")
#: "A Cessna 172 crashed ..." -- the aircraft as the statement names it.
_AIRCRAFT = re.compile(r"^(?:An?|The) (.+?) (?:helicopter |airplane |plane |aircraft )?(?:crashed|ditched|collided|went down|impacted)\b")


def fetch(session: requests.Session | None = None) -> str:
    """The page's HTML: one polite request a run."""
    resp = (session or requests).get(URL, headers=FAA_HEADERS, timeout=TIMEOUT_S)
    resp.raise_for_status()
    return resp.text


def _event_date(text: str, listed: dt.date) -> dt.date:
    """The date the words give ("on Sunday, Nov. 8"), in the year that puts
    it on or before the day it is listed under; else that day."""
    m = _ON.search(text)
    if not m:
        return listed
    month, day = _MONTHS[m.group(1)[:3].lower()], int(m.group(2))
    for year in (listed.year, listed.year - 1):
        try:
            when = dt.date(year, month, day)
        except ValueError:
            continue
        if when <= listed:
            return when
    return listed


def _local_time(text: str) -> str | None:
    m = _TIME.search(text)
    if not m:
        return None
    hour, minute = int(m.group(1)) % 12, int(m.group(2) or 0)
    if m.group(3).lower() == "p":
        hour += 12
    return f"{hour:02d}:{minute:02d}" if hour < 24 and minute < 60 else None


def _event(listed: dt.date, heading: str, text: str) -> dict | None:
    category, _, where = heading.partition("/")
    city, _, state_name = where.strip().rpartition(",")
    if not _CRASH.search(text):
        return None
    aircraft = _AIRCRAFT.search(text)
    # A name of a few words, or none: never a clause the pattern ran into.
    if aircraft and (len(aircraft.group(1).split()) > 6 or " and " in aircraft.group(1)):
        aircraft = None
    numbers = N_NUMBER.findall(text)
    return {
        "local_date": _event_date(text, listed).isoformat(),
        "local_time": _local_time(text),
        "city": city.strip() or None,
        "state": places.state_code(state_name),
        "category": category.strip(),
        "aircraft": aircraft.group(1) if aircraft else None,
        "n_number": numbers[0] if len(set(numbers)) == 1 else None,
        "fatal": True if _FATAL.search(text) else None,
        "heading": heading,
        "text": text,
    }


def parse(html: str) -> list[dict]:
    """Every crash the page lists: {"local_date", "local_time" (HH:MM or
    None), "city", "state" (postal code), "category", "aircraft",
    "n_number" (where the words give exactly one), "fatal" (True where the
    words say so, else None: not known), "heading", "text" (the FAA's
    words, as written)}.

    The page is read as a stream, not paragraph by paragraph: a day's
    <h3>, an event's bold "Category / Place" heading (which the page
    sometimes sets at the end of the paragraph before, after a <br>), and
    the words between them."""
    soup = BeautifulSoup(html, "html.parser")
    body = soup.find("article") or soup
    listed: dt.date | None = None
    heading: str | None = None
    words: list[str] = []
    out: list[dict] = []

    def close() -> None:
        if listed and heading and words:
            event = _event(listed, heading, " ".join(" ".join(words).split()))
            if event:
                out.append(event)

    for node in body.descendants:
        if isinstance(node, Tag):
            text = " ".join(node.get_text(" ", strip=True).split())
            if node.name == "h3":
                close()
                m = _DAY.match(text)
                listed = dt.date(int(m.group(3)), dt.datetime.strptime(m.group(1), "%B").month, int(m.group(2))) if m else None
                heading, words = None, []
            elif node.name in ("strong", "b") and "/" in text and len(text) < 120:
                close()
                heading, words = text, []
            continue
        if heading is None or not isinstance(node, NavigableString) or isinstance(node, Comment):
            continue
        # The heading's own words, a day's, and the "back to the top" link's are not the statement's.
        if node.find_parent(["strong", "b", "h3", "a", "script", "style"]) is not None:
            continue
        if node.strip():
            words.append(str(node).replace("\xa0", " "))
    close()
    return out
