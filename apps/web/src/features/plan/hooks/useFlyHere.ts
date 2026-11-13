import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { ADDRESS_CLEARED, type AddressChange, type SetAddress } from "../../../lib/address";
import type { PanelState } from "../../../lib/mapChrome";
import type { AircraftChoice, AirportPlace } from "../../../lib/api/types";
import { api } from "../../../lib/api/client";
import { isPosition, positionIdent } from "../../../lib/identSchema";
import { feel } from "../../../lib/haptics";
import { positionNow, useOwnShip } from "../../../lib/map/position/ownShip";
import { usePreferences } from "../../../lib/preferences";
import { chartCycle, checkpointsQuery, courseQuery, queryClient } from "../../../lib/queryClient";
import { loadRoutePanel } from "../routePanelParts";
import { panelNow, riseToSee } from "./panelNow";
import type { PlannedRoute } from "./planAddress";
import { navlogQuery, type PlanParams } from "./usePlan";

/** Fly Here's plan from `from` to the card's airport, as the page will ask
 *  for it once the route is in: from the card, with the plan's own
 *  altitude, stops and Class B left behind, and Load's count the one the
 *  tap makes (setLoad). The card's read-ahead and the tap ask for the same. */
function flyHerePlan(
  from: string,
  to: string,
  {
    depart,
    aircraft,
    load,
    showWaypoints,
    flightRules,
  }: Pick<PlanParams, "depart" | "aircraft" | "load"> & { showWaypoints: boolean; flightRules: "vfr" | "ifr" },
): PlanParams {
  return {
    dep: from,
    dest: to,
    stops: [],
    altitudeFt: "",
    altitudeChoice: "fastest",
    depart,
    aircraft,
    load: load + 1,
    // Through Class B unless avoided, as the page plans it (class_b):
    // left out, the read-ahead was another key, the page's own log
    // asked for again at the tap.
    classBClearance: true,
    checkpoints: showWaypoints,
    rules: flightRules,
  };
}

/**
 * Fly Here, as an EFB's Direct-To (usePlanWorkspace): an airport's card's
 * airport as the destination, from where the pilot is now, with the
 * route's own questions read ahead -- as the card opens, and at the tap --
 * so the route lands on them answered. With the idle read-ahead of the
 * routes from Home to each Favorite.
 */
export function useFlyHere({
  planned,
  place,
  depart,
  aircraft,
  load,
  setLoad,
  setUnder,
  showWaypoints,
  flightRules,
  setPanel,
  setAddress,
}: {
  planned: PlannedRoute;
  /** The airport whose card is open. */
  place: string | null;
  depart: string;
  aircraft: AircraftChoice;
  /** Load's count, the nav log's key (usePlanWorkspace). */
  load: number;
  setLoad: Dispatch<SetStateAction<number>>;
  /** The card the route is a layer over (usePlaceCards' `under`). */
  setUnder: (ident: string | null) => void;
  showWaypoints: boolean;
  flightRules: "vfr" | "ifr";
  setPanel: (state: PanelState) => void;
  setAddress: SetAddress;
}) {
  // Fly Here, as an EFB's Direct-To, at the pilot's ask: the card's
  // airport as the destination, from where the pilot is now -- own ship's
  // position itself, at once where there is one (positionNow; off, it is
  // turned on for the next) -- else from Home (Favorites), else from the
  // route's departure (or, when that is this airport, its destination),
  // the last place planned from. The plan loads at once, with the card put
  // away and the panel half up on it.
  const fromFor = useCallback(
    async (to: string, fixNow: { lat: number; lon: number; altitudeFt?: number | null } | null) => {
      // From the present position itself, at the pilot's ask: a Direct-To in
      // the air goes from wherever the airplane is, any time, not from a
      // field near it (the planner's app.router_basics.position_of, flown from),
      // and climbs from the GPS's altitude where it gives one.
      let from: string | null = fixNow ? positionIdent(fixNow) : null;
      const homeIdent = usePreferences.getState().homeAirport?.ident;
      from ??= homeIdent && homeIdent !== to ? homeIdent : null;
      from ??= planned.dep && planned.dep !== to ? planned.dep : planned.dest && planned.dest !== to ? planned.dest : null;
      return from;
    },
    [planned.dep, planned.dest],
  );
  // Once the page is idle: the route panel's code (routePanel), so it is
  // in hand before a route is; and the routes from Home to each Favorite,
  // the ones flown most, their courses asked for so the planner reads
  // their charts and ground ahead (app.prefetch) -- at the pilot's ask
  // for a fast app, a new route's chart read being 3 to 6 s of its nav
  // log. Six at the most, once a page.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((go: () => void) => window.setTimeout(go, 2000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => {
      void loadRoutePanel();
      const { homeAirport, favoriteAirports } = usePreferences.getState();
      if (!homeAirport) return;
      for (const fav of favoriteAirports.filter((f) => f.ident !== homeAirport.ident).slice(0, 6)) {
        void queryClient.prefetchQuery(courseQuery(homeAirport.ident, fav.ident));
      }
    });
    return () => cancel(handle);
  }, []);
  // The airport Fly Here was tapped for: its card goes as the route comes,
  // and what was read ahead for it is then the page's to wait on, not to
  // be let go (below).
  const flownTo = useRef<string | null>(null);
  // Fly Here read ahead, as an airport's card opens, at the pilot's ask
  // for a fast route to nav log: its course asked for now from where it
  // would go from, so the tap lands on it answered -- and the planner,
  // asked for the course, starts on the chart's read and the ground under
  // the route (app.prefetch) -- and from a field, the checkpoints and the
  // nav log Fly Here's route will ask for, as reads ahead (?ahead=true):
  // the planner queues their chart reads behind any the pilot waits on
  // and puts one first once the pilot does (app.chart_model._reading), so
  // they hold none of its readers from a route being planned, and the tap's
  // own requests join them where they are. They were 1.2 to 1.4 s after
  // the tap (the speed audit, 2026-11-10). Kept out of the page's cache,
  // as the Recents planned ahead are (usePlanAhead): the route then draws
  // as it comes. Not from a present position, which has moved by the
  // tap; and let go if the card closes without Fly Here.
  useEffect(() => {
    if (!place) return;
    flownTo.current = null;
    let gone = false;
    const asked: (readonly unknown[])[] = [];
    void (async () => {
      const ship = useOwnShip.getState();
      const from = await fromFor(place, ship.enabled ? ship.fix : null);
      if (gone || !from) return;
      void queryClient.prefetchQuery(courseQuery(from, place));
      // Not on a connection the pilot asked to spare.
      if (isPosition(from) || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
      const ahead = (query: { queryKey: readonly unknown[]; queryFn?: unknown }) => {
        if (queryClient.getQueryState(query.queryKey)) return;
        asked.push(query.queryKey);
        void queryClient.prefetchQuery({ ...query, meta: { silent: true } } as Parameters<typeof queryClient.prefetchQuery>[0]);
      };
      if (showWaypoints) {
        ahead({
          // usePlanAhead's key for the same read ahead.
          queryKey: ["checkpoints-ahead", from, place, ""],
          queryFn: ({ signal }: { signal: AbortSignal }) => api.checkpoints(from, place, [], signal, true, chartCycle()),
        });
      }
      ahead(navlogQuery(flyHerePlan(from, place, { depart, aircraft, load, showWaypoints, flightRules }), showWaypoints, true));
    })();
    return () => {
      gone = true;
      if (flownTo.current === place) return;
      // The card closed without Fly Here: its requests stopped (each query
      // aborts its fetch, `signal`) and their answers let go.
      for (const queryKey of asked) {
        void queryClient.cancelQueries({ queryKey, exact: true });
        queryClient.removeQueries({ queryKey, exact: true });
      }
    };
  }, [place, fromFor, depart, aircraft, load, showWaypoints, flightRules]);
  const flyHere = useCallback(
    async (to: Pick<AirportPlace, "ident">) => {
      feel("directTo");
      flownTo.current = to.ident;
      const from = await fromFor(to.ident, await positionNow());
      // The address this route alone: the rest of the plan left behind.
      const next: AddressChange = { ...ADDRESS_CLEARED, dest: to.ident };
      if (from) next.dep = from;
      if (depart) next.depart = depart;
      // The route a layer over the card, at the height the card was, as
      // Maps' directions are over a place's card: its close, the route
      // cleared, goes back to the card (clearRoute).
      if (panelNow.current === "full") next.view = "briefing";
      // The route's own questions asked now, at the tap, not once the page
      // has drawn it: the draw is a second of a phone's (at 4x), and the
      // planner's chart read and terrain for a new position are the slow part
      // of its nav log. The nav log as the page will ask for it: from the
      // card, with the plan's own altitude, stops and Class B left behind, and
      // Load's count the one it is about to be (setLoad, below).
      if (from) {
        const plan = flyHerePlan(from, to.ident, { depart, aircraft, load, showWaypoints, flightRules });
        void queryClient.prefetchQuery(courseQuery(from, to.ident));
        if (showWaypoints) void queryClient.prefetchQuery(checkpointsQuery(from, to.ident));
        void queryClient.prefetchQuery(navlogQuery(plan, showWaypoints));
        // And the route as entered beside it where the course, read ahead as
        // the card opened, said the chart along it is still to be read --
        // as the page would ask, once the course is in (usePlan).
        if (showWaypoints && queryClient.getQueryData(courseQuery(from, to.ident).queryKey)?.checkpoints_ready === false) {
          void queryClient.prefetchQuery(navlogQuery(plan, false));
        }
      }
      // A frame for the tap to show in first -- the tile's spinner (PlaceCard)
      // -- before the route's first draw holds the page: a second of a
      // phone's at 4x, and the tap looked lost under it.
      await new Promise((go) => requestAnimationFrame(() => window.setTimeout(go, 0)));
      // The tapped button out of the way first: taken out of the page with
      // the focus in it, the browser worked out the whole page's style there
      // and then, in the middle of the route's first draw.
      (document.activeElement as HTMLElement | null)?.blur();
      // All of it in one draw, the route with its own Load count: drawn first
      // with the old one, the nav log was asked for twice, the first cancelled.
      flushSync(() => {
        setLoad((n) => n + 1);
        setUnder(to.ident);
        // The route in sight: half way up from the pill, else where the
        // pilot left the sheet.
        riseToSee(setPanel);
        void setAddress(next);
      });
    },
    [fromFor, depart, setAddress, setPanel, showWaypoints, aircraft, load, flightRules, setLoad, setUnder],
  );
  return { flyHere };
}
