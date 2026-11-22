# The FAA's NOTAM Management Service API: asking for access

Wingtip Maps holds only the NOTAMs the SWIM feed has sent since the server
first connected. Until it holds the full set, every screen says "NOTAMs
heard since <date>, not a full set" (decision 0059). The full set comes
from the FAA's NOTAM Management Service API (NMS-API). Access is asked of
the FAA by mail and is not self-serve, so this is the owner's step.

The client is built and off (`services/ingest/ingest/nms.py`). Setting the
two credentials in the server's environment turns it on, with no other
change.

## Who to write to

- **The access request:** the NOTAM Service Center,
  **7-AWA-NAIMES@faa.gov** (phone 1-866-466-1336). This is the address
  behind the "Request API Access" link on
  faa.gov/about/initiatives/notam, and the one the NMS FAQ gives for
  NMS-API access (last updated 2026-08-25, read 2026-11-21).
- **A copy:** **NOTAMS@faa.gov**, the NOTAM modernization program's
  address for questions. Older FAA slides and third-party clients name
  it as the access contact.
- Send it from the support address on the domain (launch checklist,
  "The domain and the contact"). If the FAA asks for a Login.gov
  account for the NMS website, use that address. It is separate from the
  API's client id and secret.

## What to send

> **Subject:** NMS-API access request: Wingtip Maps (flight planning app)
>
> Hello,
>
> I would like to request access to the NOTAM Management Service API
> (NMS-API) for Wingtip Maps, a flight planning app for VFR and IFR
> pilots in the United States (iPhone, iPad, Android and the web).
>
> - **Organization:** [legal name of whoever runs Wingtip Maps], [postal
>   address]
> - **Technical contact:** [name], [support address on wingtipmaps.app],
>   [phone]
> - **Intended use:** read-only distribution. We would make one initial
>   load of the NOTAMs in force, then request changes by delta query
>   (lastUpdatedDate) no more often than your limits allow. We would show
>   each NOTAM as issued, with its plain-language reading, in the
>   pilot's preflight briefing and on each airport's page, as part of the
>   information 14 CFR 91.103 asks a pilot to review. We originate no
>   NOTAMs. We already receive the SWIM FNS feed through SCDS.
> - **Format:** AIXM 5.1.
> - **Environments:** staging credentials first, to test against, then
>   production.
> - **Expected volume:** one server. One initial load a day at most, and
>   one delta request every three minutes.
>
> Could you also send:
>
> 1. the API's current OpenAPI document (nms-api.yaml) and the onboarding
>    guide, with the rate limits for each environment;
> 2. the terms of use, in particular whether NOTAM data from the API may
>    be shown to the public in a free or paid app, and any attribution
>    you require;
> 3. the planned retirement date of FNS and its Initial Load, and when
>    NMS's SWIM feeds (NMS-NDS and NMS-NPS) are available to existing FNS
>    subscribers.
>
> Thank you,
> [name]

## When the credentials come

1. Put `NMS_API_CLIENT_ID` and `NMS_API_CLIENT_SECRET` in the server's
   secret (`infra/server/env.example`).
   - For staging credentials, also set `NMS_API_HOST` to the staging host
     the FAA gives.
2. Restart ingest. Its log says "NMS-API: on".
   - The first turn loads every NOTAM in force.
   - Each turn after it pulls the changes, every three minutes.
   - Its state is in the live store's `beats` under "NMS".
3. Check the client against the FAA's document: the paths, the token
   request and the answers' shapes, each marked `TODO(nms-access)` in
   `ingest/nms.py`.
4. Once a load is held and kept up to date, the planner's answers say
   `full_set: true`. The "not a full set" lines and Ready to Fly's
   caution then go by themselves.

## Sources

- FAA, NOTAM Management Service: faa.gov/about/initiatives/notam; FAQ:
  faa.gov/about/initiatives/notam/faqs (read 2026-11-21).
- FAA, "NOTAM Modernization", Aeronautical Charting Forum, 2026-01-12:
  NMS-API deployed on 2025-10-01; AIXM 5.1 or GeoJSON; delta queries;
  "NMS-NPS requires NMS-API for initial load".
- Decision 0059.
