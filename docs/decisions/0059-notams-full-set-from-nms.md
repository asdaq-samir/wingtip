# 0059. The full NOTAM set comes from the FAA's NOTAM Management Service API

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21: "I will take your recs",
  on the market-gap audit's launch blockers)
- **Amends:** 0023 (NOTAMs only from the SWIM feed)

## Context

Decision 0023 chose the SWIM feed (FNS) alone and no FAA NOTAM API. The
feed sends each NOTAM as it is issued, replaced or cancelled, from the
moment the server first connects. It never sends the NOTAMs already in
force. A new production server would therefore start with none of the
runway closures, unserviceable ILSs and unlit obstacles issued before
launch, for as long as they last, which can be months. The app says
"none heard since" that day, which is honest. It is not the briefing that
14 CFR 91.103 ("all available information concerning that flight") and
AIM 5-1-3 expect.

The FAA is also replacing the systems 0023 relied on. Its NOTAM
modernization page (faa.gov/about/initiatives/notam, read 2026-11-21)
says the new cloud-based NOTAM Management Service (NMS), built by CGI
Federal, would be deployed "by late Spring 2026, after which USNS and FNS
will be sunset". The FAA's release of 2026-05-12 says the next phase,
"later this year", retires the Federal NOTAM Service (FNS). No date for
that has been published.

NMS's distribution interface is the NMS-API, deployed on 2025-10-01 (FAA,
Aeronautical Charting Forum briefing, 2026-01-12). It has a search by
time, location, accountability, radius and free text, and a delta query
for the changes since a time. Its answers come as AIXM 5.1 or GeoJSON. It
also has an initial load of every NOTAM in force. The FAA's slides add
that "NMS-NPS requires NMS-API for initial load": NMS's own SWIM feeds,
the replacements for FNS's, also start from the API's load.

Access is not self-serve. The FAQ (last updated 2026-08-25) says to
contact the NOTAM Service Center to request access to the NMS-API. The
page's "Request API Access" link writes to 7-AWA-NAIMES@faa.gov, and
NOTAMS@faa.gov takes questions. The API's own document (nms-api.yaml) and
its rate limits come with access. Third-party clients report:

- OAuth 2.0 client credentials;
- a production host of api-nms.aim.faa.gov;
- a staging host;
- one delta pull every three minutes;
- one initial load a day.

These are not yet checked against the FAA's document.

## Decision

1. **Back-fill and keep the NOTAMs from the NMS-API.**
   - ingest reads it (`services/ingest/ingest/nms.py`) beside the SWIM feed.
   - It makes one initial load when the store holds none, or has fallen a
     day behind.
   - Then it pulls the changes every three minutes.
   - Both are AIXM in FNS's form and go through the engine's same reader
     (`notams_fns`). A NOTAM heard from both sources is one row of the
     store, kept by its place and number (`wingtip.notams`).
   - A NOTAM the load leaves out, of a classification it holds, last heard
     more than a day before the load was asked for, has ended: its
     cancellation was missed while the feed was down.
   - A NOTAM heard within that day is kept, since it may be newer than the
     load's file.
2. **Off until the FAA gives access.** `NMS_API_CLIENT_ID` and
   `NMS_API_CLIENT_SECRET` turn it on (`NMS_API_HOST` defaults to
   production). The owner asks for access now: the request's text is in
   `docs/partners/faa-nms-api.md`, and its step is in
   `docs/store/launch-checklist.md`.
3. **Until it is on, every screen says what the app has.**
   - The planner's NOTAM answers carry `full_set`. It is true only while a
     load is held and was brought up to date within 15 minutes
     (`wingtip.notams.FULL_SYNC_WITHIN_S`).
   - Where it is false, the Brief and the airport card say "NOTAMs heard
     since <date>, not a full set", on the web, the iPhone and Android.
   - Ready to Fly (the engine's `ready_to_fly`) counts that list as a
     caution, whatever its age, and points to Flight Service or the FAA's
     NOTAM Search for the rest.
   - The store listing says "recent NOTAMs" (`docs/store/listing.md`).
4. **The SWIM feed stays.** It brings a NOTAM within seconds of issue,
   between the API's three-minute pulls. When the FAA retires FNS, NMS's
   own SWIM feed takes its place on the same reader.

## Consequences

- The NOTAM list becomes the full set as soon as the FAA's credentials
  are in the environment, with no other change. Until then the app warns
  everywhere NOTAMs are shown, and never limits (the owner's "warn, never
  limit").
- The client is written against the third-party description of the API.
  Its paths, the token and the answers' shapes are marked
  `TODO(nms-access)`, to be checked against nms-api.yaml when access comes.
- Ready to Fly shows one caution that nothing on the device fixes, until
  NMS is on.
- The FAA's terms for redistributing NMS data in a commercial app are not
  published. The access request asks for them.

## Source

- The owner, 2026-11-21: "I will take your recs", on the market-gap
  audit's first launch blocker.
- FAA, NOTAM Management Service: faa.gov/about/initiatives/notam, and its
  FAQ at faa.gov/about/initiatives/notam/faqs (both read 2026-11-21).
- FAA, "NOTAM Modernization", Aeronautical Charting Forum, 2026-01-12.
- 14 CFR 91.103; AIM 5-1-3.
