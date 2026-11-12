# Google Maps over the chart

The map can draw an overlay over the FAA chart (the map's button →
Overlay), and set how strongly it covers the chart: Faint, Half or Full.
The overlay is one of:

- **Imagery:** the USGS's aerial imagery of the United States (The
  National Map's orthoimagery). It is a public-domain work and is always
  offered.
- **Google:** Google's map, or its satellite imagery with Google's roads
  and names over it. It is offered only where the deployment has a
  Google key (`GOOGLE_MAPS_API_KEY`).

How the Google overlay works:

- **Session.** The browser asks Google's Map Tiles API for a session for
  the kind of map, and keeps the session for its two weeks (`OverlayTiles`).
- **Tiles.** The browser draws the tiles from that session.
- **Referer.** The page sends no Referer anywhere (`Referrer-Policy:
  no-referrer`) except to Google: the session, tile and viewport requests
  carry the site's origin alone (`strict-origin`, `googleReferrer`), so a
  key restricted to the site's address works. Without it Google refuses a
  restricted key, and only an open one, which anyone could bill, would do.
- **Credit.** The map's lower corner says "Google Maps" with the data's
  copyright for the view, from Google's viewport service, as Google's
  policies ask.
- **No copies.** The app keeps no copy of Google's tiles: the service
  worker leaves them to the network, and Google's terms forbid storing
  or prefetching them.

Close in, past the FAA chart's own detail (the sectional's last zoom,
MapLibre's 11; a TAC's 12; IFR low's 10), the chart fades out over one
level into aerial imagery under it, and the map goes in to MapLibre's 17
(`closeZoom.ts`, `useCloseImagery.ts`, `CloseImageryGl`). By default that
imagery is the USGS's (The National Map's `USGSImageryOnly` tile cache,
NAIP over the lower 48, partners' imagery over Alaska, Hawaii, Puerto
Rico and the territories): a public-domain work, so it costs nothing,
needs no key and may go into Studio's exported videos. Its tiles end at
{z} 16 (about 2 m a pixel at 40 degrees north) and MapLibre enlarges
them past it, so at 16 and 17 it is softer than Google's; its photographs
are a few years old (the service says NAIP 2017 to 2021). Its credit,
"Imagery USGS The National Map", is in Status, as the overlay's is.
Where the USGS has none under the middle of the view (Canada beyond the
border, the Bahamas, the sea) or cannot be reached (offline), the chart
stays, enlarged two levels past its own, as before.

Google's satellite imagery, without Google's roads and names, is the one
close in only where the pilot has picked the Google overlay (and the
deployment has a key): then its session and tiles are asked for only a
level short of the fade, and its credit is the same "Google Maps" and
copyright as the overlay's. Google's terms forbid exporting its content
outside the service, so Studio's map never draws it (`ChartGl`'s
`publicOnly`) and an export asks `imageryForExport()` (`closeZoom.ts`)
whether what is drawn may go out.

## What only the owner can do

1. **A Google Cloud project with billing** (console.cloud.google.com).
   The Map Tiles API has a free monthly allowance and is then billed per
   thousand tiles; see Google Maps Platform's pricing.
2. **Enable the Map Tiles API** in the project (APIs & Services →
   Library).
3. **Create an API key** (APIs & Services → Credentials) and restrict
   it:
   - **Application restrictions:** Websites, with the site's address
     (`https://<the domain>/*`). For the phone stack at home, add
     `https://10.0.0.218:8443/*` and `http://localhost:8080/*`.
   - **API restrictions:** the Map Tiles API alone.

   The key reaches every visitor's browser, as a browser key must
   (`GET /api/map/google` hands it to anyone). The restrictions are what
   keep it to this site; never leave either off.
   - **Quotas:** in APIs & Services → Map Tiles API → Quotas, cap the
     requests a day (say 50,000 tiles and 1,000 sessions, raised as the
     pilots grow) so a key used elsewhere costs at most a day's cap.
   - **A budget alert:** Billing → Budgets & alerts, a monthly budget with
     alerts at 50, 90 and 100 per cent mailed to the owner.
4. **Give it to the stack:**
   - On the server: `GOOGLE_MAPS_API_KEY` in the stack's AppSecret
     (`infra/server/env.example`), then run `deploy.sh`.
   - At home: `GOOGLE_MAPS_API_KEY=...` in `.env`, then
     `docker compose up -d planner`.

   The map's settings offer Google from the next page load.
