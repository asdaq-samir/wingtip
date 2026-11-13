# Security notes

What the security audit of 2026-11-10 (main at 29645d362) found on the
servers and the web, what changed, and the standing decisions and console
steps behind it. The phone apps' findings (the sign-in link taken without
asking, M1; the session cookie outside the Keychain and Keystore, L9) are
the apps' own work; the gateway half of M1 is here.

## What changed

| Finding | Now |
|---|---|
| M2: `/internal/mcp/*` (any pilot's records by id) reachable from outside, behind a committed default token | Served only on the gateway's internal port 8081, which no compose file publishes (`InternalPortConfig`); a 404 on 8080 and 8443; Caddy refuses `/internal/*` too. `MCP_INTERNAL_TOKEN` has no default: `make dev` writes a random one into `.env`, and a gateway with the connector on and no token will not start. |
| M3: open client registration with no limit; the authorization server on in production | The connector is off unless `MCP_ENABLED=true` (every address a 404, `ConnectorOff`); 10 registrations an hour per address, a 100-character name, 4 callbacks of 200, a 16 KB body; unused clients and ended connections let go each night (`ConnectorHousekeeping`). |
| M4: the Google key unusable with a referrer restriction | Google's requests carry the site's origin (`strict-origin`), every other request none; the key's restrictions are the owner's console step below. |
| L1 (and M1's server half): the link's dialog named no account | `POST /api/auth/magic-link/account` answers the masked address of a usable link without spending it; the web dialog shows it ([NATIVE.md](NATIVE.md) has the call for the apps). |
| L2: a viewer's `Forwarded` header reached Spring | Caddy drops `Forwarded` and `X-Forwarded-Prefix`. |
| L3: a replayed refresh token left its connection live | A spent refresh token presented again revokes the whole connection (`RotatedRefreshTokens`). |
| L4: connector tokens outlived account deletion and disconnecting | The planner asks the gateway whether the connection stands on every call. |
| L5: Apple's native sign-in had no nonce | A session nonce, verified when sent; required once the app sends it (`APP_APPLE_REQUIRE_NONCE`, [NATIVE.md](NATIVE.md)). |
| L6: `/mcp`'s body limit read only Content-Length | Held on the bytes read, chunked bodies too. |
| L7: unknown key ids refetched the gateway's keys each time | At most once a minute. |
| L8: the `pilot-own` cache outlived account deletion and session expiry | Emptied on Log Out, account deletion and a 204 from `/api/me`. |
| Info: the dev planner on the Wi-Fi skipped the gateway's developer check | 8084 is on loopback only. |

## Decisions

- **The API documents stay public in production** (`/v3/api-docs`,
  `/swagger-ui`). The repository is public and holds the same documents
  (`docs/api`, generated from the services, which the apps' clients come
  from), the API is the apps' public one, and the routes only the services
  call are `@Hidden` and on the internal port. Turning them off would hide
  nothing a reader of the repository cannot already see, and would take
  the live reference away from whoever writes a client.
- **Dependabot alert #193, deepmerge 4.3.1** (GHSA-gcqx-w48m-w2h4, low, no
  fixed version) stays open, not dismissed. deepmerge comes in only through
  the `shadcn` CLI, `@shadcn/registry` and `@rollup/plugin-node-resolve`,
  which run at build time on the developer's machine and in CI; none of it
  is in the bundle the browser loads, so the app has no exposure at run
  time. When a fixed deepmerge is released, `npm update` takes it
  ([versions.md](versions.md)).
- **CI runners.** While the repository is public, no self-hosted runner
  (`vars.LINUX_RUNNER`): a fork's pull request would run on the Mac mini.
  Keep "Require approval for all outside collaborators" on regardless.

## What only the owner can do

1. **The Google Maps key** (only with the map's Google overlay), in Google
   Cloud: restrict it to the Map Tiles API and to the site's referrer
   (`https://<the domain>/*`), set daily quotas on the Map Tiles API, and a
   budget alert ([GOOGLE-MAPS.md](GOOGLE-MAPS.md)). The app hands the key
   to every browser; those restrictions are all that keep it to the site.
2. **The connector, at launch:** `MCP_ENABLED=true`, a long random
   `MCP_INTERNAL_TOKEN` (`openssl rand -hex 32`) on the gateway and the
   planner, and `MCP_SIGNING_KEY` ([design/mcp-connector.md](design/mcp-connector.md),
   section 7). Until then production leaves it off.
3. **Apple's nonce:** once an iOS build that sends it is the oldest in
   use, set `APP_APPLE_REQUIRE_NONCE=true` on the gateway.
