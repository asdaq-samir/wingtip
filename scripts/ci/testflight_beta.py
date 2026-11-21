#!/usr/bin/env python3
"""The build just uploaded to TestFlight goes to the pilots' beta group.

Run by scripts/ci/ios_testflight.sh after the upload, on main only.
Through App Store Connect's API, as the App Store Connect key the upload
used (KEY_ID, KEY_P8, ISSUER):

1. waits for Apple to process the build (`CFBundleVersion` RUN_NUMBER of
   the app WINGTIP_BUNDLE_ID), at most WAIT_MINUTES (20: the job has 45
   minutes, and the archive and upload take the rest);
2. sets its "What to Test" from docs/store/beta/what-to-test.txt (4,000
   characters at most, App Store Connect's limit);
3. adds it to the beta group named BETA_GROUP ("Pilots", which the owner
   makes in App Store Connect, docs/store/beta.md);
4. where that group is external, submits the build for Beta App Review,
   which an external group's first build of a version needs.

Nothing here fails the run once the build is uploaded: a group not made
yet, a build still processing at the deadline or a review already asked
for is a notice, and the owner adds the build by hand (docs/store/beta.md).
The standard library only, with openssl to sign (scripts/ci/store_api.py).
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store_api import ApiError, jwt, notes, now, request  # noqa: E402

API = "https://api.appstoreconnect.apple.com/v1"
ROOT = Path(__file__).resolve().parents[2]
WHAT_TO_TEST = ROOT / "docs/store/beta/what-to-test.txt"
# App Store Connect's limit on a build's What to Test (betaBuildLocalizations.whatsNew).
WHATS_NEW_LIMIT = 4000


def token() -> str:
    # A token lives 20 minutes at most (Apple's limit); a fresh one is made for each call.
    header = {"alg": "ES256", "kid": os.environ["KEY_ID"], "typ": "JWT"}
    claims = {"iss": os.environ["ISSUER"], "iat": now(), "exp": now() + 1080, "aud": "appstoreconnect-v1"}
    return jwt(header, claims, os.environ["KEY_P8"])


def get(path: str) -> dict:
    return request("GET", f"{API}{path}", token())


def notice(text: str) -> None:
    print(f"::notice title=TestFlight beta::{text}")


def processed_build(app_id: str, version: str, minutes: int) -> str | None:
    deadline = time.monotonic() + minutes * 60
    while True:
        found = get(f"/builds?filter[app]={app_id}&filter[version]={version}&fields[builds]=processingState")["data"]
        state = found[0]["attributes"]["processingState"] if found else "NOT YET LISTED"
        if state == "VALID":
            return found[0]["id"]
        if state in ("FAILED", "INVALID"):
            raise SystemExit(f"build {version} is {state} in App Store Connect")
        if time.monotonic() > deadline:
            return None
        print(f"build {version}: {state}; asking again in 30 s")
        time.sleep(30)


def what_to_test(build_id: str, text: str) -> None:
    kept = get(f"/builds/{build_id}/betaBuildLocalizations")["data"]
    english = next((k for k in kept if k["attributes"].get("locale") == "en-US"), None)
    if english:
        body = {"data": {"type": "betaBuildLocalizations", "id": english["id"], "attributes": {"whatsNew": text}}}
        request("PATCH", f"{API}/betaBuildLocalizations/{english['id']}", token(), body)
    else:
        body = {
            "data": {
                "type": "betaBuildLocalizations",
                "attributes": {"locale": "en-US", "whatsNew": text},
                "relationships": {"build": {"data": {"type": "builds", "id": build_id}}},
            }
        }
        request("POST", f"{API}/betaBuildLocalizations", token(), body)


def main() -> None:
    bundle, version = os.environ["WINGTIP_BUNDLE_ID"], os.environ["RUN_NUMBER"]
    group_name = os.environ.get("BETA_GROUP", "Pilots")
    text = notes(str(WHAT_TO_TEST), WHATS_NEW_LIMIT)
    apps = get(f"/apps?filter[bundleId]={quote(bundle)}")["data"]
    if not apps:
        notice(f"no app {bundle} in App Store Connect yet; nothing to send to testers")
        return
    app_id = apps[0]["id"]
    build_id = processed_build(app_id, version, int(os.environ.get("WAIT_MINUTES", "20")))
    if build_id is None:
        notice(f"build {version} still processing; add it to {group_name} by hand (docs/store/beta.md)")
        return
    what_to_test(build_id, text)
    groups = get(f"/betaGroups?filter[app]={app_id}&filter[name]={quote(group_name)}")["data"]
    if not groups:
        notice(f"no beta group named {group_name}; make it in App Store Connect (docs/store/beta.md)")
        return
    group = groups[0]
    request("POST", f"{API}/betaGroups/{group['id']}/relationships/builds", token(), {"data": [{"type": "builds", "id": build_id}]})
    print(f"build {version} is in {group_name}, with its What to Test")
    if group["attributes"].get("isInternalGroup"):
        return
    review = {"data": {"type": "betaAppReviewSubmissions", "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}}
    try:
        request("POST", f"{API}/betaAppReviewSubmissions", token(), review)
        print(f"build {version} is submitted for Beta App Review")
    except ApiError as e:
        # 409 or 422: already submitted, or a later build of an approved
        # version, which needs none.
        if e.status not in (409, 422):
            raise
        notice(f"Beta App Review not asked for build {version}: {e}")


if __name__ == "__main__":
    main()
