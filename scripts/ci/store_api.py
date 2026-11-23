"""What the two store scripts share: a signed JWT and a JSON request.

App Store Connect's API takes a JWT signed ES256 with the team's API key
(developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests);
Google's OAuth token endpoint takes one signed RS256 with a service
account's key (developers.google.com/identity/protocols/oauth2/service-account).
Both are signed by `openssl dgst -sha256 -sign`, which the runners have,
so the scripts need only the standard library. openssl writes an ECDSA
signature as DER; a JWT wants r and s as 32 bytes each (RFC 7518, 3.4).

Used by scripts/ci/testflight_beta.py and scripts/ci/play_internal.py.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _raw_ecdsa(der: bytes) -> bytes:
    """A DER ECDSA-Sig-Value (SEQUENCE of two INTEGERs) as r || s, 32 bytes each."""
    at = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    out = b""
    for _ in range(2):
        if der[at] != 0x02:
            raise ValueError("not a DER ECDSA signature")
        size = der[at + 1]
        out += der[at + 2 : at + 2 + size].lstrip(b"\0").rjust(32, b"\0")
        at += 2 + size
    return out


def jwt(header: dict, claims: dict, private_key_pem: str) -> str:
    """The token, signed with the PEM key: ES256 or RS256, as `header` names."""
    signing = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(claims).encode())}"
    with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as key:
        key.write(private_key_pem)
    try:
        sig = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", key.name], input=signing.encode(), capture_output=True, check=True
        ).stdout
    finally:
        os.unlink(key.name)
    if header["alg"] == "ES256":
        sig = _raw_ecdsa(sig)
    return f"{signing}.{b64url(sig)}"


class ApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:800]}")
        self.status = status


def request(
    method: str, url: str, token: str, body: object = None, *, raw: bytes | None = None, content_type: str = "application/json"
) -> dict:
    """One call, its JSON answer ({} for none); an ApiError with the body on a failure."""
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=600) as answer:
            text = answer.read().decode() or "{}"
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode(errors="replace")) from None
    return json.loads(text)


def now() -> int:
    return int(time.time())


def notes(path: str, limit: int) -> str:
    """A notes file's text, trimmed, refused over the store's limit rather than cut."""
    with open(path, encoding="utf-8") as f:
        text = f.read().strip()
    if len(text) > limit:
        raise SystemExit(f"{path} is {len(text)} characters; the store takes {limit}")
    return text
