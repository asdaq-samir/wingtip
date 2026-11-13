# services/planner/

The planner: it works out a flight, over HTTP. Fetches the FAA's data
and the weather, reads FAA sectional tiles, scores the checkpoints with
the chart model in its own process, puts the nav log together, and asks the Rust engine every aviation rule by name
(`wingtip_native.call`; [`engine/README.md`](../../engine/README.md)). It
is one of four layers: under it the engine, beside it Spring Boot
(accounts and saved records, which asks this service when it needs a
figure), above it the apps. Rules still written in Python here or in
`services/planner/wingtip` move into the engine, in the order issue #482 sets; a new
one goes into the engine.

It serves no pages. The front end is in [`apps/web/`](../../apps/web) and ships inside
`gateway`'s jar; the browser reaches this service only through `gateway`'s
`/api/planner/*` proxy. On AWS it has no load-balancer route at all.

The Python behind it lives in [`services/planner/wingtip`](wingtip). This is a thin
HTTP layer over it: `app/main.py` builds the app, `app/routers/` holds
the endpoints one module per concern (plan, chart, classb, briefing,
gonogo, notes, devml, devservices, system ...), and the work they share --
resolving a route (`router_basics.py`), what a plan is asked
(`plan_query.py`), a route's briefing (`route_briefing.py`), the Go / No-Go's
plan and findings (`gonogo/flight.py`), the dev-services sidecar
(`dev_services.py`), scoring the checkpoints (`checkpoint_scoring.py`), the
corridor read (`detection.py`) -- sits beside them. A router only parses,
calls and returns, and never imports another: `lint-imports` holds that
(`.importlinter`: no router imports another, only `app/main.py` imports
the routers, and `wingtip` never imports `app`), in check.sh's py and
planner areas and in CI. The legs themselves are
`wingtip.navlog`'s. The planner calls no model; the pilot's own AI app reaches it through
the MCP connector (`app/mcp`).
Every response, streamed lines included, is a model in `app/schemas/` (one module per router,
`common.py` for those shared):
FastAPI validates against it and publishes it in `openapi.json`,
committed here and checked by `services/planner/tests/test_openapi.py`. After changing a
model, run `python -m app.openapi` and commit the result; `apps/web/`
generates its TypeScript types from that file. The three NDJSON streams
always end with a `done` or an `error` line: a failure after the first
line is out cannot change the status any more, so it is reported as the
last line rather than as a truncated body.

## Contents

- [Running it](#running-it)
- [Learning this from zero](#learning-this-from-zero)
- [The endpoints](#the-endpoints)
- [Things that are not obvious](#things-that-are-not-obvious)

## Running it

```bash
docker compose up -d planner
# http://localhost:8084/docs   <- FastAPI's generated API page
```

Port 8084 is for debugging only; nothing in the front end uses it. The
real path is `http://localhost:8080/api/planner/*` through `gateway`.

## Learning this from zero

FastAPI's minimum is genuinely two files, and one of them is a
dependency list:

```python
# app/main.py
from fastapi import FastAPI

app = FastAPI()


@app.get("/api/course")
def course(dep: str, dest: str) -> dict:
    return {"departure": dep, "destination": dest, "distance_nm": 0.0}
```

```bash
pip install fastapi "uvicorn[standard]"
uvicorn app.main:app --reload
```

You now have a JSON API *and* an interactive documentation page at
`/docs`, generated from the type hints. That generation is the reason to
choose FastAPI over Flask here: `dep: str` is simultaneously validation,
documentation and an editor hint.

### The rungs

1. **Return a constant** (above). Learn that the annotations are load
   bearing: change `dep: str` to `dep: int` and send a word, and you get
   a 422 with a useful message you did not write.

2. **Call your own library.** `from wingtip import geo` and return a real
   distance. Nothing about the web layer changes — which is the point of
   keeping the domain code in `wingtip/`.

3. **Make a slow endpoint fast enough to use.** Reading a corridor's
   tiles takes seconds. First make it work, then notice the page sits
   blank while it does. Splitting `/api/course` (sub-second) from
   `/api/checkpoints` from `/api/navlog` is the fix, and it is a design
   decision, not an optimisation.

4. **Stream the slow one.** `/api/detect/stream` returns
   newline-delimited JSON from a `StreamingResponse`, so detections
   appear block by block from the departure end. The client side is an
   async generator in `apps/web/src/lib/api/client.ts`.

5. **Handle work too slow for a request.** Collecting an uncollected
   corridor is minutes of Overpass and FAA calls. A request held open
   that long dies in any proxy, so `/api/build` starts a background
   thread and returns a job id to poll.

6. **Cache what you re-read.** A first version re-parsed the national
   airports CSV on every request — 2.1 s, which was the entire
   time-to-first-marker. Module-level caches took a plan from 51 s to
   13.7 s. Measure before and after; the number is the lesson.

### The method

Write the endpoint against a constant, then swap the constant for a real
call. If the real call is slow, the fix is usually *splitting the
endpoint*, not speeding up the function — a pilot would rather see the
course line immediately and the nav log in ten seconds than everything at
once in ten.

## The endpoints

Every endpoint, with its parameters and answers, is in
[the API reference](../../docs/api/README.md), written from the code
(`openapi.json`, here); a route's docstring is where its behaviour is
said. The one with a story of its own is the chart tile endpoint.

The tile endpoint renders a tile on first request and caches it on
disk where a kind has no archive yet, which is fine for one corridor and
not for a map with no street layer under it. The whole country ahead of
time is the charts job's (services/jobs/charts; the sectional is the
map's only base layer, so this is the normal state of a running stack):

```sh
docker compose run --rm charts prepare   # every sheet: sectionals (the lower 48, Alaska, Hawaii, the Caribbean), TACs, IFR low and high; ~7 GB
docker compose run --rm charts pyramid   # every tile of every kind; about two hours with --workers 3
docker compose run --rm charts pack      # each finished kind's loose tiles into its archives
```

A container of its own, not the planner's: a render inside the serving
planner's container has had it killed for memory twice. The pyramid picks
its number of workers from the memory the container has left (two for
the high-density tiles in a 12 GB Docker VM) and logs the pick;
`--workers` sets it.

All resume where they stopped. The sheets land in
`data/raw/charts.nosync/<cycle>/`, the tiles in
`data/raw/chart_tiles.nosync/<cycle>/` (the suffix keeps iCloud Drive
from syncing them; elsewhere it is just a name): loose files while a
pass draws them, then `<kind>.pmtiles` and `<kind>@2x.pmtiles` once the
kind is finished and packed. A tile a render has drawn only part of -- a
seam its second sheet has yet to reach -- waits beside the served tile as
`<y>.partial`, never served, until it is finished or the pass ends. The
Dev console's System tab shows the sheets prepared and the pyramid's
progress.

A change to how a tile is drawn goes with a bump of
`wingtip.charts.RENDERER_VERSION`. The next refresh then counts the cycle
as due, draws every tile again (serving the old ones meanwhile), and
bumps the tile revision at the end, as `unmask` does below.

The planner keeps up with the 56-day cycle by itself: at start-up and
once an hour it asks the FAA's APRA (wingtip.apra) which cycle is current
and, if that cycle's pyramid is not complete on disk, starts the charts
job's `charts` container through the dev-services sidecar (prepare,
render, pack, then delete the previous cycle; `docker compose create
retrain charts charts-overlays charts-next` once makes the containers it starts).
Where `CHARTS_CYCLE_AUTO` is on (the default), it also starts
`charts-next` hourly inside the window from `CHARTS_CYCLE_LEAD_DAYS` (7)
before the next cycle, so that cycle is drawn ahead and swapped in at
0901Z on its date (services/jobs/README.md). It
starts `charts-overlays` the same way, at any hour, when its cycle pack
has no overlay tiles. The map switches to the new cycle only once every
tile of it is there, so a refresh in progress changes nothing on
screen. The render is hours of every core it is given, so it starts
only inside `CHARTS_REFRESH_WINDOW` (`HH:MM-HH:MM` on the container's
clock, `01:00-06:00` by default, blank for any time; set `TZ` for a
local clock), niced, with `CHARTS_REFRESH_WORKERS` processes (one by
default, the job's command in docker-compose.yml) -- unless nothing
complete is on disk at all, when it starts at once. `refresh now` in the
Dev console starts the job at once, and `CHARTS_AUTO_REFRESH=0` turns the
check off. (The FAA aircraft
registry has its own switch: `REGISTRY_REFRESH=0` turns off its daily
download, which is on otherwise, whatever the charts do; and so do the
NASR and obstacle files: `FAA_DATA_AUTO_REFRESH=0` turns off the check
for their new editions, four times a day otherwise.) All of that
policy -- the window, the due check, the worker counts -- is
`app/chart_refresh.py`; the charts job and `wingtip.charts` do the work it
asks for. `docker compose run --rm charts check` looks for daylight between adjacent sheets, which is
what a mis-detected sheet edge would show up as; the one it always
reports, between the Caribbean 1 chart and Jacksonville west of 83W,
is the open Gulf, where the FAA charts no sectional.

Preparing a sectional also takes its masked lines out: the paper band
the FAA prints round every TAC's coverage and round its own insets,
which on this map -- where the TAC is a layer of its own -- read as a
white box round every Class B whether the TAC was drawn or not. Only
the band's paper changes, to the tint either side of it; everything
printed over it, the "TAC" lettering included, stays
(`wingtip.chart_faces.remove_masked_lines` says how a band is told from a label
box or a dry lake). Sheets prepared before that step existed are
cleaned, and their tiles rendered again, by

```sh
docker compose run --rm -T charts unmask --workers 2   # half an hour; re-runnable
```

which also bumps the cycle's tile revision (`chart_revision` on the
course), since a browser's service worker holds tiles for weeks under a
URL a re-render would not otherwise change. `unmask --again` looks once
more at sheets already cleaned, along the borders of what was taken out
of them -- for after the search learns to find more. To put a sheet back as the
FAA printed it, delete its folder under `data/raw/charts.nosync/` and
`prepare` downloads it again.

## Things that are not obvious

**scikit-learn is pinned to the training image's.** The chart model is
scored in this process (`app/chart_scorer.py`), from the promoted
`data/models/chart/current`, and read again when a retrain's promotion
rewrites it — no restart. A joblib artifact is a pickle of sklearn's own
objects, so the version that loads it must match the version that wrote
it: `requirements.txt` pins scikit-learn and joblib exactly as
`services/jobs/retrain/requirements.txt` does, and `services/planner/tests_wingtip/test_requirements.py`
fails if they differ. Bump both together.

**Collection runs in-process, not as a container.** `/api/build` starts a
thread rather than launching a pipeline container, because handing this
service the Docker socket is a far larger grant than it needs.

**Build state is in memory on purpose.** A restart forgets a
half-finished job rather than resuming something whose partial output is
already on disk.

**It writes into the shared data volume.** A new corridor's candidates
and features land in `data/processed`, the same directory the pipeline
jobs read feature stores from. On AWS that becomes the S3 bucket the pipeline
jobs use — and **the Python does not read `VFR_DATA_S3_BUCKET` yet**, so
a Fargate task would start and then fail to find FAA data. That is the
one piece of the AWS path still unfinished.

**A cache hit and two concurrent misses are different problems, and
this service's caches (`app/planning.py`'s `SingleFlightTTLCache`, in
front of the cruise-altitude selection and the four altitude plans)
solve both.** The obvious version -- lock, check the dict, unlock,
compute on a miss, lock again to store it -- only ever protects the
dict. It leaves the computation itself unguarded, so two requests for
the same not-yet-cached route (the same plan open in two tabs, a
client's own retry racing the request it gave up on) both pay for the
whole terrain/airspace/weather stack, which the comment beside that
cache already measured at over two minutes on a bad
aviationweather.gov day. A miss now registers itself with a
`threading.Event`; a second caller for the *same* key waits on that
event instead of repeating the work, a different key still computes in
parallel (one lock per cache, not one lock held for the duration of a
computation), and a failed compute does not poison whoever was
waiting on it -- they get their own attempt instead of the leader's
exception.

**Nothing was watching how long any of this actually took, and the gap
was invisible until something went looking.** `wingtip.altitude.
select_cruise_altitude` times each of its seven concurrent calls
(terrain, both airspace queries, transits, magnetic variation, and the
three weather calls) plus its own total; this router's own
`/api/class-b` times the airspace read and the weather lookup
separately. Both were added, run against the built container, and
found to produce *no output at all* -- Python's root logger defaults
to `WARNING`, uvicorn's own `--log-level` only reaches its own
`uvicorn.access`/`uvicorn.error` loggers, and nothing in this process
had ever called `logging.basicConfig`. Every `log.info()` already
written elsewhere in this codebase (`wingtip.weather`, `wingtip.charts`, both
older than the timing lines) had been going nowhere since it was
written. `app/main.py` now calls `logging.basicConfig(level=os.environ
.get("LOG_LEVEL", "INFO"))` once, at import time, which is what makes
all of it -- old and new -- actually appear.

**A pilot's own aeroplane numbers must never overwrite the stock
profile.** `wingtip.aircraft.load_aircraft_profile` is `lru_cache`d (it
used to reopen and reparse the same JSON file on every plan and
altitude request), and `planning.py`'s `aircraft_profile()` writes a
pilot's `cruise_tas_kt`/`fuel_burn_gph`/`usable_fuel_gal` overrides
onto the dict it gets back, **in place**. Caching the parsed dict
itself would have hit both of those in the same call: the second
pilot to plan in "c172" with no override of their own would have
gotten the first pilot's aeroplane. The cache holds the parse; every
call gets a fresh shallow copy.
