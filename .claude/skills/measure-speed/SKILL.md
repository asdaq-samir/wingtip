---
name: measure-speed
description: Find and prove speed problems in the planner the way they show up on a phone. Covers bundle size, time from a tap to the route, render cost and the planner's own latency, measured before and after under CPU throttling. Use when something feels slow, before any optimisation, before adding an import to the map page, and to back a speed claim in a commit message.
---

# Measure speed

Profile before guessing. Every speed claim needs a before number, an after number and the method behind both.

## Method
- **Measure the production build,** not vite's dev server. The web-dev setup (`WEB_DIST_MOUNT`, docker-compose.yml) serves `apps/web/dist`, which `web-build` keeps current.
- **Throttle the CPU to look like a phone:** CDP `Emulation.setCPUThrottlingRate` at 4 for interactions, 6 for a cold load. The factors were chosen on the 2016 i7 MacBook; the dev Mac has been an Apple-silicon Mac mini since 2026-11-05, with Docker given 12 CPUs; Chromium there has no GPU, so frame gaps and "(program)" include software compositing, and at 4x it may be faster than an iPhone. The factors have not been measured against a phone on it yet: compare runs with each other, never with a phone, until they are.
- **Take the median of five or six runs.** Single samples of the same build spread by about 20%, which is enough to invent an improvement that isn't there.
- **Keep it quiet:** nothing heavy beside the measurement, such as a chart re-render, an image build or the test suite: run it through `scripts/dev/one-at-a-time.sh --alone`, which waits until no other turn is held.

## Tools
- **The trend:** the developer console's Speed page (System, then Speed) charts pilots' Core Web Vitals (75th percentile, by device) beside the nightly lab run, for 400 days (SpeedController). Look there first for when something got slower and at which commit. The lab is `e2e/speed-lab.spec.ts` (`SPEED_LAB=1`, phone project); run it the same way to compare a change locally.
- **Bundle:**
  - Build into a throwaway directory, never into the `dist` the phone is being served: `docker run --rm -v "$PWD":/repo -w /repo/apps/web node:26-slim npx vite build --outDir /tmp/out`. It prints the chunk table.
  - The first load was 1,041,552 bytes (97 chunks) on 2026-11-14 at b81400c15; CI's budget is 1,100,000 (ci.yml, first-load.mjs). Re-measure after anything that adds an import to `MapPage`, `PlanWorkspace` or what they reach.
  - To find what pulls a module in, walk the static imports (`from"./x.js"`) from `dist/index.html` and `MapPage`. For bytes per source module, decode a `--sourcemap` build's mappings (source-map-explorer fails on it).
- **A tap's time:** use a scratch Playwright spec in the Playwright image (see the `checks` skill). Throttle, tap, and time until the result is visible. Add a `longtask` PerformanceObserver for main-thread blocking, and `browser.startTracing` when a trace is needed.
- **React render cost:**
  - Temporarily alias `react-dom/client` to `react-dom/profiling` and set `minify: false` in `vite.config.ts`.
  - Wrap the suspect in `<Profiler>` and read each commit's duration.
  - Revert both changes afterwards, and restart `web-build` after any `vite.config.ts` change.
- **Lighthouse,** as the nightly runs it (`ci.yml`), in the Playwright image: pass Chrome `--disable-dev-shm-usage`. A container's /dev/shm is 64 MB, and without the flag about a third of the runs end NO_FCP (a script failed with ERR_INSUFFICIENT_RESOURCES) or TARGET_CRASHED. The runs that do finish may have lost a resource and timed less than the page. Take the median of six; `-GA=<dir>` keeps each run's trace.
- **A first load's main thread:** a Chrome trace (`browser.startTracing`), summing each task over 50 ms after `firstContentfulPaint`. A `longtask` PerformanceObserver missed a 1.1 s task that was all promise callbacks.
- **The planner:** `curl -s -o /dev/null -w '%{time_total}\n' 'http://localhost:8084/api/…'`. Run the same call warm and cold, five times each.

## Known costs, check these first
- A `:has()` on `body` or another high ancestor that names an attribute that changes makes every such change restyle the page. It cost 56 ms per Radix state change.
- Hidden tabs use `.tab-away` (`content-visibility: hidden` plus `inert`), not `hidden` or `display: none`. Those throw layout away, and charts redraw from nothing on return.
- **The map (MapLibre GL, `lib/map/gl`):**
  - `useGlData` sends a source's GeoJSON to MapLibre's worker with `setData` whenever its `data` is a new object, so build it in a memo or from the query's own answer, never fresh at each render.
  - Layers read the view through `useGlView`, which changes once per whole level or new box, never per frame of a pinch or pan. A layer that listens to the map's `move` itself renders every frame.
  - `useGlLayer` reads its sources and layers once; a style that changes goes through `useGlPaint` (`setPaintProperty`), not a new spec.
- **Objects that are new on every render** (`?? []`, a hook returning a fresh object) break memo. Use a module constant such as `NONE`.
- **A route's first draw** goes in one `flushSync`, not a transition, because GPS fixes every second restart a transition. Ask for the route's queries at the tap. Keep the page off per-fix renders (`useOwnShipNear`), and let the components that show distances read the fix themselves.
- **Layout forced in the middle of a commit:** measuring in a ref callback (use a ResizeObserver), waiting on `fonts.ready` after the fonts have loaded, a toast measuring itself, or removing the focused element.
- **`lazy()` per named export** suspends once per part even with its chunk loaded. Draw parts from the loaded module (`fromRoutePanel`).
- **recharts** measures every line at every render, so memo the chart and its data and mount it after paint.

## Report
Give the scenario, the throttle, the run count, and the median and range before and after. Name the tool, and keep the scratch spec in the scratchpad so the measurement can be repeated.
