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
level into Google's satellite imagery under it, without Google's roads
and names, and the map goes in to MapLibre's 17 (`closeZoom.ts`,
`CloseImageryGl`). It needs no choice of overlay, and its session and
tiles are asked for only a level short of the fade. With no key the
chart stays, enlarged two levels past its own, as before. Its credit is
the same "Google Maps" and copyright as the overlay's.

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
