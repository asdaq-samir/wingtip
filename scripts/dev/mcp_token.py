#!/usr/bin/env python3
"""A connector token from a local stack's own sign-in, the way Claude and
ChatGPT get one (docs/MCP-CONNECTOR.md): the MCP server's 401 and its
resource metadata, the gateway's authorization server metadata, a client
registered (RFC 7591), the pilot signed in by an emailed link read from
Mailpit, the consent approved, and the code exchanged with PKCE and the
resource (RFC 8707). Prints the access token.

  python3 scripts/dev/mcp_token.py [--base http://localhost:8080]
      [--mailpit http://localhost:8025] [--email pilot@example.com]

The standard library only, so it runs on the Mac as it is.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html.parser
import http.cookiejar
import json
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REDIRECT = "http://127.0.0.1:33418/callback"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Forms(html.parser.HTMLParser):
    """The consent page's first form's hidden fields."""

    def __init__(self) -> None:
        super().__init__()
        self.fields: list[tuple[str, str]] = []
        self.forms = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form":
            self.forms += 1
        elif tag == "input" and self.forms == 1 and a.get("type") == "hidden":
            self.fields.append((a.get("name", ""), a.get("value", "")))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost:8080")
    p.add_argument("--mailpit", default="http://localhost:8025")
    p.add_argument("--email", default="pilot@example.com")
    args = p.parse_args()
    jar = http.cookiejar.CookieJar()
    web = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)

    def send(method, url, *, body=None, headers=None, form=None):
        data = None
        headers = dict(headers or {})
        if form is not None:
            data = urllib.parse.urlencode(form, doseq=True).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        xsrf = next((c.value for c in jar if c.name == "XSRF-TOKEN"), None)
        if xsrf:
            headers["X-XSRF-TOKEN"] = xsrf
        try:
            with web.open(urllib.request.Request(url, data=data, headers=headers, method=method)) as resp:
                return resp.status, resp.headers, resp.read().decode()
        except urllib.error.HTTPError as err:
            return err.code, err.headers, err.read().decode()

    # The 401 that says where the resource metadata is.
    status, headers, _ = send("POST", f"{args.base}/mcp", body={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    challenge = headers.get("WWW-Authenticate", "")
    print(f"POST /mcp without a token: {status} {challenge}", file=sys.stderr)
    prm_url = re.search(r'resource_metadata="([^"]+)"', challenge).group(1)
    prm = json.loads(send("GET", prm_url)[2])
    issuer = prm["authorization_servers"][0]
    meta = json.loads(send("GET", f"{issuer}/.well-known/oauth-authorization-server")[2])
    print(f"resource {prm['resource']}, issuer {issuer}, scopes {prm['scopes_supported']}", file=sys.stderr)

    status, _, text = send(
        "POST",
        meta["registration_endpoint"],
        body={
            "client_name": "mcp_token.py",
            "redirect_uris": [REDIRECT],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        },
    )
    client = json.loads(text)
    print(f"registered client {client['client_id']} ({status})", file=sys.stderr)

    # Signed in by an emailed link, as a pilot is: the CSRF cookie first.
    send("GET", f"{args.base}/api/me")
    send("POST", f"{args.base}/api/auth/magic-link", body={"email": args.email})
    link = None
    for _ in range(20):
        messages = json.loads(urllib.request.urlopen(f"{args.mailpit}/api/v1/messages").read())["messages"]
        mine = [m for m in messages if any(t["Address"] == args.email for t in m["To"])]
        if mine:
            message = json.loads(urllib.request.urlopen(f"{args.mailpit}/api/v1/message/{mine[0]['ID']}").read())
            link = re.search(r"token=([A-Za-z0-9_-]+)", message["Text"]).group(1)
            break
        time.sleep(0.5)
    status, _, _ = send("POST", f"{args.base}/api/auth/magic-link/verify", form={"token": link})
    print(f"signed in as {args.email} ({status})", file=sys.stderr)

    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    query = {
        "response_type": "code",
        "client_id": client["client_id"],
        "redirect_uri": REDIRECT,
        "scope": " ".join(prm["scopes_supported"]),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": prm["resource"],
    }
    status, headers, page = send("GET", f"{meta['authorization_endpoint']}?{urllib.parse.urlencode(query)}")
    # Spring sends the browser on to its consent page.
    if status in (301, 302, 303) and headers.get("Location"):
        status, headers, page = send("GET", urllib.parse.urljoin(args.base, headers["Location"]))
    forms = Forms()
    forms.feed(page)
    print(f"consent page ({status}): {re.search(r'<h1>(.*?)</h1>', page).group(1)}", file=sys.stderr)
    status, headers, _ = send("POST", meta["authorization_endpoint"], form=forms.fields)
    back = urllib.parse.urlparse(headers["Location"])
    code = urllib.parse.parse_qs(back.query)["code"][0]
    print(f"approved ({status}), back to {back.scheme}://{back.netloc}{back.path}", file=sys.stderr)

    status, _, text = send(
        "POST",
        meta["token_endpoint"],
        form={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT,
            "client_id": client["client_id"],
            "code_verifier": verifier,
            "resource": prm["resource"],
        },
    )
    tokens = json.loads(text)
    claims = json.loads(base64.urlsafe_b64decode(tokens["access_token"].split(".")[1] + "=="))
    print(f"token ({status}): {json.dumps({k: claims[k] for k in ('iss', 'aud', 'sub', 'scope', 'exp')})}", file=sys.stderr)
    print(tokens["access_token"])


if __name__ == "__main__":
    main()
