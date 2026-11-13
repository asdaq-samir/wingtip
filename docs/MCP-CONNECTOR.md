# Trying the connector on a local stack

How a developer reaches the Wingtip connector (the MCP server at `/mcp`,
`docs/design/mcp-connector.md`) on their own machine: with a script, with
the MCP Inspector, and from Claude or ChatGPT through a tunnel. Nothing here
is deployed; the production steps are the design's section 7.

## On

The connector is off unless the gateway has `MCP_ENABLED=true`: off, every
one of its addresses (`/mcp`, `/oauth2/*` but the app's own Google and Apple
sign-in, the metadata, `/connect`, `/internal/mcp/*`) is a 404, and so it is
in production until the connector launches. To try it here, put
`MCP_ENABLED=true` in `.env` and `docker compose up -d gateway`.

The planner serves its side wherever it has `MCP_ISSUER`, which
`docker-compose.yml` sets to the gateway's public address
(`APP_PUBLIC_BASE_URL`, `http://localhost:8080` by default). The gateway
serves `/mcp`, `/.well-known/oauth-protected-resource/mcp`, its own
authorization server metadata at `/.well-known/oauth-authorization-server`,
and `/oauth2/*`.

The planner reads a pilot's records from the gateway's `/internal/mcp/*`,
which answer only on the gateway's internal port, 8081, which no compose
file publishes (`InternalPortConfig`; Caddy refuses `/internal/*` too), and
only with `MCP_INTERNAL_TOKEN`, a secret both services share. It has no
default in the repository: `make dev` (`scripts/dev/dev.sh doctor`) writes a
random one into `.env` the first time, and the gateway will not start with
the connector on and no token. With `MCP_SIGNING_KEY` blank the gateway
makes a key at start, so every restart signs connected apps out until they
refresh.

## A token, by script

`scripts/dev/mcp_token.py` goes the way Claude does: the `401`, the
metadata, a client registered, a pilot signed in by an emailed link read
from Mailpit, the consent approved, and the code exchanged with PKCE. It
prints the access token (15 minutes):

```sh
TOKEN=$(python3 scripts/dev/mcp_token.py --base http://localhost:8080 --mailpit http://localhost:8025)
```

Then any tool, with the MCP Python SDK's own client (in the planner's
image, which has it):

```python
import asyncio, httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client


async def main(token):
    http = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=120)
    async with Client(streamable_http_client("http://localhost:8080/mcp", http_client=http)) as c:
        print([t.name for t in (await c.list_tools()).tools])
        print((await c.call_tool("airport_weather", {"ident": "KMSN"})).structured_content)
```

## The MCP Inspector

The Inspector does the whole OAuth flow itself and shows each step. In the
Node container (the Mac has no Node), its UI on 6274:

```sh
docker run --rm -it -p 127.0.0.1:6274:6274 -p 127.0.0.1:6277:6277 -e HOST=0.0.0.0 \
  node:26-slim npx -y @modelcontextprotocol/inspector@2.14.0
```

Open the address it prints, choose Streamable HTTP, URL
`http://host.docker.internal:8080/mcp`, and Connect. Its callback,
`http://localhost:6274/oauth/callback`, is a loopback one, which the gateway
accepts on any port (`MCP_REDIRECT_URIS`). The issuer is the gateway's
public address, so set `APP_PUBLIC_BASE_URL=http://host.docker.internal:8080`
for this, or the Inspector's discovery will fetch `localhost` inside its
container.

## Claude or ChatGPT, through a tunnel

Claude's and ChatGPT's servers call the connector, so it needs a public
HTTPS address. A quick tunnel gives one; none is set up in this repository.

1. Start a tunnel to the gateway, for example Cloudflare's
   (`cloudflared tunnel --url http://localhost:8080`) or ngrok's
   (`ngrok http 8080`), and note its `https://...` address.
2. Put that address in `.env` as `APP_PUBLIC_BASE_URL` (it is the issuer
   and the base of the resource, and both must be what the AI app sees),
   then `docker compose up -d gateway planner`.
3. **Claude** (any plan that has custom connectors, design section 1):
   Customize > Connectors > Add custom connector, URL
   `https://<tunnel>/mcp`, sign-in Detected (Claude registers itself:
   Spring Authorization Server has no CIMD), then Connect. Sign in with the
   emailed link in the same browser (Mailpit at http://localhost:8025 has it),
   approve, and ask Claude about a route. Claude Code takes the same URL:
   `claude mcp add --transport http wingtip https://<tunnel>/mcp`.
4. **ChatGPT** with developer mode on: chatgpt.com/plugins, Add custom MCP
   server, the same URL, OAuth; it registers itself the same way.
5. Take the tunnel down after; `APP_PUBLIC_BASE_URL` back to its default.

## When it does not connect

- **"Couldn't reach the MCP server"**: the `401` lacks
  `resource_metadata`, or the metadata's `resource` is not the URL entered
  (they must match exactly, path included). `curl -i -X POST <url>/mcp`
  shows the challenge.
- **Sign-in loops or the issuer is refused**: the issuer
  (`APP_PUBLIC_BASE_URL`) is not the address the AI app reached; the
  metadata names it.
- **`invalid_redirect_uri` at registration**: the AI app's callback is not
  in `MCP_REDIRECT_URIS`.
- **A tool answers "connect Wingtip again"**: the gateway restarted with a
  new key and the token could not be refreshed, or the account is gone.
