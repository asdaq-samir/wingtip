"""The crash-leads job, `python -m crash [poll|parse-check]` (the image's
entry point):

- `poll` (the default): one run of stages 1 to 3 (docs/STUDIO-PIPELINE.md).
  The FAA's statements page is read once (statements.py) and the
  preliminary notices dropped in data/raw/faa_prelim (notices.py), and the
  NTSB's records once claude/studio-2's reader lands (ntsb.py), into leads
  (wingtip.crash_drafts); each lead still waiting is checked (identity.py:
  the engine's occurrence_identity over the registry and the ADS-B track);
  and each ready draft without a kit is given one (kit.py). A source that
  cannot be read is said in the log and the rest go on.
- `parse-check`: the statements page read and parsed, its crashes printed,
  nothing written: a look at whether the FAA has changed the page.

The planner starts `poll` every CRASH_LEADS_EVERY_MIN (app.crash_leads,
through the dev-services sidecar), as it starts the charts job; by hand,
`docker compose run --rm crash-leads`. One request to each source a run,
with wingtip's plain User-Agent.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys

import requests
from wingtip import crash_drafts
from wingtip.engine import ask
from wingtip.traffic import TrafficUnavailable

from . import identity, kit, notices, ntsb, statements

log = logging.getLogger(__name__)

#: How far back an event is taken as a lead, days: the statements page
#: keeps more than a year, and adsb.lol's history about six weeks
#: (wingtip.traffic.flights.ARCHIVE_DAYS), so an older event could only
#: ever be a draft of the place alone.
LEAD_DAYS = 30


def recent(events: list[dict], today: dt.date | None = None) -> list[dict]:
    """The events within LEAD_DAYS, in the United States (a postal code
    read): the FAA's statements also tell of its own airlines abroad."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    since = (today - dt.timedelta(days=LEAD_DAYS)).isoformat()
    return [e for e in events if e["local_date"] >= since and e.get("state")]


def _lead_in(event: dict, source: str, url: str | None) -> str:
    facts = {k: event.get(k) for k in ("local_date", "local_time", "city", "state", "aircraft", "n_number", "fatal")}
    return crash_drafts.upsert(facts, {"source": source, "url": url, "heading": event.get("heading"), "text": event.get("text")})


def read_sources() -> int:
    """Stage 1: every source read into leads; how many events were seen."""
    seen = 0
    try:
        for event in recent(statements.parse(statements.fetch())):
            _lead_in(event, statements.SOURCE, statements.URL)
            seen += 1
    except requests.RequestException as err:
        log.warning("the FAA's statements page was not read: %s", err)
    for path, events in notices.dropped():
        for event in recent(events):
            _lead_in(event, notices.SOURCE, path.name)
            seen += 1
    for event in recent(ntsb.leads()):
        _lead_in(event, ntsb.SOURCE, None)
        seen += 1
    return seen


def check_identities() -> list[dict]:
    """Stage 2: each lead waiting, with an N-number the engine has not yet
    judged, or one a person rejected and then gave another; the confirmed
    ones with the track they were confirmed on."""
    out = []
    for lead in crash_drafts.drafts("needs_identity"):
        if lead["identity_by"] in ("engine", "rejected") and lead["identity"] is not None:
            continue
        out.append(identity.check(lead))
    return out


def make_kits(checked: list[dict]) -> int:
    """Stage 3: a kit for each ready draft without one; how many."""
    tracks = {lead["id"]: lead.get("_track") for lead in checked}
    made = 0
    for lead in crash_drafts.drafts("ready"):
        if lead["kit_at"]:
            continue
        track = tracks.get(lead["id"])
        if track is None and lead["track"] == "adsb" and lead["hex"]:
            window = (lead["identity"] or {}).get("window")
            if window is None:
                report = identity.report_of(lead)
                window = ask("occurrence_identity", report=report)["window"] if report else None
            try:
                track = identity.track_of(lead["hex"], window["start"], window["end"]) if window else None
            except TrafficUnavailable as err:
                log.info("draft %s: adsb.lol not read now (%s); its kit waits for the next run", lead["id"], err)
                continue
        kit.make(lead, track)
        made += 1
    return made


def poll() -> int:
    seen = read_sources()
    checked = check_identities()
    made = make_kits(checked)
    log.info("crash leads: %d events read, %d leads checked, %d kits made", seen, len(checked), made)
    return 0


def parse_check() -> int:
    found = statements.parse(statements.fetch())
    leads = recent(found)
    for event in leads:
        print(json.dumps({k: v for k, v in event.items() if k != "text"}))
    print(f"{len(found)} crashes on the FAA's statements page, {len(leads)} of them leads (the last {LEAD_DAYS} days, in the US)")
    return 0


def entry(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(prog="python -m crash")
    parser.add_argument("command", nargs="?", default="poll", choices=["poll", "parse-check"])
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    return poll() if args.command == "poll" else parse_check()
