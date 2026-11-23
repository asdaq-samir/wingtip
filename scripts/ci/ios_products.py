#!/usr/bin/env python3
"""The iOS build, made once and tested on every leg (native-ios.yml).

The build leg builds the app and its tests (scripts/ci/ios_test.sh
build), packs Build/Products and uploads it as the run's `ios-products`
artifact; every device's leg (the iPhone's, the iPad's, a wave's four iPad
legs, the night's iPhone Duo) starts at once, boots its simulator while that build runs, then
takes the products and runs its tests from them (ios_test.sh test, from the
.xctestrun). Each leg had built the app itself, the engine and the project
too, some 13 minutes on a hosted runner before its first test (run
45127491141); now one runner builds and the others only wait for it.

  ios_products.py pack     the build's products, $RUNNER_TEMP/ios-products.tar
  ios_products.py fetch    the simulator booted, then the products, once the
                           iPhone's leg has uploaded them

A tar, not the folder: an artifact keeps no file modes, and the app's and
the test runners' binaries must stay executable. What only a link or a
debugger reads (dSYMs, the packages' objects and modules) is left out.

fetch reads the run through the API (GITHUB_REPOSITORY, GITHUB_RUN_ID and
GH_TOKEN, with actions: read). It asks for the artifact every POLL_SECONDS
and after the build leg's job only from JOBS_AFTER on, every third time, so
five runs' legs waiting at once stay far under the token's 1,000 requests
an hour; an API error (a 403, a 502) is waited out, longer each time, not
taken as the end (CI audit 2026-11-23, M4). It waits WAIT_MINUTES at most,
and stops at once when the build leg has ended without the products (its
build failed or was cancelled): its own failure says why. The artifact is
kept three days, so one leg run again later still finds it; past that,
run the build leg again too. The standard library and curl; seconds
beside the wait.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

NAME = "ios-products"
WAIT_MINUTES = 30
POLL_SECONDS = 30
JOBS_AFTER = 120
BACKOFF_MOST = 240


def api(path: str) -> dict:
    request = urllib.request.Request(
        f"https://api.github.com/{path}",
        headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def builder(jobs: list[dict]) -> dict | None:
    """The build leg: "build" in its own run, "<caller> / build" in a call."""
    return next((j for j in jobs if j["name"] == "build" or j["name"].endswith("/ build")), None)


def products(run: str) -> list[dict]:
    return [a for a in api(f"{run}/artifacts?name={NAME}")["artifacts"] if not a["expired"]]


def pack(temp: str) -> int:
    tar = f"{temp}/{NAME}.tar"
    skip = [f"--exclude={pattern}" for pattern in ("*.dSYM", "*.swiftmodule", "*.o")]
    subprocess.run(["tar", "-cf", tar, *skip, "-C", f"{temp}/derived/Build", "Products"], check=True)
    print(f"ios_products: {os.path.getsize(tar) // 2**20} MB of products packed")
    return 0


def fetch(temp: str) -> int:
    # Booted now, while the iPhone's leg builds; ios_test.sh test waits for it to be ready.
    subprocess.run(["xcrun", "simctl", "boot", os.environ["SIM"]], capture_output=True)
    run = f"repos/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    started, polls, pause = time.time(), 0, POLL_SECONDS
    while True:
        if time.time() - started > WAIT_MINUTES * 60:
            print(f"::error title=No iOS build::no {NAME} after {WAIT_MINUTES} minutes; the build leg is still building")
            return 1
        try:
            found = products(run)
            if found:
                break
            polls += 1
            built = builder(api(f"{run}/jobs?per_page=100")["jobs"]) if time.time() - started > JOBS_AFTER and polls % 3 == 0 else None
            if built and built["status"] == "completed":
                # Its upload ends a step before the job does: one more look.
                time.sleep(POLL_SECONDS)
                found = products(run)
                if found:
                    break
                late = built["conclusion"] == "success"
                again = " (a leg run again more than three days on: run the build leg again too)" if late else ""
                print(f"::error title=No iOS build::the build leg ended ({built['conclusion']}) without {NAME}{again}; its log says why")
                return 1
            pause = POLL_SECONDS
        except (urllib.error.URLError, TimeoutError, ValueError) as err:
            pause = min(pause * 2, BACKOFF_MOST)
            print(f"ios_products: the API did not answer ({err}); asking again in {pause} s", file=sys.stderr)
        time.sleep(pause)
    newest = max(found, key=lambda a: a["created_at"])
    print(f"ios_products: {NAME} after {int(time.time() - started)} s of waiting")
    # curl, which drops the token at the redirect to the storage's own signed URL.
    zipped = f"{temp}/{NAME}.zip"
    token = f"Authorization: Bearer {os.environ['GH_TOKEN']}"
    subprocess.run(["curl", "-sSfL", "-H", token, "-o", zipped, newest["archive_download_url"]], check=True)
    os.makedirs(f"{temp}/derived/Build", exist_ok=True)
    unpack = f'unzip -p "{zipped}" {NAME}.tar | tar -xf - -C "{temp}/derived/Build"'
    subprocess.run(["bash", "-o", "pipefail", "-c", unpack], check=True)
    print(f"ios_products: unpacked in {int(time.time() - started)} s from the start")
    return 0


def main() -> int:
    temp = os.environ["RUNNER_TEMP"]
    if sys.argv[1:] == ["pack"]:
        return pack(temp)
    if sys.argv[1:] == ["fetch"]:
        return fetch(temp)
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(main())
