# apps/web/

React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + MapLibre GL
front end, built into `gateway`'s jar and served from `/app`. Two pages, one
component (`MapPage`) in two modes:

- `/app/plan` — the pilot's page, and the app's own homepage (`/app`
  redirects here). Enter a departure and destination; get the charted
  course, scored checkpoints and the nav log, in a drawer beside the
  map. Every checkpoint, the two airports and every Class B airport
  (off by default; the layers popover switches it on) are markers on
  the chart — tap one to go to it and open its card, tap the chart to
  put the card away. The altitude row in the nav log's header opens
  the planner's own reasoning and its four plans (lowest, highest,
  fastest for the winds, economical on fuel), one tap to fly another, or a custom
  altitude. A departure time gives every row an ETA, picks the winds
  forecast the legs are flown on, and sets the fuel reserve (30
  minutes by day, 45 at night) the fuel check holds the tanks against.
  Printed, the log is a landscape page with blank ATA and
  fuel-remaining columns to fill in in flight. Opened wide
  (`?view=briefing`, or the sidebar toggle), the same drawer is the
  FAA-sequence briefing: the nav log with the briefing's sections
  under it, the written briefing (one streamed Claude call from the
  planner) and Print in its header, the map still beside it. The
  pilot console drops down over the map from the header: sign-in, the
  pilot's own aeroplanes (the nav log flies the one picked), filed
  flights and the theme.
- `/app/dev` — the developer's page: walk a route's detected waypoints
  on the sectional and rate each one, producing ML training data, with
  the dev console dropping down over the chart in tabs — Model
  Training (collect a corridor, ratings so far, retrain: the training
  run as a container the planner starts), Performance (every algorithm trained, the promoted one)
  and System (which services answer, how fresh the FAA and weather
  data is, the door into Jupyter — each a
  link that starts the container if it isn't running). `/app/label`
  redirects here (its own query string carried over); `/app/settings`
  redirects to Plan, where everything it used to hold now lives in the
  pilot console.

Both pages are one `MapPage` component (`features/shell/MapPage.tsx`)
around a different `WorkspacePieces` (`features/shell/workspace.ts`):
the workspace owns its own data and hands back a map, a sidebar, a
console and a submit action; the page owns the shell around them — the
header, the sidebar panel, the console sheet — so the two pages cannot
drift in where a control sits or how a drawer opens, only in what they
hold.

The pages hold no aviation rules. Every course, checkpoint, detection
and nav log comes from `planner`, and every rule the page
needs on its own -- a runway's wind, the Go / No-Go, a hold's entry, a
weather limit -- is asked of the Rust engine by name, built to
WebAssembly (`lib/engine`, `callEngine`); this front end gets the data,
keeps the state, draws it and sends back writes (ratings, picks,
corridor builds, filed flights, checkpoint notes). A rule found in a
component, a hook or a `lib` file is a bug to move into the engine;
the ones still here are listed in issue #482.

## Contents

- [Running it](#running-it)
- [Where it sits](#where-it-sits)
- [Project layout](#project-layout)
- [Architecture](#architecture)
- [Maps](#maps)
- [What is deliberately not here](#what-is-deliberately-not-here)

## Running it

No native Node toolchain is used. Everything runs in `node:26-slim`, the
image `services/gateway/Dockerfile` builds the bundle with.

```bash
# from the repo root
docker compose up -d --build --wait gateway   # full stack; returns once the pages answer (gateway's healthcheck)

# typecheck, lint and unit tests
docker run --rm -v "$PWD/apps/web":/w -w /w node:26-slim \
  sh -c "npm ci && npm run types && npx tsc -b && npx eslint . && npx vitest run"

# real-browser layout tests, against the running stack
docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD/apps/web":/w -w /w \
  -e BASE_URL=http://host.docker.internal:8080 -e MAILPIT_URL=http://host.docker.internal:8025 \
  mcr.microsoft.com/playwright:v1.65.0-noble sh -c "npm ci && npx playwright test"
```

The suite signs in first, as the stack's own developer
(`developer@example.com`): its "setup" project asks for an emailed link
the way a person does and reads it from the local inbox
(`e2e/emailSignIn.ts`), and every test then runs with that session
unless it opens a signed-out one itself. With the stack open to the
phone (`PUBLISH_ADDRESS` in `.env`) the inbox has a password; pass it as
`-e MAILPIT_UI_AUTH=<user:password>`, the value in `.env`.

CI runs the same suite on every push and pull request (the `e2e` job in
`.github/workflows/ci.yml`): the gateway and the planner built from the
commit, under `infra/docker-compose.ci.yml`, with the
planner's reference data kept in the Actions cache between runs. It runs the tests
in the same Playwright image as above, split over six runners. Failures
show on the commit's checks, with traces and screenshots as a run
artifact, and each shard's notice lists its slowest tests.

### The loop: a change, a test, in seconds

The gateway serves the bundle from a plain directory, read per request
(`APP_STATIC_LOCATION`, see `WebMvcConfig`), so for front-end work the
image need not be rebuilt at all. `WEB_DIST_MOUNT=/app/static/app`
mounts `apps/web/dist` over that directory, and the `web-dev` profile's
`web-build` runs vite in watch mode into it: a saved file is rebuilt in
a second or two and served at once, with no restart. Each build is
written whole into `apps/web/.dist-next` and only then renamed into
`dist`, index.html last (`VITE_PUBLISH_DIR`, `vite.config.ts`), so a page
loading mid-build gets the old build or the new one, never half of one;
the replaced builds' chunks stay an hour for pages already open. Both can live in
`.env` (`COMPOSE_PROFILES=web-dev` for the profile), as on the owner's
Mac; for once:

```bash
# once: the gateway serving apps/web/dist, and vite keeping it built
WEB_DIST_MOUNT=/app/static/app docker compose --profile web-dev up -d --no-deps gateway web-build
docker compose logs -f web-build     # each rebuild, as it happens

# each change: the spec you touched while iterating (a single test with -g;
# the phone project alone with --project=mobile; the ten-test smoke subset
# with -g @smoke, about a minute)
docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD/apps/web":/w -w /w \
  -e BASE_URL=http://host.docker.internal:8080 -e MAILPIT_URL=http://host.docker.internal:8025 \
  mcr.microsoft.com/playwright:v1.65.0-noble npx playwright test e2e/checkpoints.spec.ts -g "nav log"

# the checks, with their caches: seconds after the first run
docker run --rm -v "$PWD/apps/web":/w -w /w node:26-slim \
  sh -c "npx tsc --noEmit && npx eslint --cache --cache-location node_modules/.cache/eslint/ . && npx vitest run"

# before a push: the whole suite (about four and a half minutes)
```

`npm run types` first when an API schema changed. A `docker compose up
--build` of the gateway (without the override) is still what ships, and
CI builds its own. The planner does not reload its mounted source: a
change there is `docker compose restart planner` and a wait
for `"warm":true` on :8084.

`vite build` writes into `apps/web/dist` (`vite.config.ts`). The Docker image
builds the bundle in its own stage and serves it from a directory beside
the jar (`APP_STATIC_LOCATION`, see `WebMvcConfig`), and the web-dev
overlay mounts `apps/web/dist` in the same place, so the page and its API
still come from one origin and a front-end change rebuilds only that
stage. A gateway run outside Docker serves it with
`APP_STATIC_LOCATION=file:../../apps/web/dist/` (from services/gateway). There is no separate front-end container; `docker compose up
--build gateway` rebuilds the bundle.

The Playwright image tag must match `@playwright/test`'s version in
`package.json`. The e2e suite (`e2e/*.spec.ts`) runs every test at a
desktop and a phone viewport and checks what a DOM-only test cannot:
nothing overflows the page, the header controls sit where they should,
a popup on the map is dismissed the same way on every marker, a toast
survives a drawer opening under it.

`npm run dev` (Vite on port 5173) proxies `/api` to `localhost:8080`.
Inside a container that resolves to the container itself, so point the
proxy at `host.docker.internal:8080` or use the build path above.

## Where it sits

```
apps/web/ (this folder)      the map, the header, the drawers
  ↳ lib/engine          the Rust engine as WebAssembly: every rule, asked by name, in the page
  → gateway              :8080  serves the bundle, proxies /api/planner/*, owns auth and the pilot's records
  → planner    :8084  chart tiles, the FAA overlays as PMTiles, great-circle course, checkpoints (scored by the chart model), the nav log, weather
```

The front end never calls `planner`
directly. Every request goes through `gateway` at `/api/planner/*` (a
middleware rewrites `/api/x` to that path, so call sites read as if
they spoke to the planner directly), so there is one origin, one
session and one set of access rules -- the written briefing included
(`/api/planner/briefing/narrative`, streamed as Claude writes it).

## Project layout

```
e2e/*.spec.ts             Real-browser tests (Playwright): layout, toasts, Class B
src/
  main.tsx                Entry point: route table (basename /app), the course prefetched before React mounts
  index.css                The theme's tokens, Sunlight's high-contrast rules, print rules
  components/              Shared UI, one level above any single page
    IconButton.tsx           Every icon-only button: a stock shadcn Button + Tooltip + accessible name, one size
    MapHeader.tsx, RouteForm.tsx, RouteInputGroup.tsx, AirportPicker.tsx   The route form both pages share
    MapControls.tsx          The map's own corner stack: the layers popover, the zoom toggle, full screen
    ChartLayers.tsx           The layers popover's contents: base chart, TAC pin, Class B, marker zoom
    ConsoleTabs.tsx, DevSwitch.tsx, ThemeToggle.tsx, FullscreenButton.tsx, KeepRoute.tsx, SelectableRows.tsx
    map/                     The map's own screen: GlMapShell (the map with its banners, controls and sheet),
                               cards/ (airspace, navaid, waypoint) and the layers that open them (layers/)
    SignInModal.tsx, ChecklistPage.tsx, ReviewAsk.tsx, ClearanceCard.tsx, WordsSection.tsx, SourceChips.tsx
                             Screens two features show (the pilot's console and the plan's Brief, the radio)
    ui/                      shadcn/ui primitives (components.json), stock unless a comment says why not
  hooks/                   Hooks with no feature of their own (viewport, shortcuts, the plan's history)
  lib/                     Only what two or more features (or components/ and a feature) use
    api/client.ts             Every network call, one function per endpoint
    api/types.ts               API request/response shapes, re-exported from schema.d.ts and gateway-schema.d.ts
    engine/                    The Rust engine as WebAssembly: callEngine, and contract.ts generated from its schema
    fixtures/                  The cases the web, the engine and the phones are all tested against
    format/                    How a figure is written: format/figures, format/time
    map/                       Everything the planner's map and the chart-labels map share (see Maps, below):
      gl/                        the MapLibre map: its style, overlays and hooks (the shell is components/map)
      gl/layers/                 the layers both maps draw (base, chart, route, ruler, own ship)
      cards/                     what a point's card on the map is made of: MapCard, its place, its actions
      marks/                     what is drawn: airport and airspace marks, procedure and pattern marks, icons, colours
      sources/                   where the drawing comes from: tiles, overlay tiles, imagery, weather layers
      position/                  own ship, its trail and track, the glide ring, alerts ahead
      route/                     the route kept on the map, its ways, a lesson's map
      ruler/                     the ruler and where it was placed
      view.ts, clear.ts, useCruiseTas.ts
    atc/, copilot/             The radio and copilot pieces the ATC, copilot and map features share
    ask/useAsk.ts              The assistant's conversation (the Brief's Ask card, the radio's Ask chip)
    mapChrome.ts, emergencyStore.ts, briefPlan.ts, wordsState.ts, pointFilters.ts   State and styling the layers above share
    glyphs/                    The app's own drawn glyphs (the tab bar's, Direct To) that lib/icons names
    preferences.ts             What's remembered per browser (zustand + localStorage): charts, aeroplane, filters
    queryClient.ts             The react-query client; a failed query becomes one toast, keyed by its message
    problems.ts, text.ts, tokens.ts, geo.ts, storage.ts, …   The rest every feature leans on
  features/                One folder per feature; a file used by one feature lives in it, not in lib/;
                           another feature or a shared component reaches it only through its index.ts
    shell/MapPage.tsx, workspace.ts  The shell both pages mount into, and the contract a workspace hands it;
                                      the page's start (dynamicType, freshLoad, storageRename) that main.tsx runs
    plan/PlanWorkspace.tsx           The pilot's workspace: hooks/usePlan.ts (state), components/: RouteMap,
                                      BuildNotice, AltitudeReasoning, navlog/, briefing/, procedures/
    plan/lib/                        The plan's own rules and readings: pattern, wind, radio, routeHolds,
                                      runwayCheck, passTimes, hourly, glance, oral, flightPlanForm, …
    plan/map/                        The planner's own map: GlRouteMap, layers/ only it draws (traffic, TFRs,
                                      weather, tracks, marks), terrain/ (the 3D view), its traffic and TFR cards
    chart-labels/TrainWorkspace.tsx  The developer's workspace: hooks/useTraining.ts (state), logic.ts (pure,
                                      tested), components/: ChartMap, WaypointPanel, PointPopup, FilterBar
    pilot/PilotPanel.tsx             The pilot console: AccountPanels.tsx (sign-in, aircraft, flights),
                                      and its own logic: logbookCsv, drills, lostComms, paperwork, students, debrief
    emergency/                       The emergency assistant, emergency.ts its reading of the engine's answers
    chart-labels/dev/DevPanel.tsx    The dev console (its own chunk — see Architecture), drawn in the pilot console's
                                      PilotPanel, which the training workspace loads beside it (pilot's loadPilotPanel)
```

A file goes in `lib/` only when two or more features use it; one feature's
file sits in that feature's folder (`features/<feature>/lib/` for its rules,
beside the screen when one screen alone uses it), and one shared component's
helper sits beside it in `components/`. A feature does not reach into
another feature's files; what two need moves to `lib/` (or `components/`
for a screen), and what a feature offers the rest is its `index.ts`, with a
loader (`loadPilotPanel = () => import("./PilotPanel")`) for a part on a
chunk of its own, so naming the entry never pulls the chunk into a first
load.

dependency-cruiser holds the layers (`.dependency-cruiser.cjs`, `npm run
layers`): `lib/` and `hooks/` import neither `components/` nor
`features/`; `components/` import a feature only through its `index.ts`;
a feature imports another only through its `index.ts`; `main.tsx`, which
wires them, may name any. Every way a module is named counts: `import`,
`export ... from`, `import()`, a type-only import.

## Architecture

**Routing.** `main.tsx` builds a `react-router` browser router with
one lazy-loaded route per page and `basename: "/app"`. Deep links and a
hard refresh work because `gateway`'s `WebMvcConfig` serves `index.html`
for any `/app/**` path that is not a real file.

**Code-splitting.** The developer's console (`DevPanel`, recharts and
the model tables) and the whole training workspace (`TrainWorkspace`)
are `React.lazy`, so a pilot loading `/app/plan` never pays for either
— importing `DevButton` used to pull the console in by accident, since
it lived in the same module `DevPanel` did. The nav log's calendar
popover (`react-day-picker`, one component behind one button) is lazy
the same way. The div-icon marks (`lib/map/marks/icons.ts`: traffic, own
ship, the replay's airplane, put on the map as MapLibre markers by
`lib/map/gl/htmlMarker.ts`) are built from template strings rather than JSX rendered with
`renderToStaticMarkup`, which otherwise pulled the whole of
`react-dom/server` into every page's chunk for four spans. Together
these took the planner's cold-load JavaScript from 1.67 MB to 1.00 MB.

**Cold load.** `main.tsx` asks the planner for the course named in the
address (`prefetchQuery`, the same query key and fetcher `usePlan`
uses) _before_ `ReactDOM.createRoot(...).render(...)` runs — React
mounting, the router resolving and the workspace rendering all used to
happen first, with the request queued behind them for a route the URL
had already named. The component then finds the answer already in
`react-query`'s cache instead of asking again.

**The engine.** `lib/engine/engine.ts` loads the engine
(`wingtip-engine.wasm`, built by `scripts/build/build-engine-wasm.sh` and
committed, since this build has no Rust) and `callEngine(name, input)`
asks it a rule, JSON in and out. The names and the shapes of their
inputs and answers come from the engine's contract
(`engine/contract/engine.schema.json`), generated into
`lib/engine/contract.ts` by `npm run types`, so `callEngine` is typed by
name and a field renamed in the Rust is a compile error here. How a
figure is written on the screen stays here; the figure is the engine's.
Adding a rule is engine/README.md's list.

**State.** A screen is a view and a view model: Plan and Train each
have one hook (`usePlan`, `useTraining`) holding the page's state as a
plain object alongside its actions, and the components draw it.
`react-query` owns server data everywhere (cached, with its own
retry/error handling); `zustand` (`lib/preferences.ts`) owns what's
remembered per browser; there is no other global store.

**API.** `lib/api/client.ts` is built on `openapi-fetch`, typed end to
end from each server's own OpenAPI document: `planner`'s
(`schema.d.ts`) and the Spring Boot app's (`gateway-schema.d.ts`, from
`services/gateway/openapi.json`), both generated by `npm run types`, which
the `pre*` scripts run before build, test, typecheck and lint. A field
renamed in `services/planner/app/schemas.py` or in a Java DTO is a
compile error here, not a silent `undefined`; both committed documents
are checked against the running code by their own service's tests.
`navlog()`, `detect()` and the checkpoint-notes stream read
newline-delimited JSON one line at a time. The CSRF header and the
`ApiError` for a failed response are one middleware both clients use;
the only plain `fetch`es are Spring Security's own `/logout` and the
narrative stream the gateway passes on from the planner untouched, and
they call the same two helpers.

**Messages.** Every info, warning and error is a sonner toast, centred
and full-width (`main.tsx`'s `Toaster` props), at most three stacked at
once. A failed query becomes one toast keyed by its own message
(`queryClient.ts`) rather than by the query's hash — three queries
failing the same way used to stack three identical toasts. Its own
"Try again" refetches every query currently in error, not just the one
that happened to toast last. Toasts have `pointer-events: none` on
their container with `auto` restored on the toast itself
(`index.css`), so the map keeps taking wheel/drag events with one on
screen, and a press inside the toaster is not "outside" a dialog or a
sheet (`components/ui/dismiss.ts`), so closing a toast never closes the
sheet under it.

**Styling.** Tailwind utilities and stock shadcn components. The only
inline styles are colours computed from data (a rating, a flight
category, a score) and CSS custom properties. What the map draws in
WebGL is styled in its layers' MapLibre paint properties
(`lib/map/gl/glStyle.ts`, `glOverlays.ts`), not in CSS.

## Maps

Both maps are MapLibre GL on one shell (`components/map/GlMapShell.tsx`, over `lib/map/gl`): the planner's
(`GlRouteMap.tsx`, which `RouteMap.tsx` gives the page's state) and the
training map (`ChartMap.tsx`). The FAA chart, the airspace, the route
and its checkpoints are drawn in one WebGL map, so an overlay moves with
the chart under a pinch rather than being scaled and drawn again at
its end.

**The shell and its layers.** `GlMapShell.tsx` owns the map itself: the
container, the camera and what moves it (a route's fit, a point picked,
the sheet), the one tap the layers share, and the card a tap opens.
Everything drawn on it is a React component in `lib/map/gl/layers` (`ChartGl`,
`AirportsGl`, `RouteGl`, `OwnShipGl`, `TrafficGl` ...; `AirspaceGl` and
`NavaidsGl`, which open the shared cards, in `components/map/layers`)
that says through `glLayer.ts`'s hooks what it adds -- its sources and
style layers, in one of the map's slots (base, chart, imagery, areas,
lines, route, marks, top), the data it gives them, and what a tap on it
does. The slots keep the order bottom to top however the layers come
and go. `glStyle.ts` is the style as plain data (the chart's raster
sources, the airspace's lines, the zooms), which the tests read without
a map. MapLibre's zoom is a level lower than the app's levels (its
world is 512 px across at zoom 0): every zoom the app names goes
through `glZoom`.

**The FAA overlays as vector tiles.** The cycle's Class B, C and D, the
special-use areas, airports, navaids, fixes and runways come from one
PMTiles archive the planner builds once a cycle
(`wingtip.vector_tiles`) and serves in byte ranges
(`/api/overlay-tiles/{name}.pmtiles`), read by protomaps' `pmtiles`
library (`lib/map/sources/overlayTiles.ts`). They are in the map's first style
(`glOverlays.ts`), so they load per tile with the chart, with nothing
asked of the planner for the view and no wait on the engine; what
changes over them (the fields the settings hide, the route's own
fields, each field's weather, from `/api/airports/in-view`'s reporting
fields) is set on their layers. They are the only source of those
marks: a map made before the archive's name came (or before the
planner built it) draws none, and has them added once it comes
(`addOverlays`). The browser suite's stack has a small archive of its
own round its corridor (`apps/web/e2e/fixtures/overlay-tiles`, see
docs/CI.md).

**Loading.** The map is drawn before the engine has loaded: `GlBootMap`
holds the chart and the overlays alone, which ask the engine nothing,
and the planner's map takes the same map up when the engine is there
(GlMapShell's park), with no taps, cards or buttons until then. It
opens at the pilot's last position, in the middle of what the sheet
leaves, and fades in once the chart's and the overlays' first tiles are
in, at the latest after 2.5 s. Until then `components/MapLoading.tsx`,
the app's mark turning (still under reduced motion), sits in the same
place.

**A tap goes to the nearest thing.** The map has one tap: the layers'
taps are asked in their rank order (a mark before a line under it),
each within its own reach of the finger (22 px each side, a 44 pt
target), and the first that finds a feature has it. Every mark --
checkpoint, airport, Class B field, training point -- answers the same
way: select it, fly the map to it, open its card. A tap on the chart
itself, nothing within reach, puts the card away.

**One card.** Every card a tap opens is a `MapCard` (a title, an
optional subtitle, the thing's own mark, and its children), shown in
the map's panel as a `SheetCard`, as Maps opens a place's card in its
one sheet: the panel's close is every card's, and there is no other
surface over the chart.

**Marks that move.** Traffic, own ship and the replay's airplane are
the app's own div icons (`lib/map/marks/icons.ts`) put on the map as MapLibre
markers (`gl/htmlMarker.ts`), which MapLibre places in the frame it
draws the chart, so they stay on their point through a pinch.

**Zoom and the view.** `useGlView` gives the layers the view's box and
whole level, also during a pinch or a pan, changing only when the level
changes or the view leaves the box already asked for, so a gesture
costs a render at each level, not each frame; a layer drawn only once
zoomed in (a route's checkpoints, the training map's detections) reads
the level from it.

**Fitting** happens once per route (`GlMapShell`, keyed on the route's
idents, not on the course object, which `react-query` may answer again
as a new object), clear of the panel and the map's buttons; `useGlFit`
does the same for Nearest's fields, the Stops, a procedure or a pattern
picked. The map follows the sheet: MapLibre's padding is what the panel
covers, eased in the sheet's own time, so what was in the middle of the
room left stays there.

**The first flight.** The first time the planner opens with no route on
a device, `FirstFlight` (its view model `hooks/useFirstFlight.ts`) is a
card over the map: a destination from the same airport search the
route's box uses (`useAirportSearch`, through `PanelCapsule`'s field and
results), and Plan it, which plans from own ship's nearest field, else
the last departure or Home, else asks where from. Planned, the nav log
opens, and the card is marked seen in the seen-once store
(`lib/firstRunTips`, `FIRST_FLIGHT`) and never comes back.

**Sunlight.** The map's settings' Sunlight (Auto, On, Off;
`preferences.chartLight`) is a high-contrast scheme for a screen in a
sunlit cockpit: `lib/sunlight` keeps `data-chart-light="bright"` on
`<html>`, under which `index.css` draws the chart's tiles at more
contrast, the course wider and black-cased, and every sheet, button and
the figure strip solid white with black figures. Auto reads the
ambient light sensor where the browser has one (on past 10,000 lux, off
under 4,000), and the first time it switches on by itself
`SunlightBanner` says so with a one-tap Keep off. The airspace rings
draw on a canvas at their own width and are not reached by the
stylesheet.

## What is deliberately not here

- No global state library beyond `zustand`'s one small preferences
  store. `react-query` owns server state; the two workspace hooks own
  the rest.
- No CSS beyond Tailwind and no CSS-in-JS. `components/ui/` is
  shadcn/ui copied into the repo, so it is Tailwind classes underneath.
- No React wrapper for MapLibre (react-map-gl or the like): the map is
  `GlMapShell`'s own, and each layer a component through `glLayer.ts`'s
  hooks. No `React.memo` reached for before a measured render cost
  justified it; the React Compiler memoizes the rest.
