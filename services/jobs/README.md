# The jobs

One-off work, each in an image of its own built FROM
[`services/Dockerfile.base`](../Dockerfile.base), so the planner only
serves what they make (issue #535, the owner's split of 2026-11-08). None
is a service: behind compose's `jobs` profile, a plain `docker compose up`
starts none of them.

| Job | What it does | Its code |
|---|---|---|
| [`retrain/`](retrain) | The training run: `python -m wingtip.pipeline run` retrains, evaluates and promotes the chart model (and the landmark model where the ratings are enough), each promoted only if it beats the one serving | `wingtip.pipeline`, `wingtip.chartmodel`, `wingtip.model_registry` (shared with the planner, which loads the promoted model) |
| [`charts/`](charts) | A new FAA chart cycle fetched, rendered and packed into one PMTiles archive per kind and density; the map's overlay tiles (tippecanoe) from the planner's cycle pack; publishing to S3 | `charts/cli.py` (the commands), `charts/overlays.py` (the vector tiles); `wingtip.charts` and `wingtip.tile_archive` (shared with the planner, which serves the tiles) |

Chart vision (`wingtip.chartvision`) stays in the planner: it reads the
chart along a pilot's route as the route is planned, which is serving
rather than one-off work, and `app/detection.py` hashes its bytes and
`chartvision.py`'s into every kept read, so neither moves. It becomes a
job of its own only if it ever needs a GPU.

## Running them on a machine of one's own

Each runs this checkout's code, the project mounted at `/workspace`.

```bash
docker compose build retrain charts charts-overlays   # once; `run` reuses the image

# The training run, as the developer console's Retrain starts it.
docker compose run --rm retrain                    # every stage, in order
docker compose run --rm retrain collect            # one stage

# The charts job.
docker compose run --rm charts                     # overlays where due, then the chart cycle where due
docker compose run --rm charts overlays            # the overlay tiles alone
docker compose run --rm charts refresh --workers 2 # the chart cycle alone
docker compose run --rm charts pack                # loose tiles of finished kinds into archives
docker compose run --rm charts pyramid --kind sec  # prepare, pyramid, check, unmask, publish: as before
```

`docker compose run` builds an image only when it has none, so leave out
`--build`: the code is the mounted checkout, read afresh each run, and a
rebuild is needed only after the Dockerfile or the requirements change (or
wingtip's Rust extension, which the base image holds). Each compose project
(a worktree of another name) builds its own images once.

The planner starts them by itself through the dev-services sidecar,
which can start a container but never create one, so make them once:

```bash
docker compose create retrain charts charts-overlays charts-next
```

Then the developer console's Retrain starts `retrain`, its chart
"refresh now" starts `charts`, and the planner's hourly check
(`app/chart_refresh.py`) starts `charts` when a new chart cycle is due
and the night's window (`CHARTS_REFRESH_WINDOW`, 01:00-06:00) is open,
and `charts-overlays` whenever its cycle pack has no overlay tiles.
`CHARTS_AUTO_REFRESH=0` turns that off. The same check starts
`charts-next` (`python -m charts next`: `charts/next_cycle.py`, by
`wingtip.chart_next`'s dates; the check is `app.chart_cycle`) from
`CHARTS_CYCLE_LEAD_DAYS` (7) days before the FAA's next 56-day cycle: it
fetches, renders and packs that cycle into its own folder while the
current one serves, and the map goes over to it at 0901Z on its
effective date (`charts.in_force`); the next run after deletes the old
cycle. It waits for a turn among the Mac's heavy work, through
`scripts/dev/one-at-a-time.sh`'s lock in `/tmp` (`charts/turn.py`).
`CHARTS_CYCLE_AUTO=0` turns that off (production and CI have it off: the
AWS task draws each cycle). Its state is the console's Charts page and
`/api/status`'s `charts.next`. `CHARTS_REFRESH_WORKERS` (in
`.env`, 1 by default) is how many render processes a cycle gets.

### The chart tiles as archives

A finished kind's tiles are kept as `data/raw/chart_tiles.nosync/<cycle>/<kind>.pmtiles`
and `<kind>@2x.pmtiles` (`wingtip.tile_archive`), not about 1.4 million
loose PNGs. A pass still draws loose files -- a tile is composited from
one sheet after another, and a pass cut short resumes from what is on
disk -- and `refresh` packs each kind once its pass is complete, removing
the loose files. The planner serves a tile out of the archive at the same
URL as before (`/api/chart-tile/{kind}/{z}/{x}/{y}.png`, `@2x` its own
archive); a tile not in a finished archive is no tile, as a `.none`
marker said. Tiles drawn on request for a kind with no archive yet stay
loose files with their `.none` markers, as before.

A cycle drawn before the archives is converted once with
`docker compose run --rm charts pack` (every cycle on disk; `--cycle
MM-DD-YYYY` for one). It needs free space for the largest archive beside
its loose tiles, and takes the refresh lock, so it waits for a render.

## On AWS

- **charts**: the chart cycle is a Fargate Spot task that EventBridge
  starts daily at 08:30 UTC (`infra/cloudformation/template.yaml`,
  `ChartRefreshTaskDefinition`), the `wingtip/charts` image running
  `refresh --workers 2`: a no-op until the FAA publishes a cycle, then it
  draws it, packs it and publishes the archives and `serving.json` to the
  tiles bucket. The planner reads tiles from those archives through
  CloudFront by range requests, and CloudFront caches what it answers.
  The overlay tiles are built on the server, beside the cycle pack the
  planner writes there: cron runs `docker compose -f
  infra/docker-compose.prod.yml run --rm charts-overlays` hourly
  (`infra/server/deploy.sh` writes the entry).
- **retrain**: not on AWS. It trains on the owner's ratings
  (`data/labels`, never committed) on the owner's machine, and the
  promoted model reaches the server through the bucket deploy.sh syncs
  from (`models/`).

## Checks

From this directory, over wingtip's requirements
(`requirements-dev-jobs.txt`):

```bash
ruff check charts && pytest charts/tests/
```

or `scripts/dev/check.sh jobs` on the Mac mini. CI runs them in its
`test` job, and builds both images in `build-images`.
