"""Stage 3's kit: what the Studio's film of a confirmed draft is made
from, into its folder in the shared store (wingtip.crash_drafts.kit_dir),
one JSON file a part:

- ``lead.json``: the facts and the captions (below), and every source's
  words as it gave them;
- ``track.json``: the ADS-B track, as the Studio keeps one
  (/api/studio/track's answer), for a draft with one; none for a draft of
  the place alone, which is marked "No ADS-B track" and never given a
  guessed path;
- ``tfrs.json``: the TFRs within 30 nm of the place in the event's window,
  from the weather store's list (wingtip.tfr), only where the event was
  within the day: the store keeps today's list, not the past's;
- the weather then and the NTSB's record: TODO(claude/studio-2), whose
  IEM reader (wingtip/history/iem.py) and NTSB reader
  (services/ingest/ingest/ntsb.py) give them.

The captions are facts only (docs/STUDIO-PIPELINE.md, "The rules"): the
FAA's or the NTSB's words quoted as they wrote them, "Preliminary" said,
the airplane's make and model, the place and the date, and where the
track came from. No cause, no blame and no names: the FAA itself sends the
press to local authorities for the names of those on board."""

from __future__ import annotations

import datetime as dt
import json
import logging
import time

from wingtip import crash_drafts, tfr

from . import ntsb

log = logging.getLogger(__name__)

#: How far round the place the TFRs are kept, nm: a film's frame.
TFR_NEAR_NM = 30.0

_SOURCE_NAMES = {"faa_statement": "FAA statement", "faa_notice": "FAA preliminary notice", "ntsb": "NTSB"}


def captions(lead: dict) -> dict:
    """The film's words, from the lead's facts and its sources' own words."""
    day = dt.date.fromisoformat(lead["local_date"])
    place = ", ".join(p for p in (lead.get("city"), lead.get("state")) if p)
    title = " · ".join(p for p in (lead.get("aircraft") or "Aircraft", place, f"{day:%B} {day.day}, {day.year}") if p)
    quotes = [
        {"source": _SOURCE_NAMES.get(s.get("source"), s.get("source")), "words": s["text"], "url": s.get("url")}
        for s in lead.get("sources") or []
        if s.get("text")
    ]
    credits = sorted({q["source"] for q in quotes if q["source"]})
    if lead.get("track") == "adsb":
        credits.append("ADS-B: adsb.lol, ODbL 1.0")
    return {
        "title": title,
        "status": "Preliminary information, subject to change.",
        "track": None if lead.get("track") == "adsb" else "No ADS-B track",
        "quotes": quotes,
        "credits": credits,
    }


def _write(folder, name: str, data) -> None:
    part = folder / f"{name}.json.part"
    part.write_text(json.dumps(data, indent=1))
    part.replace(folder / f"{name}.json")


def make(lead: dict, track: dict | None = None, now: float | None = None) -> dict:
    """The kit of a ready draft, written; the draft as it is now."""
    now = now if now is not None else time.time()
    folder = crash_drafts.kit_dir(lead["id"])
    folder.mkdir(parents=True, exist_ok=True)
    facts = {
        k: lead.get(k)
        for k in ("id", "n_number", "hex", "local_date", "local_time", "city", "state", "lat", "lon", "place", "aircraft", "fatal", "track")
    }
    _write(folder, "lead", {**facts, "identity": lead.get("identity"), "sources": lead.get("sources"), "captions": captions(lead)})
    if track is not None:
        _write(folder, "track", track)
    window = (lead.get("identity") or {}).get("window")
    if window and now - window["end"] < 86400 and lead.get("lat") is not None:
        start, end = (dt.datetime.fromtimestamp(window[k], dt.timezone.utc) for k in ("start", "end"))
        try:
            near = tfr.near_point(lead["lat"], lead["lon"], start, end, TFR_NEAR_NM)
            _write(folder, "tfrs", {"taken_at": now, "tfrs": near})
        except tfr.TfrUnavailable as err:
            log.info("draft %s: no TFR list in the store (%s)", lead["id"], err)
    record = ntsb.record(lead.get("n_number") or "", lead["local_date"])
    if record is not None:
        _write(folder, "ntsb", record)
    return crash_drafts.update(lead["id"], kit_at=now)
