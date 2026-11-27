import { queryOptions } from "@tanstack/react-query";
import { api, data, isUnknownPlace, planner } from "./api/client";
import type { components } from "./api/schema";
import type { ChartInfo } from "./api/types";
import { keptStore } from "./storage";
import { signedInPilot } from "./pilotCache";
import { queryClient } from "./queryClientCore";

/** The one query client (queryClientCore), with the queries below. */
export { queryClient };

/*
 * The queries more than one component observes, defined once. TanStack
 * Query keeps one set of options per query, and each observer that
 * mounts writes its own over them -- `meta` included, which is what
 * decides above whether a failure toasts. Spelled out at each site,
 * the same failure toasted or stayed quiet depending on which component
 * happened to render last. The policy lives here; a site adds only
 * what is its own (`enabled`, `placeholderData`).
 */

/** Who is signed in, if anyone (signedInPilot). Never a toast: the pilot console shows
 *  a failed check in place ("Retry sign-in check"), and the header's
 *  Dev switch, which observes it too, simply stays hidden. */
// Fresh for a minute: every tab of the planning panel reads it (/api/me, measured on each).
export const pilotQuery = queryOptions({ queryKey: ["pilot"], queryFn: signedInPilot, staleTime: 60_000, meta: { silent: true } });

/** The planner's snapshot of the stack, which the Developer console
 *  and the training drawer's Retrain button poll together. Fresh for
 *  one poll's interval: opening the console within it shows the
 *  snapshot already here, where it used to ask again on every open and
 *  draw the console twice. */
export const statusQuery = queryOptions({ queryKey: ["status"], queryFn: () => api.status(), staleTime: 30_000, refetchInterval: 30_000 });

/** How this deployment is reached (SIGN_IN, OPEN or CLOSED) and which
 *  sign-ins it offers: asked once, and quiet on failure -- whoever reads
 *  it treats no answer as "not offered". */
export const capabilitiesQuery = queryOptions({
  queryKey: ["signInCapabilities"],
  queryFn: () => api.capabilities(),
  staleTime: Infinity,
  meta: { silent: true },
});

/** The chart's cycle (chartQuery's, else the one kept here), in the course's
 *  and checkpoints' key and address as in the tiles': a new cycle is never
 *  served the service worker's answer kept from the last. */
export const chartCycle = () => queryClient.getQueryData(chartQuery.queryKey)?.chart_cycle ?? keptChart()?.chart.chart_cycle;

/** A route's course: its airports, any stops among them, and the line
 *  through them, the same answer for as long as the page is open. A
 *  course that fails is the page's first news that the planner is down;
 *  but a point the planner does not know is said on its pill in the
 *  route box (usePlan's `unknownPlace`), not as a system problem. */
export const courseQuery = (dep: string, dest: string, stops: string[] = [], cycle = chartCycle()) =>
  queryOptions({
    queryKey: ["course", dep, dest, stops.join(","), cycle],
    queryFn: ({ signal }) => api.course(dep, dest, stops, signal, cycle),
    staleTime: Infinity,
    meta: { silent: isUnknownPlace },
  });

/** A route's checkpoints off the chart: the planner's, kept until the
 *  chart or the model changes (app.checkpoint_scoring), so never stale here. Asked
 *  for by the plan (usePlan) and ahead of Fly Here (PlanWorkspace). Given
 *  up when nothing asks for the route any more (`signal`, which TanStack
 *  aborts as the last observer leaves): a route typed a stop at a time
 *  left each stop's request reading the chart for up to 10 s, and over
 *  HTTP/1.1 a browser's six connections to the page filled with them --
 *  a card, the next route's course and the tiles waited behind
 *  (2026-10-07). The planner's read goes on and is kept either way. */
export const checkpointsQuery = (dep: string, dest: string, stops: string[] = [], cycle = chartCycle()) =>
  queryOptions({
    queryKey: ["checkpoints", dep, dest, stops.join(","), cycle],
    queryFn: ({ signal }) => api.checkpoints(dep, dest, stops, signal, false, cycle),
    staleTime: Infinity,
    // A point not known, the course's to say (courseQuery).
    meta: { silent: isUnknownPlace },
  });

/** The route from the side -- the ground under it and the Class B, C and
 *  D it passes through -- for FPL's side view, a dry run's chart and the
 *  nav log's printed Profile alike, one answer for all three (its key).
 *  Quiet: each draws the route without it where it fails. */
export const routeProfileQuery = (dep: string, dest: string, stops: string[] = []) =>
  queryOptions({
    queryKey: ["route-profile", dep, ...stops, dest],
    queryFn: () => api.routeProfile(dep, dest, stops),
    staleTime: Infinity,
    meta: { silent: true },
  });

/** The weather on the side view for a flight (api.routeWeather): asked
 *  again as the departure or the time flown changes, kept ten minutes,
 *  as the store's products are fetched every few. Quiet: the side view
 *  is drawn without it where it fails. */
export const routeWeatherQuery = (dep: string, dest: string, stops: string[], depart: string | undefined, eteMin: number) =>
  queryOptions({
    queryKey: ["route-weather", dep, ...stops, dest, depart ?? "now", Math.round(eteMin)],
    queryFn: () => api.routeWeather(dep, dest, stops, depart, eteMin),
    staleTime: 10 * 60 * 1000,
    meta: { silent: true },
  });

/** The chart alone, for a map with no route on it yet. The map draws
 *  nothing until it has it -- the empty frame, blue in the dark, that the
 *  pilot saw on every load while it was asked for -- so the last answer
 *  is kept in this browser and the map drawn from it at once, asked for
 *  again behind it when it is an hour old (the charts change every 56
 *  days). */
const CHART_KEY = "wingtip.chart";
type Kept = { at: number; chart: ChartInfo };
const keptChartStore = () => keptStore<Kept | null>(CHART_KEY, null);
function keptChart(): Kept | undefined {
  return keptChartStore().getState().value ?? undefined;
}
export const chartQuery = queryOptions({
  queryKey: ["chart"],
  queryFn: async () => {
    const chart = await api.chart();
    // No storage: the next load asks again, as it always did.
    keptChartStore().setState({ value: { at: Date.now(), chart } satisfies Kept });
    return chart;
  },
  staleTime: 60 * 60_000,
  // Asked again every quarter hour while the page is open: the FAA's chart
  // cycle takes over at 0901Z on its date (the planner's serving cycle), and
  // a tab left open on the map, never refocused, drew the old cycle until it
  // was reloaded.
  refetchInterval: 15 * 60_000,
  initialData: () => keptChart()?.chart,
  initialDataUpdatedAt: () => keptChart()?.at,
});

/** Every TFR, for the map: held five minutes, as the FAA's site updates
 *  them every few. Not silent: a sky drawn with none when the FAA's site
 *  is down must say so. */
export const tfrsQuery = queryOptions({
  queryKey: ["tfrs"],
  queryFn: () => api.tfrs(),
  staleTime: 5 * 60_000,
  refetchInterval: 10 * 60_000,
});

/** The fields nearest a position, asked again only when it has moved a
 *  few miles (a twentieth of a degree): not at every GPS fix. */
export const nearestQuery = (lat: number, lon: number) => {
  const at = (n: number) => Math.round(n * 20) / 20;
  return queryOptions({
    queryKey: ["nearest", at(lat), at(lon)],
    queryFn: () => api.nearestAirports(at(lat), at(lon)),
    staleTime: 10 * 60_000,
    meta: { silent: true },
  });
};

/** The deployment's key for Google's map tiles (routers/basemaps), asked
 *  once a visit; an error, quiet, where it has none and the map offers
 *  no Google overlay (OverlayTiles, MapSettings). */
export const googleMapsQuery = queryOptions({
  queryKey: ["googleMaps"],
  queryFn: () => api.googleMaps(),
  staleTime: Infinity,
  retry: false,
  meta: { silent: true },
});

/** The cycle's overlay tiles' archive (wingtip.vector_tiles): its name and
 *  layers, asked as the page boots (main.tsx) beside the chart's, so the
 *  map's first tile from it goes straight out; a 404, quiet, until the
 *  planner has built one. */
export const overlayTilesQuery = queryOptions({
  queryKey: ["overlayTiles"],
  queryFn: () => api.overlayTiles(),
  staleTime: 60 * 60_000,
  retry: false,
  meta: { silent: true },
});

/** The Class B airports and their weather. The airspace never moves and
 *  the planner holds the weather for minutes, so refetching per pan
 *  would ask the same cache the same question; and quiet, because the
 *  layer and the chips show what they have in place. */
export const classBQuery = queryOptions({
  queryKey: ["classB"],
  queryFn: () => api.classB(),
  staleTime: 5 * 60_000,
  meta: { silent: true },
});

/** An airport's card's data -- its weather, frequencies, runways, pattern
 *  and airspace -- for everything that asks of one: the card, the tiles'
 *  chart marks and colours, the route's ends, a saved flight's fields, the
 *  traffic question's field, a Favorite kept. Ten wrote it out, fresh for
 *  five minutes or for an hour, raising the page's problem or not, so
 *  whether a failed lookup showed depended on which had mounted last (the
 *  commonality audit's N-13). Five minutes, a report's freshness; quiet,
 *  the card saying in place what it could not have (PlaceCard). */
export const airportQuery = (ident: string) =>
  queryOptions({ queryKey: ["airport", ident], queryFn: () => api.airport(ident), staleTime: 5 * 60_000, meta: { silent: true } });

/** An airport's card's answer asked ahead of its opening (airportQuery),
 *  so the card opens on it: a row lit in the search, a stop about to be
 *  added, a field under the finger on the map. */
export function prefetchAirport(ident: string) {
  void queryClient.prefetchQuery(airportQuery(ident));
}

/** A field's own NOTAMs and the TFRs near it, as the planner ranks them. */
export type FieldNotams = components["schemas"]["NotamsRanked"];

/**
 * A field's own NOTAMs (the FAA's feed, by any ident it goes by) and the
 * TFRs within 5 nm of it, best first, as the engine ranks a route's: the
 * planner's GET /api/airport/{ident}/notams, which the iPhone's and
 * Android's cards read too. 14 CFR 91.103 asks for the NOTAMs of every
 * field a flight uses; a card is where a pilot looks at one field, and
 * Keep for the Air asks it for each of the route's (keepAnswers).
 */
export const fieldNotamsQuery = (ident: string) =>
  queryOptions({
    queryKey: ["airport-notams", ident],
    queryFn: () => planner.GET("/api/airport/{ident}/notams", { params: { path: { ident } } }).then(data<FieldNotams>),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

/** A cycle's procedures hold for its 28 days. */
const PROCEDURE_STALE_MS = 6 * 60 * 60_000;

/** A field's procedures from the FAA's CIFP (api.procedures): the route's
 *  Procedures, a debrief's approaches and a lesson's pick alike. */
export const proceduresQuery = (ident: string) =>
  queryOptions({ queryKey: ["procedures", ident], queryFn: () => api.procedures(ident), staleTime: PROCEDURE_STALE_MS });

/** A procedure picked, drawn as the planner draws it (wingtip.procedures):
 *  one query for the map's drawing, its page in the Procedures, the
 *  planner's descent, a debrief and the approach lesson (ApproachLesson)
 *  alike. */
export const procedureQuery = (p: { ident: string; id: string; transition: string | null }) =>
  queryOptions({
    queryKey: ["procedure", p.ident, p.id, p.transition],
    queryFn: () => api.procedure(p.ident, p.id, p.transition),
    staleTime: PROCEDURE_STALE_MS,
  });

/** What a field offers on the ground (api.airportServices): the stop's
 *  card's and a suggested stop's row's. The FAA's cycle and Overture's
 *  monthly release change it, so it is good for the page's life; quiet,
 *  the card saying in place what it could not have. */
export const servicesQuery = (ident: string) =>
  queryOptions({
    queryKey: ["airport-services", ident],
    queryFn: () => api.airportServices(ident),
    staleTime: Infinity,
    meta: { silent: true },
  });

/** An airport's pictures (api.airportPhotos), behind its card's diagram:
 *  the imagery and the article change in years, so good for the page's
 *  life; quiet, the card showing the diagram alone without them. */
export const photosQuery = (ident: string) =>
  queryOptions({
    queryKey: ["airport-photos", ident],
    queryFn: () => api.airportPhotos(ident),
    staleTime: Infinity,
    meta: { silent: true },
  });

/** The map's Stops round a position (api.stopsNear): by the position to
 *  a twentieth of a degree, asked again every two seconds while the
 *  planner is still reading some fields' places (`pending`). */
export const stopsNearQuery = (lat: number, lon: number, nm: number) => {
  const at = (n: number) => Math.round(n * 20) / 20;
  return queryOptions({
    queryKey: ["stops-near", at(lat), at(lon), nm],
    queryFn: () => api.stopsNear(at(lat), at(lon), nm),
    staleTime: 30 * 60_000,
    meta: { silent: true },
    refetchInterval: (query) => (query.state.data?.pending ? 2000 : false),
  });
};

/** The map's Stops along a route (api.stopsAlong), asked again while some
 *  are still to be read, as those round the pilot are. */
export const stopsAlongQuery = (dep: string, dest: string, stops: string) =>
  queryOptions({
    queryKey: ["stops-along", dep, dest, stops],
    queryFn: () => api.stopsAlong(dep, dest, stops),
    staleTime: 30 * 60_000,
    meta: { silent: true },
    refetchInterval: (query) => (query.state.data?.pending ? 2000 : false),
  });

/** The ways to fly a route (api.routeOptions), for FPL's Routes: the
 *  planner's read of the TAFs and METARs is ten minutes old at most, so
 *  that long; quiet, FPL saying nothing of them where they are not had. */
export const routeOptionsQuery = (...args: Parameters<typeof api.routeOptions>) =>
  queryOptions({
    queryKey: ["route-options", ...args],
    queryFn: () => api.routeOptions(...args),
    staleTime: 10 * 60_000,
    meta: { silent: true },
  });

/** An approach's plate placed on the map, and whether it publishes
 *  circling minimums (wingtip.plates): the map's (PlatesGl) and the route's
 *  runway chips' (ProceduresRoute). A plate placed stays good for its
 *  cycle's 28 days; none placed is said by none drawn, not a retry. */
export const plateQuery = (airport: string, id: string) =>
  queryOptions({
    queryKey: ["plate", airport, id],
    queryFn: () => api.plate(airport, id),
    staleTime: 6 * 60 * 60_000,
    retry: false,
    meta: { silent: true },
  });
