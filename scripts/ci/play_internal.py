#!/usr/bin/env python3
"""The signed release bundle goes to Google Play's internal testing track.

Run by scripts/ci/android_build.sh on main's push, once the repository has
the PLAY_SERVICE_ACCOUNT secret (a Google Cloud service account's JSON key,
invited in Play Console with the release permissions for this app;
docs/store/beta.md). Through the Google Play Developer API's edits
(developers.google.com/android-publisher/edits):

1. an edit is opened for the package (PLAY_PACKAGE);
2. the bundle is uploaded, and R8's mapping with it, so Play's crash
   reports read in the code's own names;
3. the internal track's release is set to that version code, with the
   notes in docs/store/beta/release-notes.txt (500 characters at most,
   Play's limit), its status PLAY_RELEASE_STATUS ("completed": out to the
   internal testers at once; "draft" while the app itself is still a
   draft in Play Console, which takes no other);
4. the edit is committed.

Play takes no upload until the app exists in Play Console and its first
bundle was uploaded by hand (docs/NATIVE-ANDROID.md, "Releasing to Google
Play"), so a 404 for the package is a notice, not a failure.

  python3 scripts/ci/play_internal.py app-release.aab [mapping.txt]
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store_api import ApiError, jwt, notes, now, request  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RELEASE_NOTES = ROOT / "docs/store/beta/release-notes.txt"
# Play's limit on a release's notes in one language.
NOTES_LIMIT = 500
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
OAUTH = "https://oauth2.googleapis.com/token"


def access_token(account: dict) -> str:
    """The service account's token for the publisher API (an hour)."""
    claims = {"iss": account["client_email"], "scope": SCOPE, "aud": OAUTH, "iat": now(), "exp": now() + 3600}
    assertion = jwt({"alg": "RS256", "typ": "JWT"}, claims, account["private_key"])
    form = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}).encode()
    with urllib.request.urlopen(urllib.request.Request(OAUTH, data=form), timeout=60) as answer:
        return json.loads(answer.read())["access_token"]


def main() -> None:
    bundle = Path(sys.argv[1])
    mapping = Path(sys.argv[2]) if len(sys.argv) > 2 and Path(sys.argv[2]).is_file() else None
    package = os.environ["PLAY_PACKAGE"]
    status = os.environ.get("PLAY_RELEASE_STATUS", "completed")
    text = notes(str(RELEASE_NOTES), NOTES_LIMIT)
    token = access_token(json.loads(os.environ["PLAY_SERVICE_ACCOUNT"]))
    try:
        edit = request("POST", f"{API}/{package}/edits", token, {})["id"]
    except ApiError as e:
        if e.status != 404:
            raise
        print(f"::notice title=Play internal testing::no app {package} in Play Console yet; upload the first bundle by hand")
        return
    at = f"{package}/edits/{edit}"
    version = request(
        "POST", f"{UPLOAD}/{at}/bundles?uploadType=media", token, raw=bundle.read_bytes(), content_type="application/octet-stream"
    )["versionCode"]
    if mapping:
        request(
            "POST",
            f"{UPLOAD}/{at}/apks/{version}/deobfuscationFiles/proguard?uploadType=media",
            token,
            raw=mapping.read_bytes(),
            content_type="application/octet-stream",
        )
    release = {"versionCodes": [str(version)], "status": status, "releaseNotes": [{"language": "en-US", "text": text}]}
    request("PUT", f"{API}/{at}/tracks/internal", token, {"track": "internal", "releases": [release]})
    request("POST", f"{API}/{at}:commit", token)
    print(f"version code {version} is on Play's internal testing track ({status})")


if __name__ == "__main__":
    main()
