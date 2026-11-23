#!/usr/bin/env python3
"""The iOS build, made once and tested on every leg (native-ios.yml).

The iPhone's leg builds the app and its tests (scripts/ci/ios_test.sh
build), packs Build/Products and uploads it as the run's `ios-products`
artifact; every other leg (the iPad's, a wave's four iPad legs, the night's
iPhone Duo) starts at once, boots its simulator while that build runs, then
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
GH_TOKEN, with actions: read). It waits WAIT_MINUTES at most, and stops at
once when the iPhone's leg has ended without the products (its build
failed or was cancelled): its own failure says why, so this leg says only
that there was nothing to test. The standard library and curl; seconds
beside the wait.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request

NAME = "ios-products"
WAIT_MINUTES = 30
POLL_SECONDS = 20


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
    """The iPhone's leg, which builds: "test" in its own run, "<caller> / test" in a call."""
    return next((j for j in jobs if j["name"] == "test" or j["name"].endswith("/ test")), None)


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
    started = time.time()
    while True:
        found = [a for a in api(f"{run}/artifacts?name={NAME}")["artifacts"] if not a["expired"]]
        if found:
            break
        built = builder(api(f"{run}/jobs?per_page=100")["jobs"])
        if built and built["status"] == "completed":
            # Its upload ends a step before the job does: one more look.
            time.sleep(POLL_SECONDS)
            found = [a for a in api(f"{run}/artifacts?name={NAME}")["artifacts"] if not a["expired"]]
            if found:
                break
            print(f"::error title=No iOS build::the iPhone's leg ended ({built['conclusion']}) without {NAME}; its log says why")
            return 1
        if time.time() - started > WAIT_MINUTES * 60:
            print(f"::error title=No iOS build::no {NAME} after {WAIT_MINUTES} minutes; the iPhone's leg is still building")
            return 1
        time.sleep(POLL_SECONDS)
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
