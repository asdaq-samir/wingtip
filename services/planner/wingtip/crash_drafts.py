"""The Studio's crash drafts (docs/STUDIO-PIPELINE.md): each accident or
incident the FAA or the NTSB has reported, as the crash-leads job
(services/jobs/crash) found it, checked and kitted it, and as the
developer has judged it in the Studio.

One SQLite file beside the live store (``crash_leads.sqlite``, on the
live-store volume as day_tracks.sqlite is: the job writes it and the
planner reads it, and SQLite's write-ahead log needs one kernel's file
system under both), and a folder a draft for its kit (``crash_kits/<id>``):
the facts and the captions (``lead.json``), the track as the Studio keeps
one (``track.json``, where there is one), the TFRs near the place then
(``tfrs.json``, where the event was today) and, later, the weather and
the NTSB's record. Nothing here fetches; the job does, at the edge.

A draft's status, which the Studio's Drafts list shows:

- ``needs_identity``: the report, the FAA's registry and the ADS-B track
  do not all agree (the engine's ``occurrence_identity``), or the report
  gives no N-number. A person confirms it or not.
- ``ready``: they agree (or the developer confirmed it), and the kit is
  being or has been made. ``track`` is "adsb", or "none" for a draft of
  the place alone, never a guessed path.
- ``rendered``: the Studio has made its film (scripts/dev/studio-render.mjs).
- ``dismissed``: the developer set it aside.

Publishing is never here: a person publishes, after the hold the
pipeline's rules give a fatal event.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import sqlite3
import time
from pathlib import Path

from .config import get_settings

STATUSES = ("needs_identity", "ready", "rendered", "dismissed")

_COLUMNS = (
    "id TEXT PRIMARY KEY, key TEXT UNIQUE, status TEXT, n_number TEXT, hex TEXT, local_date TEXT, local_time TEXT, "
    "city TEXT, state TEXT, lat REAL, lon REAL, place TEXT, aircraft TEXT, fatal INTEGER, sources TEXT, identity TEXT, "
    "identity_by TEXT, track TEXT, kit_at REAL, noticed_at REAL, rendered_at REAL, created_at REAL, updated_at REAL"
)
#: The fields a lead's own facts may set; the rest are the pipeline's.
_FACTS = ("n_number", "local_date", "local_time", "city", "state", "lat", "lon", "place", "aircraft", "fatal")


class NoSuchDraft(LookupError):
    """No draft by that id."""


def _folder() -> Path:
    return get_settings().live_store.parent


def store_path() -> Path:
    return _folder() / "crash_leads.sqlite"


def kit_dir(draft_id: str) -> Path:
    """The draft's kit folder (made by the job, read by the planner)."""
    return _folder() / "crash_kits" / draft_id


@contextlib.contextmanager
def _db():
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10.0, isolation_level=None)
    try:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute(f"CREATE TABLE IF NOT EXISTS leads ({_COLUMNS})")
        yield db
    finally:
        db.close()


def lead_key(local_date: str, state: str | None, city: str | None) -> str:
    """One event: its local date and its place, as the FAA names it."""
    return "|".join([local_date, (state or "").strip().upper(), (city or "").strip().lower()])


def _row(row: sqlite3.Row) -> dict:
    out = dict(row)
    out["sources"] = json.loads(out["sources"] or "[]")
    out["identity"] = json.loads(out["identity"]) if out["identity"] else None
    out["fatal"] = None if out["fatal"] is None else bool(out["fatal"])
    return out


def upsert(facts: dict, source: dict, now: float | None = None) -> str:
    """The lead for `facts`' event, made or added to: its sources gain
    `source` ({"source", "url", "heading", "text"}) where it is new, and a
    fact the lead lacks is taken (an N-number from the FAA's notice for
    the statement's event). Its id."""
    now = now if now is not None else time.time()
    key = lead_key(facts["local_date"], facts.get("state"), facts.get("city"))
    draft_id = hashlib.sha256(key.encode()).hexdigest()[:12]
    with _db() as db:
        found = db.execute("SELECT * FROM leads WHERE key = ?", (key,)).fetchone()
        if found is None:
            given = {k: facts.get(k) for k in _FACTS}
            given["fatal"] = None if given["fatal"] is None else int(bool(given["fatal"]))
            db.execute(
                "INSERT INTO leads (id, key, status, sources, created_at, updated_at, "
                + ", ".join(_FACTS)
                + ") VALUES (?, ?, 'needs_identity', ?, ?, ?, "
                + ", ".join("?" for _ in _FACTS)
                + ")",
                (draft_id, key, json.dumps([{**source, "seen_at": now}]), now, now, *given.values()),
            )
            return draft_id
        lead = _row(found)
        sources = lead["sources"]
        if not any(s.get("source") == source.get("source") and s.get("text") == source.get("text") for s in sources):
            sources.append({**source, "seen_at": now})
        filled = {k: facts[k] for k in _FACTS if facts.get(k) is not None and lead.get(k) is None}
        if "fatal" in filled:
            filled["fatal"] = int(bool(filled["fatal"]))
        if "n_number" in filled and lead["status"] == "needs_identity":
            # A report's first N-number (the notice's, for the statement's
            # event) is checked afresh on the job's next run.
            filled |= {"identity": None, "identity_by": None}
        sets = ", ".join(f"{k} = ?" for k in filled)
        db.execute(
            f"UPDATE leads SET sources = ?, updated_at = ?{', ' + sets if sets else ''} WHERE id = ?",
            (json.dumps(sources), now, *filled.values(), lead["id"]),
        )
        return lead["id"]


def drafts(status: str | None = None) -> list[dict]:
    """Every draft, newest event first; those of one status where asked."""
    with _db() as db:
        rows = db.execute(
            "SELECT * FROM leads" + (" WHERE status = ?" if status else "") + " ORDER BY local_date DESC, created_at DESC",
            (status,) if status else (),
        ).fetchall()
    return [_row(r) for r in rows]


def draft(draft_id: str) -> dict:
    with _db() as db:
        row = db.execute("SELECT * FROM leads WHERE id = ?", (draft_id,)).fetchone()
    if row is None:
        raise NoSuchDraft(draft_id)
    return _row(row)


def update(draft_id: str, **fields) -> dict:
    """The draft with `fields` set (a status among STATUSES), as it is now."""
    if "status" in fields and fields["status"] not in STATUSES:
        raise ValueError(f"no status {fields['status']!r}")
    if "identity" in fields and fields["identity"] is not None:
        fields["identity"] = json.dumps(fields["identity"])
    if "fatal" in fields and fields["fatal"] is not None:
        fields["fatal"] = int(bool(fields["fatal"]))
    fields["updated_at"] = time.time()
    with _db() as db:
        changed = db.execute(
            f"UPDATE leads SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*fields.values(), draft_id)
        ).rowcount
    if not changed:
        raise NoSuchDraft(draft_id)
    return draft(draft_id)


def confirm(draft_id: str, n_number: str | None = None) -> dict:
    """The developer's own word that the identity is right: ready, the kit
    made by the job's next run. With an N-number where the report gave
    none, which the job then checks as it checks its own."""
    lead = draft(draft_id)
    if n_number and n_number.strip().upper() != (lead["n_number"] or ""):
        # A new N-number is checked against the registry and the track
        # first: the job's next run does, as for one a report gave.
        return update(draft_id, n_number=n_number.strip().upper(), hex=None, identity=None, identity_by=None, status="needs_identity")
    return update(draft_id, status="ready", identity_by="developer", track=lead["track"] or ("adsb" if lead["hex"] else "none"))


def reject(draft_id: str) -> dict:
    """The developer's word that the airplane matched is not this one: the
    match is forgotten, and the draft waits for a person again."""
    return update(draft_id, status="needs_identity", hex=None, track=None, identity_by="rejected", kit_at=None)


def to_notice() -> list[dict]:
    """The ready drafts whose kit is made and the developer has not yet
    been mailed about (the gateway's CrashDraftMail)."""
    return [d for d in drafts("ready") if d["kit_at"] and not d["noticed_at"]]


def kit(draft_id: str) -> dict:
    """What the draft's kit holds: each file's JSON by its name ("lead",
    "track", "tfrs" ...), as the job wrote it."""
    folder = kit_dir(draft(draft_id)["id"])
    out = {}
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            out[path.stem] = json.loads(path.read_text())
        except ValueError:
            continue
    return out


__all__ = [
    "STATUSES",
    "NoSuchDraft",
    "confirm",
    "draft",
    "drafts",
    "kit",
    "kit_dir",
    "lead_key",
    "reject",
    "store_path",
    "to_notice",
    "update",
    "upsert",
]
