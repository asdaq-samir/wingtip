"""The crash-leads job, `python -m crash [every|poll|parse-check]` (the
image's entry point):

- `every`: a run of `poll` now and each CRASH_LEADS_EVERY_MIN (30) after,
  for as long as the container runs: the job keeps its own schedule
  (docker-compose.yml's `crash-leads`), so no other service starts it.
  CRASH_LEADS_AUTO=0 runs none. On AWS a scheduled task runs `poll`
  instead, when the pipeline moves there (#115).

- `poll` (the default): one run of stages 1 to 3 (docs/STUDIO-PIPELINE.md).
  The FAA's statements page is read once (statements.py) and the
  preliminary notices dropped in data/raw/faa_prelim (notices.py), into
  leads (wingtip.crash_drafts); each lead still waiting is checked
  (identity.py: the engine's occurrence_identity over the registry and the
  ADS-B track); each ready draft without a kit is given one (kit.py); and
  each kit is filled with what the history has come to hold since (the
  weather then, the NOTAMs then, the NTSB's record: then.py). A source
  that cannot be read is said in the log and the rest go on.
- `parse-check`: the statements page read and parsed, its crashes printed,
  nothing written: a look at whether the FAA has changed the page.

By hand, `docker compose run --rm crash-leads poll`. One request to each
source a run, with wingtip's plain User-Agent. The gateway mails the
developers each draft the runs make ready (CrashDraftMail); nothing else
here is anyone else's.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
import time

import requests
from wingtip import crash_drafts
from wingtip.config import get_settings
from wingtip.engine import ask
from wingtip.traffic import TrafficUnavailable

from . import identity, kit, notices, statements

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


def fill_kits() -> int:
    """Stage 3 again: each made kit of a draft not set aside given the
    history's parts it lacks (kit.fill), the NTSB's record among them,
    which comes a week or more after the event; how many parts."""
    added = 0
    for lead in crash_drafts.drafts("ready") + crash_drafts.drafts("rendered"):
        if lead["kit_at"]:
            added += len(kit.fill(lead))
    return added


def poll() -> int:
    seen = read_sources()
    checked = check_identities()
    made = make_kits(checked)
    filled = fill_kits()
    log.info("crash leads: %d events read, %d leads checked, %d kits made, %d kit parts added", seen, len(checked), made, filled)
    return 0


def every() -> int:
    """`poll` now and each CRASH_LEADS_EVERY_MIN after, never ending; a run
    that fails is said in the log and the next goes on. None where
    CRASH_LEADS_AUTO is 0, and the container ends."""
    settings = get_settings()
    if not settings.crash_leads_auto:
        log.info("crash leads: CRASH_LEADS_AUTO is off, no runs")
        return 0
    every_s = max(5, settings.crash_leads_every_min) * 60
    while True:
        try:
            poll()
        except Exception:  # noqa: BLE001 -- the next run tries again
            log.warning("crash leads: the run failed", exc_info=True)
        time.sleep(every_s)


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
    parser.add_argument("command", nargs="?", default="poll", choices=["every", "poll", "parse-check"])
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    return {"every": every, "poll": poll, "parse-check": parse_check}[args.command]()
