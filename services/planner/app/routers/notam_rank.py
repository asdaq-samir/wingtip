"""POST /api/notams/ranked: the flight's NOTAMs and TFRs, the ones that
bear on it first (wingtip.notam_rank, the engine's notams_ranked). The
route parses the ask, finds the route's fields and asks; the ranking is
the engine's. The Brief's "NOTAMs that matter" are its first three; the
phones may ask it as it is.

GET /api/airport/{ident}/notams: one field's own NOTAMs and the TFRs near
it, ranked the same way, for the field's card."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from wingtip import airports, notam_rank, time_zone

from ..gateway import PUBLIC, PUBLIC_READ_BY_POST
from ..router_basics import load_route
from ..schemas.notam_rank import NotamsRanked, NotamsRankedAsk

router = APIRouter()


def _end(ident: str) -> str:
    """ "36" from "RWY 36" or "36": the end as the engine reads it."""
    return ident.strip().upper().removeprefix("RWY").strip()


@router.post("/api/notams/ranked", openapi_extra=PUBLIC_READ_BY_POST)
def notams_ranked(ask: NotamsRankedAsk) -> NotamsRanked:
    """Every NOTAM the FAA's feed has sent for the fields the route lands
    at and every TFR near it, best first: in force while the flight is
    there, at its departure, stops or destination, on the runway in use,
    closing a field, its altitudes taking in the cruise altitude, on an
    airspace the route passes (14 CFR 91.103). `top` are said first; the
    rest are folded, never dropped. `coverage_since`, the day the feed
    was first heard (UTC)."""
    r = load_route(ask.dep, ask.dest, ",".join(ask.stops))
    landed = [(i, a) for i, a in zip(r.idents, r.airports) if not a.get("fix")]
    fields = [(ident, "dep" if n == 0 else "dest" if n == len(landed) - 1 else "stop") for n, (ident, _) in enumerate(landed)]
    depart = ask.depart or datetime.now(timezone.utc)
    depart = depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)
    runways = {k.upper(): [_end(v)] for k, v in ask.runways.items() if v.strip()}
    found = notam_rank.ranked(fields, [(a["lat"], a["lon"]) for a in r.airports], depart, ask.ete_min, ask.altitude_ft, runways)
    return NotamsRanked(notams=found["ranked"], top=found["top"], coverage_since=notam_rank.coverage_since(), unchecked=found["unchecked"])


@router.get(
    "/api/airport/{ident}/notams", response_model=NotamsRanked, responses={404: {"description": "No such field"}}, openapi_extra=PUBLIC
)
def airport_notams(ident: str) -> NotamsRanked:
    """One field's own NOTAMs (the FAA's feed, by any ident it goes by)
    and the TFRs within 5 nm of it, best first, as /api/notams/ranked ranks
    a route's: the field read as a stop from an hour ago to three hours
    ahead (14 CFR 91.103 asks for the NOTAMs of every field a flight
    uses). With no flight there is no runway in use or cruise altitude to
    weigh. `unchecked` names the TFRs when their list could not be had;
    `time_zone` is the field's, for its NOTAMs' local times."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    found = notam_rank.at_field(place["ident"], place["lat"], place["lon"], datetime.now(timezone.utc))
    return NotamsRanked(
        notams=found["ranked"],
        top=found["top"],
        coverage_since=notam_rank.coverage_since(),
        unchecked=found["unchecked"],
        time_zone=time_zone.at(place["lat"], place["lon"]),
    )
