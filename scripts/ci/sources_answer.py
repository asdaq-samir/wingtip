"""The live sources the planner and the weather service read, asked once a
night whether they still answer (ci.yml, `sources`; docs/CI.md, "Rules").

A pull request's tests are to read recorded copies, never these (decision
0034, "No live internet in PR tests"), so a source that moves, changes its
answer or goes away has to be found here, at night, rather than as a
flaky test. Each is asked with a GET of its smallest product (or its
index), twenty seconds at most, and answers when it gives 2xx with a
body. A source that does not answer is a ::error and fails the job, which
the nightly issue (scripts/ci/nightly_issue.py) then carries.

The URLs are the code's own (the file named beside each); change both
together.

  python3 scripts/ci/sources_answer.py
"""

from __future__ import annotations

import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SOURCES = [
    # services/weather/app/aviationweather.py: METARs, TAFs, SIGMETs, PIREPs
    ("AWC METAR cache", "https://aviationweather.gov/data/cache/metars.cache.xml.gz"),
    ("AWC TAF cache", "https://aviationweather.gov/data/cache/tafs.cache.xml.gz"),
    # services/weather/app/gfs.py: winds and temperatures aloft from the GFS
    ("NOMADS GFS filter", "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"),
    # services/weather/app/spc.py: the convective outlook
    ("SPC day 1 outlook", "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson"),
    # services/weather/app/radar.py: the radar mosaic's metadata
    ("IEM radar mosaic", "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json"),
    # services/weather/app/satellite.py: the satellite layers
    ("nowCOAST satellite", "https://nowcoast.noaa.gov/geoserver/satellite/wms?service=WMS&version=1.3.0&request=GetCapabilities"),
    # services/weather/app/tfr.py: the TFRs' shapes
    (
        "FAA TFR shapes",
        "https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature"
        "&typeName=TFR:V_TFR_LOC&outputFormat=application/json",
    ),
    # services/planner/wingtip/faa_data.py: the NASR subscription's index
    ("FAA NASR index", "https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/"),
    # services/planner/wingtip/elevation.py: USGS point elevations
    ("USGS EPQS", "https://epqs.nationalmap.gov/v1/json?x=-89.4&y=43.1&units=Feet&wkid=4326"),
    # services/planner/wingtip/traffic/adsb_lol.py: traffic near a point
    ("adsb.lol", "https://api.adsb.lol/v2/point/43.14/-89.34/25"),
]
# Some of these answer a script's default user agent with 403.
HEADERS = {"User-Agent": "Mozilla/5.0 (Wingtip Maps nightly source check)", "Accept": "*/*"}


def ask(source: tuple[str, str]) -> tuple[str, str | None]:
    name, url = source
    try:
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(65536)
            if not body:
                return name, f"{url} answered {response.status} with nothing"
            return name, None
    except Exception as err:  # noqa: BLE001 -- any failure is the finding
        return name, f"{url}: {err}"


def main() -> int:
    with ThreadPoolExecutor(len(SOURCES)) as pool:
        results = list(pool.map(ask, SOURCES))
    failed = [(name, why) for name, why in results if why]
    for name, why in results:
        print(f"{'answers' if not why else 'DOES NOT ANSWER'}: {name}")
    for name, why in failed:
        print(f"::error title=Source {name} does not answer::{why}" if "GITHUB_ACTIONS" in os.environ else f"{name}: {why}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
