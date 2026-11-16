# ingest

The live feeds, read always, into the stores the planner reads. The first
of the service splits in issue #535: until 2026-11-08 these ran inside the
planner's process (`app/swim.py`, `app/swim_reader.py` and the traffic
package's following thread), so a restart of the planner dropped every
feed, and the radar's parsing took time from the planning a pilot waits on.

ingest fetches and stores only. No aviation rule lives here: a NOTAM is
read by the engine (`wingtip.notams` calls `notams_fns`), a track is kept
as the radar sent it, and every figure a pilot sees is still the engine's,
asked by the planner.

## What it reads

| Feed | Source | Written to |
|---|---|---|
| STDDS (TAIS terminal radar) | FAA SWIM, the owner's SCDS subscription | the live store: each airplane's latest report, kept round the places the map looks and for the followed airplanes, and the followed ones' tracks; and `wingtip.live_reports`' store: each runway's RVR, the D-ATIS broadcasts and the towers' departure events |
| FNS (NOTAMs) | FAA SWIM | `wingtip.notams`' store |
| TFMS (flight plans, flow) | FAA SWIM | `wingtip.filed_routes`' store (the routes pilots file between two fields), and `wingtip.live_reports`' store: the Command Center's ground stops, ground delay programs and restrictions |
| ITWS (terminal weather alerts) | FAA SWIM | `wingtip.live_reports`' store (`wingtip.itws`): each airport's microburst, wind shear, gust front, tornado and storm alerts while they last; the maps unread |
| SFDPS (airspace) | FAA SWIM | `wingtip.live_reports`' store (`wingtip.saa`): each special activity airspace's status, active or cold |
| The NTSB's aviation database | data.ntsb.gov/avdata: avall.mdb once a month, the weekly deltas over it (`ingest.ntsb`) | `wingtip.history.ntsb`'s store (`ntsb.sqlite`): each case, its kind, highest injury, place and narratives, each airplane's registration, phase and damage, for the Studio and an airplane's card; made again from avall.zip when its shape (`SCHEMA`) changes |
| The followed airplanes | adsb.fi's open data, every 30 s (`ADSBFI_OPEN_DATA`, off in production until adsb.fi agrees) | the live store: their tracks |

The map's own traffic -- adsb.lol by region, ADS-B Exchange where it
refuses, an open card's airplane -- is asked by the planner as a pilot
asks, and stays there.

## How the planner and ingest share it

No message bus and no HTTP between them: SQLite files both containers
open, each in WAL mode so the planner's reads never wait on ingest's
writes (`wingtip.stores`). On the server they are on the data folder both
mount (`/srv/wingtip/data`); in the development stack on the `live-store`
Docker volume (`/live`: `LIVE_STORE`, `NOTAM_STORE`, `FILED_STORE`), since
SQLite's locks and write-ahead log do not work across macOS's file sharing
into Docker (ingest's writes hung on 2026-11-08). A store first opened at
its new path takes the file it had on the data folder. The live store
(`wingtip.traffic.store`) carries both directions:

- ingest writes `radar` (the latest report of each airplane), `points`
  (the followed airplanes' tracks) and `beats` (its own and each feed's
  state);
- the planner writes `looked` (where the map asked for traffic in the
  last minute) and `followed` (each card opened), which ingest reads each
  second to know what of the country's radar to keep, and records an open
  card's airplane in `points` too.

## Running it

`docker compose up -d ingest` (the development stack mounts this checkout,
as the planner's does); in production it is the `ingest` service of
`infra/docker-compose.prod.yml`, its image `wingtip/ingest` in ECR. It
publishes no port. Its health is its beat: `python -m ingest.health` exits
0 while the beat in the live store is under a minute old. A feed that
cannot connect does not fail it; its state in `beats` says why, with the
count of each kind of message its queue carries (`kinds`), and it keeps
trying, a pause doubling from 10 s to 5 minutes.

Settings (`ingest/settings.py`, pydantic-settings): `SWIM_HOST`,
`SWIM_USERNAME`, `SWIM_PASSWORD` and, per feed, `SWIM_VPN_<FEED>`,
`SWIM_QUEUE_<FEED>` and, where SCDS put it on another broker,
`SWIM_HOST_<FEED>`. A feed is read only where all of its are set.
`BEAT_EVERY_S` (10) and `HEALTHY_WITHIN_S` (60) set the beat. wingtip's
own settings (`LIVE_STORE`, `NOTAM_STORE`, `FILED_STORE`,
`ADSBFI_OPEN_DATA`) come from `wingtip.config`, as in the planner.

## Layout and checks

```
ingest/main.py      the entry point: the feeds, the following, the beat
ingest/swim.py      the SWIM feeds: the Solace connection per feed, the radar's tracks kept, the handlers
ingest/radar_tracks.py  STDDS's tracks read, their course and speed the engine's
ingest/health.py    the health check
ingest/settings.py  its environment
tests/              its suite
```

wingtip is the planner's library (`services/planner/wingtip`); the image
copies it where the planner keeps it and puts both on `PYTHONPATH`, and the
suite does the same (`pyproject.toml`). Checks: `scripts/dev/check.sh
ingest`, or `ruff check ingest tests && pytest tests/` here after `pip
install -r requirements-dev.txt` and the engine's wheel.

## The next SWIM feeds (#489)

Each needs an SCDS subscription the owner has not taken out yet (or, for
NOTAMs shown to pilots, the FAA NOTAM API key of #287); `kinds` in each
feed's beat shows what the present queues carry before a reader is
written for anything new on them.
