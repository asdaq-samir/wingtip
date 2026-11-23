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
        print((await c.call_tool("sun_times", {"airport": "KMSN", "on": "2026-12-21"})).structured_content)
```

Questions that reach the route and field tools, once connected: "Winds
at 9,000 over KMSN this afternoon?" (`winds_aloft`), "Anything nasty
between KMSN and KDLH at 6,500 tomorrow at 14Z?" (`route_hazards`), "What
airspace and TFRs does that route cross?" (`route_airspace`), "When does
night start at KDLH tonight for my passenger currency?" (`sun_times`, which
reads "tonight" on the field's own date and gives each time in its zone as
well as UTC), "Takeoff distance and CG for my N123AB at KDLH with 340 lb up
front?" (`airplane_performance`, which names any figure it is missing), and
"Go / No-Go for N123AB, KMSN to KDLH, me 190 and 170 up front, 40 lb of
bags?" (`flight_briefing` with `stations_lb`; without it the weight and
balance is said not worked, never the POH's sample airplane's).

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

## The live view, beside the chat in Claude

The connector's flight tools (`show_flight`, the edits, the saved flights:
design section 4) answer with an MCP App, Wingtip's live view
(`ui://wingtip/flight`, decision 0061): Claude opens it beside the chat
and draws each answer in it, and a tap in it changes the flight and tells
Claude. Its page is the web's build, `/app/claude-view.html`, which the
planner reads from the gateway; a stack whose web was built before this
change shows "not built on this server" in its place. It renders in
Claude Desktop and on claude.ai (inline, in the side panel where the
account has it, full screen); Claude Code reads the same tools as text.

### On the owner's live stack, from Claude Desktop (no tunnel)

The live stack is https://10.0.0.193:8443, on the Wi-Fi, which Anthropic's
servers cannot reach; Claude Desktop can, through a local bridge to the
remote server (`mcp-remote`, which does the OAuth sign-in in the
browser with a loopback callback the gateway accepts).

1. In `~/Developer/wingtip-live/.env`, `MCP_ENABLED=true` (the issuer is
   already `PHONE_BASE_URL`, https://10.0.0.193:8443), then
   `scripts/dev/go-live.sh --up`.
2. Trust the stack's certificate on the Mac once, so the bridge and the
   view's chart tiles reach it: open
   `~/Developer/wingtip-live/infra/local-https/certs/ca.pem` in Keychain
   Access, then set it to Always Trust.
3. Claude Desktop, Settings > Developer > Edit Config, add:

   ```json
   {
     "mcpServers": {
       "wingtip-live": {
         "command": "npx",
         "args": ["-y", "mcp-remote@0.16.7", "https://10.0.0.193:8443/mcp"],
         "env": { "NODE_EXTRA_CA_CERTS": "/Users/asdaqsamir/Developer/wingtip-live/infra/local-https/certs/ca.pem" }
       }
     }
   }
   ```

   and restart Claude Desktop. The browser opens Wingtip's Connect page:
   sign in with the emailed link (the stack's Mailpit), leave or untick
   "Save, change and delete your saved flights", Connect.
4. In a chat: "Show my flight from C81 to KDLH in Wingtip", then "Add a
   stop at KMSN", "Cruise at 6,500", "Load the ILS 27 at Duluth and
   activate it", "Put in the fuel stops I need", "Save it". Allow the
   view when Claude asks. Tap Remove on a stop or Activate on the
   approach in the view, then ask Claude what changed. Open in Wingtip
   opens the same flight on the phone's address.

### On claude.ai, the web or the phone app (a tunnel)

claude.ai calls the connector from Anthropic's servers, so the stack
needs a public HTTPS address for the session:

1. `cloudflared tunnel --url https://10.0.0.193:8443 --no-tls-verify`
   (or `ngrok http https://10.0.0.193:8443`), and note its `https://`
   address.
2. In the live tree's `.env`, `MCP_ENABLED=true` and `PHONE_BASE_URL` set
   to the tunnel's address (it is the issuer, the resource and the view's
   allowed origin, and each must be what Claude sees), then
   `scripts/dev/go-live.sh --up`.
3. claude.ai, Customize > Connectors > Add custom connector, URL
   `https://<tunnel>/mcp`, Connect, sign in and approve as above; in a chat,
   + > Connectors, turn Wingtip on, and ask as above.
4. Afterwards: the tunnel down, `PHONE_BASE_URL` back to
   https://10.0.0.193:8443, `go-live.sh --up`.

ChatGPT takes the same tools through developer mode (step 4 of the
section above); whether it draws the view is ChatGPT's, through the same
MCP Apps extension.

## Disconnecting from Wingtip's side

You's **Connected Apps** lists each connection (the app's name, what it
may do in the consent page's words, when its token was last issued) with
**Disconnect** at its end. Disconnecting asks
first, then `DELETE /api/me/connections/{id}` (ConnectionsController,
`ConnectorGrants.disconnect`) removes that connection's row with its
access and refresh tokens and their spent hashes, so the app's next MCP
call is refused (the planner's introspection, `ConnectorGrants.live`) and
no refresh is granted; the consent goes with the last connection through
that app, so connecting again asks again. `GET /api/me/connections` is the
list; another pilot's id is a 404 and is never touched.

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
