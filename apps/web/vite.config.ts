import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { IN_FLIGHT_READS, OVERLAY_ARCHIVE, RADAR_FRAMES, markFromCache } from "./vite-plugins/workboxRules";
import { preloadEngine } from "./vite-plugins/preloadEngine.ts";
import { MANIFEST, themeColor } from "./vite-plugins/manifest.ts";
import { CHUNK_SIZE_LIMIT, strictRolldown, warningsFail } from "./vite-plugins/strictBuild.ts";
import { STAGING, publish, publishDir } from "./vite-plugins/publishBuild.ts";

// The page reader's files (features/airplane/lib/readPage), from node_modules into the
// build's tesseract/ under their own names, where tesseract.js asks for
// them: its worker, its engine for each kind of WebAssembly a browser has
// (it picks one), and its English (the integer "best" model, 2.9 MB).
const require = createRequire(import.meta.url);
const TESSERACT_FILES: [string, string][] = [
  ["worker.min.js", "tesseract.js/dist/worker.min.js"],
  ...["lstm", "simd-lstm", "relaxedsimd-lstm"].map(
    (k) => [`tesseract-core-${k}.wasm.js`, `tesseract.js-core/tesseract-core-${k}.wasm.js`] as [string, string],
  ),
  ["eng.traineddata.gz", "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"],
];
const tesseractFiles: Plugin = {
  name: "tesseract-files",
  apply: "build",
  generateBundle() {
    for (const [name, from] of TESSERACT_FILES) {
      this.emitFile({ type: "asset", fileName: `tesseract/${name}`, source: readFileSync(require.resolve(from)) });
    }
  },
};

// Built into Spring Boot's static resources, which is what makes it the
// only public surface: the bundle and the API it calls arrive from one
// origin, so there is one session, one set of access rules, and no second
// front door on another port.
export default defineConfig({
  plugins: [
    warningsFail,
    publish,
    tesseractFiles,
    preloadEngine,
    themeColor,
    react(),
    // The React Compiler, memoising each component and hook as it builds
    // them, at the owner's pick of the audit's recommendation: only its
    // lint rule had been installed, and every nav-log stream message
    // drew the whole panel again (MapPanel, TabBar, the route box).
    // Not the stock shadcn wrappers (components/ui), which hand their
    // props to Radix and gain nothing from a memo: 25.6 KB of the first
    // load, measured per file with and without it (the 20 Oct audit).
    // node_modules named again: an exclude replaces the plugin's default,
    // and without it the compiler ran over react-dom and MapLibre too.
    babel({ exclude: [/[/\\]node_modules[/\\]/, /\/components\/ui\//], presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // The app in the air: a service worker (Workbox, generated at
    // build) that keeps the app shell, every chart tile the map has
    // drawn or `KeepRoute` fetched ahead, and the planner's own
    // answers (course, checkpoints, nav log, briefing) as they are
    // fetched -- so a route opened on the ground opens again with no
    // connection at all. Served from /app/sw.js by the gateway (its /app/**
    // handler serves a real file as itself), scoped to /app/. Installs
    // only on a secure origin: https, or localhost.
    VitePWA({
      // "prompt", the plugin's default: a new build's worker waits, as
      // the browser's own would, and the page takes it only while it is
      // away, with no question asked (features/shell/newBuild). The
      // owner wants the latest build without a prompt; "autoUpdate"
      // gave it, but by reloading under whoever was using the page.
      registerType: "prompt",
      manifest: MANIFEST,
      workbox: {
        // The first worker claims its page: an uncontrolled page's keep for
        // the air cached nothing. A new build still waits (no skipWaiting).
        clientsClaim: true,
        navigateFallback: "/app/index.html",
        navigateFallbackAllowlist: [/^\/app\//],
        // The legal pages are files, not routes of the app: a miss in
        // the precache (the first load after a deploy) must reach the
        // server, not fall back to the app shell.
        navigateFallbackDenylist: [/\/(privacy|terms|support)\.html$/],
        // wasm: the shared engine (lib/engine), which the page waits for
        // before it draws, so it must be there with no network.
        // mjs: MapLibre's worker (lib/map/gl/worker), without which the map
        // parses no source, so a route reopened with no connection has a map.
        globPatterns: ["**/*.{js,mjs,css,html,svg,woff2,wasm}"],
        // Not kept ahead for every pilot, at the first load and after each
        // deploy: Inter's non-Latin subsets (170 KB), fetched by the browser
        // only for a glyph they hold, the developer's pages (77 KB), and the
        // page reader's 15 MB (tesseract/), kept by tesseract.js itself,
        // and the Studio's speech to words (its worker and ONNX Runtime's
        // 27 MB, features/replay/captions). Asked for when needed.
        globIgnores: [
          "**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2",
          "**/{DevPanel,TrainWorkspace}-*.js",
          "tesseract/**",
          "**/{ort-wasm-*,transcribe.worker-*}",
        ],
        runtimeCaching: [
          {
            // Google's map tiles and its map services (OverlayTiles):
            // never kept, as Google's Map Tiles API terms ask (no
            // prefetching or storing); the browser's own cache follows
            // their Cache-Control.
            urlPattern: ({ url }) => url.hostname === "tile.googleapis.com",
            handler: "NetworkOnly",
          },
          {
            // The chart tiles, served by the planner (…/chart-tile/…) or
            // from the CDN (…/tiles/<cycle>/…): cache first, they are
            // the same for the whole 56-day cycle, and a miss offline
            // is simply a blank tile.
            urlPattern: ({ url }) => url.pathname.includes("/chart-tile/") || url.pathname.includes("/tiles/"),
            handler: "CacheFirst",
            options: {
              cacheName: "chart-tiles",
              expiration: { maxEntries: 20000, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The airport diagrams' pictures, cache first as the tiles
            // are: an address names its 28-day d-TPP cycle, so what is
            // kept is right for the whole of it, and a card opened again
            // in the air, with no network, still shows its field's.
            // The FAA's other charts' pages and their lists too, the
            // edition in each address (/faa-chart).
            urlPattern: ({ url }) => url.pathname.includes("/airport-diagram/") || url.pathname.includes("/faa-chart"),
            handler: "CacheFirst",
            options: {
              cacheName: "airport-diagrams",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // A field's aerial and its photo from the ground (the airport
            // card's pictures, the planner's /airport-aerial, /airport-photo):
            // years apart, from the cache first, kept for a route's stops in
            // the air (keepRoute's routeStopsKept).
            urlPattern: ({ url }) => url.pathname.includes("/airport-aerial/") || url.pathname.includes("/airport-photo/"),
            handler: "CacheFirst",
            options: {
              cacheName: "airport-pictures",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // The map's overlay archive and the radar's pictures, kept for the
          // air (vite-plugins/workboxRules).
          OVERLAY_ARCHIVE,
          RADAR_FRAMES,
          {
            // What a field offers on the ground and its pictures' list: the network when there is one, the last answer
            // when there is not, in a cache of their own so a route's forty
            // fields do not push the plans out of planner-api's 300.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && /^\/api\/planner\/airport\/[^/]+\/(services|photos)$/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "airport-extras",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [markFromCache],
            },
          },
          {
            // Live traffic, never from the cache: an airplane is aged
            // from when the page got it, so one kept from a minute ago
            // would be drawn where it no longer is, as if live. With no
            // network the layer fails and the page says so. A flight's
            // past track (/history) is the planner-api cache's below.
            urlPattern: ({ url }) => /^\/api\/planner\/traffic\b/.test(url.pathname) && !/\/history\b/.test(url.pathname),
            handler: "NetworkOnly",
          },
          {
            // What is true only now -- the briefing, the Class B fields'
            // weather, the TFRs, the airspace and alternates ahead -- from
            // the network when it answers, and the last answer when it
            // does not, at the owner's ask (2026-11-04) that a moment
            // without signal still leaves the pilot what they had. These
            // were never kept: a METAR or a TFR list shown as current
            // when it was old was worse than none, since nothing on the
            // page could say it was old. Now something does: every answer
            // from here is marked (markFromCache) and the page says, in
            // one line on the map, that it is showing what was saved and
            // how long ago (lib/fromCache) -- warn, never limit.
            //
            // Six seconds for the network: the planner answers these from
            // weather it already holds, in a second or two even on a weak
            // cell link, and a phone that has lost signal often does not
            // fail a request at all but leaves it hanging, so the page
            // waited out the old fifteen seconds with nothing to show. A
            // network answer that comes after the six still lands in the
            // cache for the next ask. Kept a day at most: a TAF is issued
            // every six hours and a METAR every hour, so a day-old
            // briefing has been replaced several times over -- an old
            // answer is worth having for a dropped minute, not as a
            // briefing (the flight still wants the current one, 14 CFR
            // 91.103). Their own cache, so a route's worth of them does
            // not push the plans out of planner-api's 300.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && /^\/api\/planner\/(briefing|class-b|tfrs|airspace\/ahead|alternate)\b/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "planner-now",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [markFromCache],
            },
          },
          {
            // The pilot's own, from the gateway rather than the planner --
            // who is signed in, their airplanes, their saved flights, and
            // what signing in offers -- the network first and the last
            // answer when there is none, so a start with no signal still
            // knows the pilot and their plans. Marked as the planner's
            // are. Signing out empties this cache (useLogout): it is one
            // pilot's, on a phone another may pick up.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && /^\/api\/(me|flights|aircraft|auth\/capabilities)(\/|$)/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "pilot-own",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              plugins: [markFromCache],
            },
          },
          {
            // The airport search as it is typed, never through the cache:
            // an answer kept for every letter typed was a cache write and
            // its expiry's bookkeeping in the worker before the answer
            // reached the page -- the suggestions lagged the typing on a
            // phone -- and pushed the plans this cache keeps for the air
            // out of its 300.
            urlPattern: ({ url }) => url.pathname === "/api/planner/airports/search",
            handler: "NetworkOnly",
          },
          {
            // The phone's own copy of the airport search (lib/airportIndex),
            // from the cache at once and asked again behind it: the search
            // answers from the first letter after a start, and with no
            // network at all. Its own cache, one entry, kept a week.
            urlPattern: ({ url }) => url.pathname === "/api/planner/airports/index",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "airport-index",
              expiration: { maxEntries: 1, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // What does not change with the weather or the hour -- a
            // route's course and checkpoints (the chart's, kept for its
            // cycle), the VFR waypoints in view, the airplanes' book
            // figures, the chart's edition -- from the cache at once and
            // asked again behind it, at the pilot's ask for a fast app:
            // a route opened again draws before the network answers.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              /^\/api\/planner\/(course|checkpoints|waypoints\/in-view|aircraft-profiles|chart)$/.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "planner-steady",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // In flight, a shorter wait on the network (vite-plugins/workboxRules).
          IN_FLIGHT_READS,
          {
            // The planner's answers: the network when there is one
            // (the winds change), the last answer when there is not --
            // marked, as planner-now's are, so the page says it is old.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && url.pathname.startsWith("/api/planner/") && !url.pathname.includes("/chart-tile/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "planner-api",
              networkTimeoutSeconds: 15,
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [markFromCache],
            },
          },
        ],
      },
    }),
  ],
  base: "/app/",
  // Mirrors tsconfig.json's own "@/*" path -- shadcn's generated
  // components import from "@/components/ui" etc., and Vite needs this
  // independently of TypeScript's own (type-check-only) path mapping.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    // apps/web/dist, where the gateway's image copies it from and the web-dev
    // setup (WEB_DIST_MOUNT) serves it. It was services/gateway's resources, which nothing
    // has served since the image built its own: a build in a container
    // that mounted the whole repo left a stale copy there for every grep.
    // Into STAGING under docker-compose.yml's web-build watch, moved into
    // the served directory from there whole (vite-plugins/publishBuild).
    outDir: publishDir ? STAGING : "dist",
    emptyOutDir: true,
    // A warning fails the build (vite-plugins/strictBuild.ts).
    chunkSizeWarningLimit: CHUNK_SIZE_LIMIT,
    // The libraries in chunks of their own, so that a change to this
    // app's code (most deploys) leaves React, the map and the query
    // client with the same hashed names -- and so still in the
    // browser's cache, where WebMvcConfig lets hashed assets live for
    // a year.
    rolldownOptions: {
      ...strictRolldown,
      output: {
        // Rolldown's groups, which replaced its deprecated manualChunks:
        // each named chunk takes the modules its test matches.
        codeSplitting: {
          groups: [
            // The map's engine (lib/map/gl), with the map's own chunk (routeMapChunk).
            { name: "maplibre", test: /node_modules\/maplibre-gl\// },
            // TanStack's query client alone: its table (the nav log's and the
            // kneeboard's, both lazy) stays with them, out of the first load.
            { name: "react", test: /node_modules\/(react|react-dom|react-router|@tanstack\/(react-query|query-core)|scheduler)\// },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    // The API is not in this process. Proxying in dev means the same
    // relative URLs work in both, so nothing has to know where it runs.
    proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } },
  },
  // e2e/ is Playwright's own suite (`npm run test:e2e`), a real browser
  // against the actually-running app -- vitest's default globs would
  // otherwise also pick up its *.spec.ts files and fail them here for
  // the wrong reason (no @playwright/test import resolves under vitest).
  //
  // The shared engine's WebAssembly is loaded before every test file
  // (lib/engine/vitestSetup.ts), as main.tsx loads it before the first
  // render, so a rule that asks the engine answers in a test too. Then
  // the guards against flaky tests (src/test/guards.ts).
  //
  // Files and the tests in them run in a new random order every run, so
  // a test that only passes after another one fails here rather than one
  // day in CI (docs/CI.md, "Flaky tests"). The order comes from the seed
  // vitest prints at the start ("Running tests with seed"): npx vitest run
  // --sequence.seed=<it> repeats it. A
  // test that must keep its order says so with describe(name, { shuffle:
  // false }, ...) and is listed to be fixed.
  //
  // An error nobody awaited, or a timer firing after its test's
  // environment is gone, fails the run (dangerouslyIgnoreUnhandledErrors,
  // false is vitest's default, said here so nobody turns it on to get a
  // green run).
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "e2e/**"],
    setupFiles: ["src/test/storage.ts", "src/test/animations.ts", "src/lib/engine/vitestSetup.ts", "src/test/guards.ts"],
    sequence: { shuffle: true },
    dangerouslyIgnoreUnhandledErrors: false,
  },
});
