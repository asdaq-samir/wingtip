"""An ATC clearance heard by the phone, its places found: the web's
lib/clearance and the app's Clearance read the words the recognizer
wrote into the clearance's items (AIM 4-4-3), and ask here for the
idents of the places it named, near the route. This finds the places and
the procedures they may be (NASR, the CIFP) and the engine says which
(`clearance_places`, engine/crates/airspace/src/spoken.rs). Before
listening, the names the recognizer is told to expect."""

import functools
import math
import re

from fastapi import APIRouter, Query, Response
from wingtip import airports, fixes, procedures
from wingtip.engine import ask as engine

from ..router_basics import near_points
from ..schemas.clearance import ClearanceAsk, ClearancePlaces, ClearanceWords
from ..gateway import PUBLIC, PUBLIC_READ_BY_POST

router = APIRouter()

#: How far round the route's points a place said is looked for, degrees:
#: about 60 nm of latitude, a clearance's points being near its route.
PAD_DEG = 1.0

#: As many names as Apple suggests a recognizer's contextualStrings hold.
MOST_WORDS = 100


def _corridor(near: tuple) -> list[tuple[float, float, float, float]]:
    """Boxes along the lines between the route's points, a degree apart
    and PAD_DEG round each: a navaid halfway along a long route -- Hill
    City on one from San Jose to Nashville -- is outside the boxes round
    its ends, and a box round both ends is most of the country."""
    boxes = []
    for (lat1, lon1), (lat2, lon2) in zip(near, near[1:] or near):
        steps = max(1, int(max(abs(lat2 - lat1), abs(lon2 - lon1))))
        for k in range(steps + 1):
            lat, lon = lat1 + (lat2 - lat1) * k / steps, lon1 + (lon2 - lon1) * k / steps
            boxes.append((lat - PAD_DEG, lon - PAD_DEG * 1.4, lat + PAD_DEG, lon + PAD_DEG * 1.4))
    return boxes


def _places(near: tuple) -> list[dict]:
    """The navaids, fixes and airports along the route, each with `what`
    it is, as the engine's clearance_places takes them."""
    if not near:
        return []
    lats = [p[0] for p in near]
    seen, found = set(), []
    for south, west, north, east in _corridor(near):
        for f in fixes.within(south, west, north, east):
            place = {**f, "what": "navaid" if f.get("navaid") else "fix"}
            if (place["ident"], place["what"], place["lat"]) not in seen:
                seen.add((place["ident"], place["what"], place["lat"]))
                found.append(place)
        for a in airports.places_in(south, west, north, east, limit=200):
            if (a["ident"], "airport", a["lat"]) not in seen:
                seen.add((a["ident"], "airport", a["lat"]))
                found.append({**a, "what": "airport"})
    # The nearest to the route's points first: of two fixes that sound the
    # same, PYKLA by Duluth and PICLE in Iowa, the one by the route
    # (the engine keeps this order between equals).
    # Flat-earth distances do for an order, at a thousandth of the cost.
    squeeze = math.cos(math.radians(sum(lats) / len(lats)))
    return sorted(found, key=lambda p: min((p["lat"] - lat) ** 2 + ((p["lon"] - lon) * squeeze) ** 2 for lat, lon in near))


@functools.cache
def _navaids_by_name() -> dict[str, list[dict]]:
    """Every navaid in service by its name as words ("WILL ROGERS"), held
    while the planner runs: a few thousand."""
    by_name: dict[str, list[dict]] = {}
    for navaid in fixes.navaids():
        if navaid.get("name"):
            by_name.setdefault(_words(navaid["name"]), []).append({**navaid, "what": "navaid"})
    return by_name


def _exact(said: str, near: tuple) -> list[dict]:
    """The places anywhere whose ident one of the words, or all of them
    run together, is -- a point spelled in the phonetic alphabet far from
    the route's ends -- and the navaids anywhere named by a run of them:
    a route that doglegs far off the line between the points known, as
    one from Charlotte to Phoenix by Will Rogers (IRW) does."""
    words = re.findall(r"[a-z0-9]+", said.lower())
    out = []
    by_name = _navaids_by_name()
    for n in (1, 2, 3):
        for i in range(len(words) - n + 1):
            out += by_name.get(" ".join(words[i : i + n]).upper(), [])
    for ident in {"".join(words).upper(), *(w.upper() for w in words)}:
        if len(ident) < 2:
            continue
        navaid = fixes.find_navaid(ident, near)
        if navaid:
            out.append({**navaid, "what": "navaid"})
        fix = fixes.find_fix(ident)
        if fix:
            out.append({**fix, "what": "fix"})
        place = airports.find_place(ident)
        if place:
            out.append({**place, "what": "airport"})
    return out


def _words(said: str) -> str:
    """Words as the index is keyed, in capitals, marks gone: "WILKES
    BARRE" for Wilkes-Barre. A key to look places up by, not a match:
    the engine decides what was said."""
    return " ".join(re.findall(r"[A-Z0-9']+", said.upper()))


def _airports(said: str, near: tuple) -> dict[str, dict]:
    """The field the airport search finds for each run of the words said,
    the nearest of its name, by the run: the engine takes the longest run
    its own reading of the words has one for. A single word of fewer than
    four letters is not searched."""
    words = _words(said).split()
    found = {}
    for n in range(len(words), 0, -1):
        for i in range(len(words) - n + 1):
            run = " ".join(words[i : i + n])
            if run in found or (n == 1 and len(run) < 4):
                continue
            hits = airports.search_airports(run, limit=1, near=list(near) or None)
            place = airports.find_place(hits[0]["ident"]) if hits else None
            if place and place.get("lat") is not None:
                found[run] = _candidate({**place, "what": "airport"})
    return found


def _candidate(place: dict) -> dict:
    """A place as the engine takes it."""
    return {k: place.get(k) for k in ("ident", "name", "what", "lat", "lon")}


def _navaid_names(places: list[dict]) -> dict[str, str]:
    return {p["ident"]: p["name"] for p in places if p["what"] == "navaid" and p.get("name")}


def _procedure(field: str | None, ask) -> dict | None:
    """A SID or STAR said, with its field's own procedures (the CIFP) for
    the engine to find it among."""
    listed = procedures.procedures_at(field) if field and ask is not None else None
    if not listed:
        return None
    given = [{"id": p["id"], "kind": p["kind"], "transitions": p["transitions"]} for p in listed["procedures"]]
    return {"name": ask.name, "number": ask.number, "transition": ask.transition, "procedures": given}


@router.post("/api/clearance/places", openapi_extra=PUBLIC_READ_BY_POST)
def clearance_places(ask: ClearanceAsk) -> ClearancePlaces:
    """The places a clearance said, found near the route: its limit (an
    airport by its name, AIM 4-4-3 a), each phrase of its route as the
    points in it, and its SID and STAR among its fields' own. A place
    found by its sound alone is not `sure`; one not found has no ident."""
    near = near_points(ask.near)
    places = _places(near)
    # The places anywhere spelled or named in what was said, after those
    # near the route: of two alike, the nearer stays first.
    seen = {(p["ident"], p["what"], p["lat"]) for p in places}
    for said in [ask.limit or "", *ask.route]:
        for p in _exact(said, near):
            if (p["ident"], p["what"], p["lat"]) not in seen:
                seen.add((p["ident"], p["what"], p["lat"]))
                places.append(p)
    return engine(
        "clearance_places",
        places=[_candidate(p) for p in places if p.get("lat") is not None and p.get("lon") is not None],
        limit=ask.limit,
        limit_airports=_airports(ask.limit, near) if ask.limit else {},
        route=ask.route,
        departure=_procedure(ask.dep, ask.departure),
        arrival=_procedure(ask.dest, ask.arrival),
    )


@router.get("/api/clearance/words", openapi_extra=PUBLIC)
def clearance_words(response: Response, near: str = Query(default=""), dep: str = Query(default="")) -> ClearanceWords:
    """The names a clearance near the route will likely say, for the
    phone's recognizer to listen for: the departure's SIDs as said, the
    navaids' names, then the fixes' five letters as words, at most 100."""
    response.headers["Cache-Control"] = "private, max-age=3600"
    places = _places(near_points(near))
    names = _navaid_names(places)
    words: list[str] = []
    listed = procedures.procedures_at(dep) if dep else None
    for p in (listed or {}).get("procedures", []):
        m = re.fullmatch(r"([A-Z]+)\d", p["id"]) if p["kind"] == "departure" else None
        if m:
            words.append(f"{names.get(m.group(1), m.group(1).title())} departure")
    words += sorted({n for n in names.values()})
    words += sorted({p["ident"].title() for p in places if p["what"] == "fix" and len(p["ident"]) == 5})
    seen: set[str] = set()
    return {"words": [w for w in words if not (w in seen or seen.add(w))][:MOST_WORDS]}
