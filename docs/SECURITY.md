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
| M3: open client registration with no limit; the authorization server on in production | The connector is off unless `MCP_ENABLED=true` (every address a 404, `ConnectorOff`); 10 registrations an hour per address (an IPv6 caller's /64), a 100-character name, 4 callbacks of 200, a 16 KB body; unused clients, ended connections and authorizations never finished (a day after they began, V54) let go each night (`ConnectorHousekeeping`). |
| M4: the Google key unusable with a referrer restriction | Google's requests carry the site's origin (`strict-origin`), every other request none; the key's restrictions are the owner's console step below. |
| L1 (and M1's server half): the link's dialog named no account | `POST /api/auth/magic-link/account` answers the masked address of a usable link without spending it; the web dialog shows it ([NATIVE.md](NATIVE.md) has the call for the apps). |
| L2: a viewer's `Forwarded` header reached Spring | Caddy drops `Forwarded`, `X-Forwarded-Prefix`, `-Port` and `-Ssl`, and the gateway reads none of them: Tomcat's RemoteIpValve (`forward-headers-strategy: native`) takes X-Forwarded-For, -Proto and -Host from the trusted proxies alone (`GATEWAY_TRUSTED_PROXIES`, loopback where unset), and the port from the protocol. |
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
| M: five link requests from anyone locked a pilot out of signing in for the hour | The address's five are counted per caller, 30 an hour in all (`MagicLinkController.ADDRESS_CALLERS`, `SlidingWindowLimiter.allowLink`), and since round 4 an IPv6 caller is its /64, so a lockout takes 6 networks, not 6 addresses of one; the deletion link is counted the same way. |
| M (availability): the AWS tile path asked the planner for `/chart-tile/...` under the origin's Host, a 404 then a 403, which CloudFront would have kept | Rewritten as the gateway does (`/api/planner/X` is `/api/X`), the planner named `planner`. |
| M (availability): two migrations numbered V46, so the merged gateway would not start | The Apple token's client is V49 (ops-audit's indexes took V48); `MigrationVersionsTest` refuses a repeat. |
| L: an iPhone sign-in kept the Apple refresh token of whatever code came with it, another account's too | Kept only where Apple's ID token for the code names the signing-in subject. |
| L: the Apple nonce route made a 30-day session per call, for anyone | 30 an hour a client. |
| L: the delete-account page's time told which addresses have an account (the mail sent on the request's thread) | Sent on a thread of its own, and since round 4 the look-up and the link's row with it. |
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
| N5: a busted tile cache key reached the planner unlimited | AWS WAF `TileRateLimit` on the distribution: 3,000 tile requests per address per 5 minutes, then 429; since round 4 a second rule holds every other `/api/planner/` path to the same, counted apart (M4); about $7.20 a month (README-AWS). |
| N6: an iPhone sign-in's Apple token replaces the web's, whose grant is then never revoked | Needs a device: the check and what each answer decides are in NATIVE.md, "Checking on a device". |
| N8: addresses compared case-sensitively | V50 merges pilots one address apart but for case (or keeps one apart, under a reserved `.invalid` address, where a merge would break a unique key), notes each in `email_case_merges`, and makes `lower(email)` unique; `findByEmail` folds case. |

What stands, with why, is the scope's section 7.

What round 4 (claude/r4-gateway, 2026-11-23) did with the gateway's
findings of that day's security review (the owner took every
recommendation):

| Finding | Now |
|---|---|
| M1: every per-caller limit was per IPv6 address, and one /64 holds 2^64 | `SlidingWindowLimiter.clientOf` counts an IPv6 caller by its /64: the sign-in and deletion links, connector registrations, Apple nonces, the account look-up, diagnostics, speed samples, instructor invites and link checks. AWS WAF's rate rules still count per address; WAF has no prefix key. |
| M4: anonymous planner routes had no limit beyond the two tile paths | A second rule in `TileRateLimit`: 3,000 requests to any other `/api/planner/` path per address per five minutes, then 429. |
| The old L4's defence in depth: the internal flight writes trusted the planner's word on the scope | `POST`, `PUT` and `DELETE /internal/mcp/flights` need the pilot's own access token (`X-Connector-Token`), active and granted `wingtip:flights` (`ConnectorGrants.mayChangeFlights`); a 403 otherwise. A connection consented to before V53 refreshes to the old `wingtip:write` and is refused a save (`ConnectorGrantsTest`). The planner passes the token it was sent on those three calls (app/mcp/records.py, the connector's half). |
| L1: `/oauth2/revoke` refused every connector client, all public | `PublicRefresh` admits a public client there by its id, and Spring's provider revokes only a token issued to it; the metadata lists `none` for revocation. |
| L2: an authorization left on the consent page was never deleted | `created_at` (V54); one with no token is let go a day on. |
| L3: anyone could block a pilot's web account deletion for an hour | Counted as the sign-in link is, the caller first (`allowLink`); the look-up and the row off the request's thread. |
| L4: instructor invites relayed any text to any address | The subject is fixed; the name in the mail is a name's letters alone (`InstructorService.mailedName`), and the name a pilot sets must be one (`FullNameRequest`); 10 invites a day per caller as well as 5 per student. |
| L6: Apple's web sign-in did not check `iss` | `issuerUri("https://appleid.apple.com")`. |
| L7: the review code needed only 20 characters, and verifying had no limit | 32 or more base64url characters; every verify counted per caller (`APP_MAGIC_LINK_PER_CLIENT_PER_HOUR`). |
| L8: Google's and Apple's tokens stayed in Boot's in-memory store | Let go of at sign-in, once Apple's refresh token is kept. |
| L9 (the gateway's half): a signed-in write with no pilot reached the planner without `X-Pilot-Id` | A 401. |
| L13: `X-Forwarded-Port` and `-Ssl` reached Spring | See L2 above. |
| Reuse M2: the client's address worked out by hand, and X-Forwarded-Host believed from anyone | The RemoteIpValve as in L2; a share link is built from `APP_PUBLIC_BASE_URL` wherever it is set (`FlightShareController.origin`). |

## The live view in Claude (decision 0061)

What Wingtip inside Claude (claude/claude-app, 2026-11-22) adds, and how
each way in is held:

| Way in | Held by |
|---|---|
| The view's page runs code from elsewhere, or loads more than it says | One self-contained file, the web's own build, served by the planner as the `ui://` resource; its CSP (`_meta.ui.csp`) names Wingtip's own origin alone, for the chart's tiles as images (`resourceDomains`; no `connectDomains`, as it fetches nothing), which the host enforces with no loosening (MCP Apps 2026-01-26, "Host Behavior"). No token, cookie or account data is in the view or reachable from it: its calls go through the host to the connector, with the pilot's own connection. |
| A tool, or text in an answer, makes Claude change the pilot's account | The edits change only the flight handed to them and keep nothing, so they ask only `wingtip:read`; saving, replacing and deleting a saved flight need `wingtip:flights` (not the old `wingtip:write`, consented to as saving alone: a kept consent covers none of the new scope, V53), which the pilot may untick on the consent page, and are `destructiveHint: true` where they overwrite or delete, which Claude always asks about. Third-party text in answers is data (the server's instructions, `calls.as_data`), as before. |
| A flight handed back tampered with (by the model, or by text it read) | Nothing in it is trusted: every field is checked by its model's bounds (`flight_state.Flight`), every point and procedure by the planner and the engine on each call (`/api/plan`, `procedures_read`, the CIFP's list), the airplane by the pilot's own records, the saved flight by the pilot's own list. |
| The view tells Claude more than the pilot did | Only what a tap did and the flight's new state, the connector's own words (`ui/update-model-context`); an older view of the flight, once a newer one is open, changes nothing and tells nothing. |
| Many taps, or a loop of edits | Every tool counts against the pilot's limits (`MCP_CALLS_PER_MINUTE`, `MCP_CALLS_PER_DAY`), as before. |
| A saved flight an instructor reviewed replaced, so their 61.93 endorsement stands over a route they never saw | `FlightService.replan` answers a 409 for any flight put to an instructor for the solo cross-country review (the security review of 2026-11-22, M1); the connector says to save a new flight. |
| A flight handed back pointed at another of the pilot's saved flights | The gateway refuses a plan between other airports than the saved flight's unless `replaceRoute`, which only the model's `update_saved_flight` can ask (`replace_route`, visibility `["model"]`, confirmed by the host); the view's Update button names the saved flight's route from the pilot's own records and cannot replace it. |
| Another connector's view on the host's sandbox origin stands Wingtip's views down | The views' BroadcastChannel is named by the server, an HMAC of the view's URI and the pilot with the shared secret, and only a well-formed key is heard. |
| A short MCP_INTERNAL_TOKEN guards every pilot's records | Both the gateway (`ConnectorSettings`) and the planner (`wingtip.config`) refuse to start with fewer than 32 characters, and the planner's error never prints the value. |
| A replaced flight's share link shows the new route unannounced | The answer says that the link now shows it. |
| The view deletes a saved flight without the host's ask | `delete_saved_flight` is `_meta.ui.visibility: ["model"]`, so the host refuses it from the view. |
| A flight handed back with a map of any size | `Flight.fuel_on_board` is bounded as the stops are (`MAX_STOPS + 2` fields, each an identifier). |
| Another pilot's saved flight replaced or deleted | The gateway's `PUT` and `DELETE /internal/mcp/flights/{id}` find the flight by id and the pilot's own id together (`FlightService.get`), a 404 otherwise, on the internal port with the planner's secret alone. |
| What a connected app may do is hidden from the pilot | You's Connected Apps says it under each app, in the consent page's own words (`ConnectionDto.can`, `ConnectorSettings.SCOPE_WORDS`). |

## Round 4, the planner (claude/r4-planner, 2026-11-23)

| Found | Now |
|---|---|
| M2: anyone could make the planner fetch and keep terrain tiles for the whole world | Past the sectionals' sheets (`chart_coverage`) a tile is the sea's surface, drawn once in memory; nothing is fetched or kept (`terrain_view._charted`). |
| M3: any FAA PDF name of the right shape was fetched, kept and drawn under the one drawing lock; past editions were kept for good; `_ABSENT` was wiped whole at 1,000 | Only a PDF the edition's own index names is fetched (`publications.listed`, in `_pdf_of`), names matched whole (`fullmatch`); past editions' PDFs, pages, diagrams and plates go at each changeover (`publication_prune`); the misses are an LRU of 1,000. |
| M5: any hex id fetched once was followed for 30 days, and made-up ids sorted first starved the real ones | Followed only for a signed-in pilot (`X-Pilot-Id`, the gateway's), at most 500, the card opened latest asked first; an id no source has heard a day after is dropped (`FOLLOW_UNHEARD_S`). |
| L10: the nav log's stream sent the raw exception | Its kind and the request's id; the text stays in the log. |
| L12: off-grid chart tiles made a folder and a `.none` each | No tile outside `[0, 2^z)`, before anything is kept. |
