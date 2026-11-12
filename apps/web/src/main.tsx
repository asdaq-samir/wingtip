// First: the browser's kept "vfr." keys renamed "wingtip." before any
// store below reads its own (features/shell/storageRename).
import "./features/shell/storageRename";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, redirect } from "react-router";
import { RouterProvider } from "react-router/dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { chartQuery, courseQuery, flightsQuery, overlayTilesQuery, queryClient } from "./lib/queryClient";
import { api } from "./lib/api/client";
import { flushPendingDeletes } from "./lib/pendingDeletes";
import { routeOf, stopsOf } from "./lib/identSchema";
import AppToaster from "./components/AppToaster";
import { BrandLook } from "./lib/brand";
import ErrorAlert from "./components/ErrorAlert";
import PageError from "./components/PageError";
import { registerSW } from "virtual:pwa-register";
import { followDynamicType } from "./features/shell/dynamicType";
import { keepAddressThroughReload, startFresh } from "./features/shell/freshLoad";
import { takeNewBuildsWhenAway } from "./features/shell/newBuild";
import { recoverChunk, useChunkFailure } from "./lib/chunkRecovery";
import { installErrorReports, reportOf, sendReport } from "./lib/errorReports";
import { startSpeedReports } from "./lib/speed";
import { startLongTaskReports } from "./lib/longTasks";
import { startLoadLog } from "./lib/loadLog";
import MapPage from "./features/shell/MapPage";
import { prefetchRouteMap } from "./features/plan/routeMapChunk";
import { prefetchRouteBox } from "./features/plan/routeBoxChunk";
import { prefetchShareMenu } from "./features/plan/shareMenuChunk";
import { loadPopups } from "./components/popupsChunk";
import "./index.css";
// Barlow, the face of both looks (lib/brand), in the first stylesheet
// rather than fetched once the app has drawn: drawn first in the system's
// face and swapped, the tabs' and every other word shrank as the page
// settled (the owner, 2026-11-04: "Why do the tabs font become smaller
// as they settle on load?"). Chart ink's Barlow Condensed is still
// fetched only when that look is picked.
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import { startTv, tvPlatform } from "./lib/tv";
import { loadEngine } from "./lib/engine/engine";
import { preconnectTiles, preloadFirstLoad } from "./lib/preloads";
import { usePreferences } from "./lib/preferences";
import { takeSharedLinkFrom } from "./features/shared-flight";

// The shared Rust engine (lib/engine), asked for first: the rules it
// works out (the hold's entry, lost comms, the diversion, the debrief)
// answer synchronously. The first render does not wait for it: the
// search, the sheet and the chart draw at once, and each part that asks
// it while it renders waits in its place (lib/engine/engineGate; a route
// named in the address, which it reads, behind MapPage's boot map).
// index.html preloads it beside the scripts.
const engineLoaded = loadEngine();

// The reader's text size from the iPhone's Settings, before the first
// render, so the page is never drawn at the wrong size first.
followDynamicType();

// On a Samsung or LG TV (the TV shells, in git history; lib/tv), the page made for its remote and
// its distance, before the first render.
const tv = tvPlatform();
if (tv) startTv(tv);

// The map's chunk (routeMapChunk) and the search's (routeBoxChunk),
// fetched while the page draws.
prefetchRouteMap();
prefetchRouteBox();
// The menus, popovers and tooltips (popupsChunk), and the route's menu.
void loadPopups().catch(() => {});
prefetchShareMenu();

// What goes wrong on the pilot's device, to the gateway's diagnostics
// (lib/errorReports): before anything else can throw.
installErrorReports();

// How fast the page is on this device, for the speed trend (lib/speed):
// Core Web Vitals, nothing of the pilot's, once the page is idle.
startSpeedReports();
// How long the main thread was busy, beside them (lib/longTasks).
startLongTaskReports();
// When the map's layers show at each load, for Setup's Log.
startLoadLog();

// The service worker (vite.config.ts): the app shell, the chart tiles
// the map has drawn or kept ahead, and the planner's answers, held for
// the air. It registers only on a secure origin (https, or localhost).
// A new build is taken while the app is away, never under the pilot
// (features/shell/newBuild); that reload keeps the route on screen, a
// person's starts clean (features/shell/freshLoad).
// Registered once the page has loaded, not during it: the worker's
// install fetches every chunk it precaches (2.7 MB), which competed
// with the map, its tiles and the planner on a cold start and after
// each deploy.
const takeNewBuild = takeNewBuildsWhenAway(registerSW);
startFresh();

// Three views, one app -- which is the point of the port. As separate
// HTML files they drifted: one grew a basemap fix the other never
// got, and each had its own copy of the course line, the halo and the
// markers. Now all of them import the same ones.
//
// The map page is in the first script: every page this app has is a
// map, so a chunk of its own was only a round trip later.
//
// basename "/app": the app is served under that prefix (the gateway's
// WebMvcConfig), not at the domain root. Bare "/app"/"/app/" already
// redirect server-side to "/app/plan" (a real 500 otherwise -- see that
// config's own comment) -- the index route below handles it too, for
// any in-app `<Link to="/app">` that never leaves the client. Plan is
// the app's own homepage: the thing a pilot actually opens this for,
// not a page-index one page removed from it.

// One page in two modes, one for each role: the same shell around a
// different workspace -- the pilot's (the route, the nav log, the
// pilot's own console) and the developer's (the training workspace and
// the dev console). The two older addresses keep working: the labeling
// page is the Dev page now, and everything Settings held lives in
// Plan's pilot console.
const router = createBrowserRouter(
  [
    { index: true, element: <Navigate to="/plan" replace /> },
    // The planner with the first script, not asked for once it has run:
    // it is the page nearly every load is of, and its chunk was a second
    // round trip before anything showed (2 s to the panel on a phone's
    // CPU, cold). The training workspace inside it stays its own chunk.
    { path: "plan", element: <MapPage mode="pilot" />, errorElement: <PageError /> },
    { path: "dev", element: <MapPage mode="dev" />, errorElement: <PageError /> },
    // The Studio (features/studio): replays of real flights, the developer's for now.
    { path: "studio", element: <MapPage mode="studio" />, errorElement: <PageError /> },
    // The old labeling address, kept working with its route: a loader
    // redirect rather than a component, since the router's own
    // `redirect` is the one place a query string can be carried over
    // before anything renders.
    { path: "label", loader: ({ request }) => redirect(`/dev${new URL(request.url).search}`) },
    { path: "settings", element: <Navigate to="/plan" replace /> },
  ],
  { basename: "/app" },
);

/**
 * The route the address already names, asked for before React mounts.
 *
 * Measured on a phone-shaped CPU budget, cold: this chunk finishes at
 * about 70ms and the planner was not asked for the course until 1,800ms
 * -- the whole of React mounting, the router resolving and the
 * workspace rendering happened first, with the request waiting behind
 * all of it for a route the URL had named from the start. The map
 * cannot draw until the course answers, so that wait is the grey.
 *
 * `prefetchQuery` with the key and the fetcher `usePlan` uses, so the
 * component finds the answer already in the cache rather than asking
 * again. Only when the address names both ends: without them the page
 * asks the server which route to open, which is a different question.
 */
// The chart the map is drawn on, asked for now too: a map with no route
// waits on nothing else (and draws from the last answer kept, meanwhile).
// Its tiles' server connected to, and the faces asked for, meanwhile
// (lib/preloads): from the chart kept from the last load, and again from
// the first answer where none was kept.
preloadFirstLoad(queryClient.getQueryData(chartQuery.queryKey), usePreferences.getState().overlay);
void queryClient
  .prefetchQuery({ ...chartQuery, meta: { silent: true } })
  .then(() => preconnectTiles(queryClient.getQueryData(chartQuery.queryKey)));
// And the overlay tiles' archive's name, for the map's vector source; with
// it, the archive's header and root directory (its first 16 KB, one range
// request), so the map's first overlay tile goes straight to its bytes
// (lib/map/sources/overlayTiles warmOverlayArchive). The module is the map
// chunk's, asked for here on its own.
void queryClient
  .fetchQuery(overlayTilesQuery)
  .then((tiles) => import("./lib/map/sources/overlayTiles").then((m) => m.warmOverlayArchive(tiles)))
  .catch(() => {
    /* no archive yet: the map adds the overlays once there is one */
  });

// A shared flight's link is a preview first: its route taken off the
// address before anything plans it (features/shared-flight).
// The address put right by the router itself (navigate, replacing), the
// rest read from what it is left as.
const unshared = takeSharedLinkFrom(window.location.search);
if (unshared) {
  const rest = unshared.toString();
  // No pathname: the page it is on, whatever the router's basename does
  // to one (given router.state's, the shared link's page was a 404).
  void router.navigate({ search: rest ? `?${rest}` : "", hash: window.location.hash }, { replace: true });
}
const opening = unshared ?? new URLSearchParams(window.location.search);
const openingDep = opening.get("dep")?.trim().toUpperCase();
const openingDest = opening.get("dest")?.trim().toUpperCase();
const prefetchCourse = () => {
  const openingStops = stopsOf(opening.get("stops"));
  if (routeOf(openingDep, openingDest, openingStops)) {
    // Quiet: if the planner is down, the page's own course query says so
    // once it mounts and asks again -- under the page's rule, not this one.
    void queryClient.prefetchQuery({ ...courseQuery(openingDep!, openingDest!, openingStops), meta: { silent: true } });
  }
};
// A stop's form is the engine's (lib/identSchema stopOf), so a route with
// stops is asked for once the engine is there; one without, at once.
if (opening.get("stops")) void engineLoaded.then(prefetchCourse, () => {});
else prefetchCourse();

// A chunk that will not load -- the deploy after this page's own replaced
// it, or no signal -- recovered by itself where a newer build is served:
// the page loaded again once, its route kept (lib/chunkRecovery). The
// error goes on to the route's PageError meanwhile, which says which it
// was where it stays: a newer version ready, no connection, or a part that
// did not load.
window.addEventListener("vite:preloadError", () => {
  void recoverChunk({
    fetchIndex: () =>
      fetch(`${import.meta.env.BASE_URL}index.html`, { cache: "no-store" }).then(
        (r) => (r.ok ? r.text() : null),
        () => null,
      ),
    entry: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null,
    update: async () => {
      await (await navigator.serviceWorker?.getRegistration())?.update();
      await takeNewBuild();
    },
    reload: () => {
      keepAddressThroughReload();
      window.location.reload();
    },
    storage: (() => {
      try {
        return sessionStorage;
      } catch {
        return null;
      }
    })(),
    online: navigator.onLine,
  }).then((outcome) => {
    if (outcome !== "reloaded") useChunkFailure.setState({ failure: outcome });
  });
});

// A render React could not finish takes the page down: reported too.
// Drawn without waiting for the engine (above); an engine that failed to
// load is reported, and the gated parts stay their placeholders.
const render = () =>
  ReactDOM.createRoot(document.getElementById("root")!, {
    onUncaughtError: (error) => {
      sendReport(reportOf("render", error));
      console.error(error);
    },
  }).render(
    <React.StrictMode>
      {/* Light, dark, or the OS's own choice -- the settings' Theme
        sets it, next-themes keeps it and puts the `dark` class on
        <html>, which is what every colour token in index.css keys off
        (and what the Toaster below already reads). */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="wingtip.theme" disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          {/* No tooltip provider: each tooltip opens at once (its trigger's
          delay 0, popups/IconTip), as the provider's did, and the
          provider would bring Base UI's tooltips into the first load
          (popupsChunk). */}
          <>
            <RouterProvider router={router} />
            <AppToaster />
            <ErrorAlert />
            <BrandLook />
          </>
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
// And the face in before the first render, so no word is drawn in another
// first; never held more than 400 ms for it, the system's face then.
const faceLoaded = Promise.race([
  Promise.all(["400", "500", "600", "700"].map((weight) => document.fonts.load(`${weight} 1rem Barlow`))),
  new Promise((resolve) => setTimeout(resolve, 400)),
]);
void engineLoaded.catch((error) => {
  sendReport(reportOf("error", error));
  console.error(error);
});
void faceLoaded.then(render, render);

// The deletes whose Undo was still up when the tab was last closed, sent
// now (lib/pendingDeletes); the lists fetched again once any is.
void flushPendingDeletes({ flight: api.flights.remove }).then((sent) => {
  if (sent) void queryClient.invalidateQueries({ queryKey: flightsQuery.queryKey });
});
