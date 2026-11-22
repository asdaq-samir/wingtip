# The weather service

Fetches the weather the planner reads, on a schedule, into the **weather
store**: one file per product in `data/raw/weather` (`WEATHER_STORE`), on
the data folder the planner mounts too. The planner only reads it
(`wingtip.weather`, `wingtip.glmp`, `wingtip.tfr`, `wingtip.weather_map`,
`wingtip.weather_loop`),
so no pilot's request waits on aviationweather.gov, NOMADS, tfr.faa.gov,
IEM, nowCOAST or the SPC. Split out of the planner on 2026-11-08 (#535).

It fetches, parses into the stored form and stores. Every rule over the
weather -- the ceiling (14 CFR 1.1), the flight category (AIM 7-1-7,
FAA-H-8083-28B 3.4.2.14), when a forecast stops counting -- is the engine's, asked
through `wingtip_native`, the same answer the planner and the phones get.

## Products and schedule

Each is a job on wingtip's scheduler (`wingtip.schedule`, APScheduler),
fetched when the service starts, then at the first interval while a pilot
is planning (the planner read the store in the last 15 minutes) and at
the second otherwise (`app/settings.py`, `WEATHER_*_EVERY_S`): the job
comes at the planning pace and, with nobody planning, lets turns go by
until the idle pace has come round. One fetch of a product runs at a time,
`WEATHER_WORKERS` (3) at once.

| Product (store name) | Source | Planning | Idle | Served to |
|---|---|---|---|---|
| `metars`, `tafs`, `airsigmets`, `pireps`, `gairmets` | aviationweather.gov's national cache files, each only if changed (ETag); `airsigmets` is the combined `sigmets` file (the US convective and non-convective SIGMETs and the international ones) since the data API deprecated the airsigmets file (v4.34, 2026-10-08) | 4 min | 30 min | METARs: no limit, each report carries its time; TAFs: end of the latest period; SIGMETs/AIRMETs: latest valid-until; PIREPs: 90 min after the newest; G-AIRMETs: 90 min after the last snapshot |
| `recent-winds` | each station's last METAR with a direction and some speed, kept from the METARs as they come | with `metars` | | 3 hours per station |
| `winds-06`, `winds-12`, `winds-24` | the GFS 0.25 degree from NOMADS' grib filter, at the old FB stations | 45 min | 2 h | the end of the period's window (FAA Order JO 7110.10 TBL 9-3-1) |
| `glmp` | Gridded LAMP's hourly issue, ceiling and visibility grids (`.npy` beside the record) | 10 min | 1 h | while it is one of the last three issues |
| `glmp-forecast` | Gridded LAMP's forecast hours from the same issue, ceiling and visibility, the first 12 (`.npy` beside the record, float16), for the planner's forecast dry run | 10 min | 1 h | half an hour past its last hour |
| `spc-outlook` | the Storm Prediction Center's Day 1 categorical convective outlook (GeoJSON), only if changed (ETag), for the forecast dry run | 30 min | 1 h | the outlook's own expiry |
| `tfrs` | tfr.faa.gov's shapes and each NOTAM's XNOTAM detail | 10 min | 30 min | no limit; ended TFRs left out of a list older than 10 min |
| `radar` | IEM's record of when the NEXRAD mosaic was made | 2 min | 15 min | no limit |
| `satellite` | the times of nowCOAST's GOES East and West infrared and visible pictures (its WMS capabilities), the last three hours | 5 min | 30 min | no limit |
| `flow` | the map's flow layer (`app.flow`), fetched only with `WEATHER_FLOW_ON` (parked by the feature review, 2026-11-21: on in the local stack and CI, off on production): the GFS 0.25 degree from 5 to 75 N, 180 to 50 W, the HRRR's cell means over it where it covers, for the last hour, now and every even hour to 12 ahead; wind, gust, precipitation, cloud, 2 m temperature and visibility, a PNG each (`.png` beside the record, 55-130 KB). A frame already held from the same runs is not fetched again: about 2.2 MB a new GFS hour, 10.5 MB a new HRRR hour (`WEATHER_FLOW_HRRR_AHEAD_H`, 0 by default: the HRRR for the last hour and now) | 15 min | 3 h | an hour past its newest frame |

Each try writes `<name>.attempt.json` beside the record: when it began,
its failure if it failed (the pilot's Status page reads that as
"failing"), and when a try last confirmed the copy held. A failed fetch
leaves the stored copy in place. A copy that comes back unchanged is not
written again (`weather_store.write_if_changed`): the TFR list by a digest
of the list, aviationweather.gov's files by a digest of the body as sent
(their ETags and Last-Modified move every minute, so a 304 is rare, and
the engine does not read the same body twice), and `recent-winds` only
when a wind comes or goes. Its age, on the Status page, the map and the
health below, is from the last confirmation, so a quiet product is never
stale for being unchanged, and the planner does not decode it again. A
source's validators for its next conditional GET are kept in
`<name>.validators.json`. Every request carries wingtip's User-Agent (the FAA's
browser-like one for tfr.faa.gov); aviationweather.gov is asked for its
cache files, never a query per route, as its API terms ask heavy users.

Every NOMADS file (the GFS, the HRRR, GLMP, DAFS) is asked through
`app/nomads.py`: one GET, a run not posted yet told from NOMADS being
down, the GFS's newest run, and a GRIB2 file read a message at a time.

## Health

`GET :8000/` answers 200 while the process runs, with each product's
`fetched_at`, `age_s`, `until`, `servable`, `failing` and `stale`, and an
overall `"status": "ok" | "stale"`; `fetched_at` and `age_s` are from the
copy's last confirmation. A product is stale once that is older than
three of its idle intervals, or past its own validity.

## Running and checking

    docker compose up weather                 # the local stack
    scripts/dev/check.sh weather              # ruff and pytest, in Docker

The image is built FROM wingtip's base (`services/Dockerfile.base`) and
copies `services/planner/wingtip` beside `app`. Production runs it from
`infra/docker-compose.prod.yml` held to 768 MB (the model weather's
timeline, fetched afresh, takes it to about 565 MB on x86).
