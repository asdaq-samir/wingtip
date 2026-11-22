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
| L4: connector tokens outlived account deletion and disconnecting | The planner asks the gateway whether the connection stands on every call. The gateway keeps a yes (`LiveConnections`) for at most 60 s and never past the first expiry of the connection's tokens, so a token that runs out on its own is refused from its own expiry; every change the gateway makes to a pilot's connections (a token issued, rotated or revoked through `/oauth2/revoke`, a connection removed for a replayed refresh token, the account deleted) forgets the pilot's kept answers at once, and an answer read across such a change is not kept. The 60 s bounds only a change made behind the gateway's back (the tables edited by hand, or a second gateway process, which the deployment does not run). |
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

## The review of 2026-11-21

A second pass (claude/security-fix, from claude/fpl-edit) over the gateway,
the planner and its services, the web, the phones, CI and the repository.
Nothing critical or high; what it fixed:

| Finding | Now |
|---|---|
| M: no limit on a JSON request body; Jackson read all of one before any `@Size`, on routes open to anyone (`/api/diagnostics`, `/api/speed/field`, the sign-in requests) | 10 MB on every request (`RequestBodyLimit`): a 413 for one declared larger, a chunked one stopped as it is read. Routes that hold themselves to less still do. |
| M: a web page on the planner's machine could reach the planner on loopback, by DNS rebinding (X-Pilot-Id set, every pilot's checkpoint notes read) or by a cross-site form post (a retrain, a chart refresh) | The planner answers only its own names (`planner`, loopback, the tests') and refuses a request from another site's page (`Origin`, `Sec-Fetch-Site`): `app/local_guard.py`. |
| M: Jupyter's token a fixed word in this public repository, with `DEV_PUBLISH_ADDRESS=0.0.0.0` a kernel on the Wi-Fi | `JUPYTER_TOKEN` from `.env`, else a random one each start, printed in `docker compose logs ml`. |
| L: a booklet's text was read again under the drawing lock for every new field asked of it, so made-up fields held up every diagram | The text is read once per PDF; a field is a search of it. |
| L: a deletion link's token, sent with its purpose in front, matched its row as a sign-in | Only a token of the shape the links are made in is looked up (`MagicLinkController.isLinkToken`). |
| L: a place's or a photo's link opened whatever address it held (`javascript:`, `data:`) | The web opens only http(s), tel:, mailto: and this site's paths (`lib/safeHref`); the planner keeps only http(s) websites from Overture. |
| L: a connector callback prefix took any string after it (`.../oauth/../../x`) | One plain path segment, ChatGPT's callback id. |
| L: `.gitignore` named only `.env` | Other `.env.*` files, `.p8`, `.p12`, `.jks`, `.keystore`, `.pem` and `.key` too. |

The rest, left for the owner or as they are, are in the review's own
write-up: the gateway's plain HTTP port on the Wi-Fi in the phone mode
(ForeFlight takes the pack from it), the Android App Links file before
launch, the offline cuts' disk on a machine with the archives, a link's
Home and Favorites applied without asking, and the CI hardening of the
review workflow's tools.

## The deep review of 2026-11-21

An adversarial pass (claude/security-deep, from claude/fpl-edit with
claude/security-fix, claude/server-later and claude/store-review merged)
over sign-in, the connector, access control, parsing, the web, the phones,
the AWS template and CI. Nothing critical. The outside test's brief is
[security/pentest-scope.md](security/pentest-scope.md). What it fixed:

| Finding | Now |
|---|---|
| H: the CI autofix bot ran a branch's own formatters in the job that pushed with `MERGE_TOKEN`, the owner's, which a branch's `format.sh` could read from `/proc` or a `pre-push` hook | Three jobs on three machines: the formatters run with no token at all, and only their diff reaches the push, which applies changes to existing files of the pull request's own, hooks off (`ci-autofix.yml`, `autofix_format.sh`). The review's address job, which pushes, no longer fetches pages (the first review's L11). |
| M: on AWS a container reached the instance's metadata (hop limit 2) and so the server role's keys: every secret and backup | `HttpPutResponseHopLimit: 1`; both buckets refuse requests not over TLS. |
| M: a connector token revoked while its connection's refresh token stood, or one of a second connection through the same client, kept working | The planner asks about the token itself (`X-Connector-Token`, an introspection); `LiveConnections` keeps a yes per token, never past its expiry. |
| M: five link requests from anyone locked a pilot out of signing in for the hour | The address's five are counted per caller, 30 an hour in all (`MagicLinkController.ADDRESS_CALLERS`). |
| M (availability): the AWS tile path asked the planner for `/chart-tile/...` under the origin's Host, a 404 then a 403, which CloudFront would have kept | Rewritten as the gateway does (`/api/planner/X` is `/api/X`), the planner named `planner`. |
| M (availability): two migrations numbered V46, so the merged gateway would not start | The Apple token's client is V49 (ops-audit's indexes took V48); `MigrationVersionsTest` refuses a repeat. |
| L: an iPhone sign-in kept the Apple refresh token of whatever code came with it, another account's too | Kept only where Apple's ID token for the code names the signing-in subject. |
| L: the Apple nonce route made a 30-day session per call, for anyone | 30 an hour a client. |
| L: the delete-account page's time told which addresses have an account (the mail sent on the request's thread) | Sent on a thread of its own. |
| L: a provider's email change left magic-link sessions under the old, now free, address | They end with the change. |
| L: NOTAM, METAR and remark text reached the pilot's AI app with nothing saying it is data, hidden Unicode included | The server's instructions say it is data; `calls.as_data` takes out control and format characters. |
| L: the batch routes took any number of asks | 500 a call. |
| L: deleting an account on the web, or a session lapsing, kept the planner's answers at the pilot's points, the tracks and the trail; Android's sign-out kept OkHttp's cache | Forgotten as Log Out forgets them (`forgetWhereTheyFlew`); Android's wipe empties the cache. |
| L: Android closed on a link with a bad escape (`wingtipmaps://plan?x=%`) | The part is left out. |
| L: the iPhone logged notification titles, watched airplanes and route fields as public | Private. |
| Info: no `form-action` in the page's CSP; the airport mark's class unescaped (L17); a `..` path parameter in the connector's calls; FAA index PDF names unchecked (L16) | `form-action 'self'`; escaped; sent as `%2E`; checked against `_PDF_NAME`. |

What round 2 (claude/round2-security, 2026-11-21) did with what the deep
review left (the owner: "I will take your recs"):

| Left | Now |
|---|---|
| N1: anyone could sign endorsements under any certificate number, a student's second account for themselves | The engine's `instructor_verification` checks the signing instructor against the FAA's Airmen Certification Releasable Database, which ingest now keeps monthly (`ingest.airmen`, flight instructors only, no addresses): one record of the name, not the student, not a record another account here signs as, not expired (14 CFR 61.1, 61.19(d)(2), 61.189(a)). Otherwise the endorsement is kept, labelled Not verified and held for nothing. The file has no certificate numbers, so the match is by name; someone signing first as a real instructor not yet here is not caught (scope, section 7). |
| N2: no Wingtip-side way to end a connector connection | You, Connected Apps: each connection listed and disconnected one at a time, its tokens and spent refresh hashes deleted, the consent with the last (`/api/me/connections`). |
| N3: a phone route link replaced the plan without the preview | On the iPhone and Android a route link (and Android's AI and App Functions routes) opens the shared-flight preview; the plan changes at Use This Plan. |
| N4: the gateway and Flyway used the Postgres superuser | Flyway signs in as the owner (`wingtip`); the app as `wingtip_app`, rows only, made and re-granted by `db/callback/afterMigrate.sql`, with its own secret (`AppDbPasswordSecret`, `APP_DB_PASSWORD`). |
| N5: a busted tile cache key reached the planner unlimited | AWS WAF `TileRateLimit` on the distribution: 3,000 tile requests per address per 5 minutes, then 429; about $6.20 a month (README-AWS). |
| N6: an iPhone sign-in's Apple token replaces the web's, whose grant is then never revoked | Needs a device: the check and what each answer decides are in NATIVE.md, "Checking on a device". |
| N8: addresses compared case-sensitively | V50 merges pilots one address apart but for case (or keeps one apart, under a reserved `.invalid` address, where a merge would break a unique key), notes each in `email_case_merges`, and makes `lower(email)` unique; `findByEmail` folds case. |

What stands, with why, is the scope's section 7.
