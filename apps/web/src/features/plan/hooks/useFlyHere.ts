import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import type { SetURLSearchParams } from "react-router-dom";
import type { PanelState } from "../../../lib/mapChrome";
import type { AircraftChoice, AirportPlace } from "../../../lib/api/types";
import { positionIdent } from "../../../lib/identSchema";
import { feel } from "../../../lib/haptics";
import { positionNow, useOwnShip } from "../../../lib/map/position/ownShip";
import { usePreferences } from "../../../lib/preferences";
import { checkpointsQuery, courseQuery, queryClient } from "../../../lib/queryClient";
import { loadRoutePanel } from "../routePanelParts";
import { panelNow } from "./panelNow";
import type { PlannedRoute } from "./planAddress";
import { navlogQuery } from "./usePlan";

/**
 * Fly Here, as an EFB's Direct-To (usePlanWorkspace): an airport's card's
 * airport as the destination, from where the pilot is now, with the
 * route's own questions read ahead -- as the card opens, and at the tap --
 * so the route lands on them answered. With the idle read-ahead of the
 * routes from Home to each Favorite.
 */
export function useFlyHere({ planned, place, depart, aircraft, load, setLoad, setUnder, showWaypoints, flightRules, setPanel, setSearchParams }: {
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
  setSearchParams: SetURLSearchParams;
}) {
  // Fly Here, as an EFB's Direct-To, at the pilot's ask: the card's
  // airport as the destination, from where the pilot is now -- own ship's
  // position itself, at once where there is one (positionNow; off, it is
  // turned on for the next) -- else from Home (Favorites), else from the
  // route's departure (or, when that is this airport, its destination),
  // the last place planned from. The plan loads at once, with the card put
  // away and the panel half up on it.
  const fromFor = useCallback(async (to: string, fixNow: { lat: number; lon: number; altitudeFt?: number | null } | null) => {
    // From the present position itself, at the pilot's ask: a Direct-To in
    // the air goes from wherever the airplane is, any time, not from a
    // field near it (the planner's app.router_basics.position_of, flown from),
    // and climbs from the GPS's altitude where it gives one.
    let from: string | null = fixNow ? positionIdent(fixNow) : null;
    const homeIdent = usePreferences.getState().homeAirport?.ident;
    from ??= homeIdent && homeIdent !== to ? homeIdent : null;
    from ??= planned.dep && planned.dep !== to ? planned.dep
      : planned.dest && planned.dest !== to ? planned.dest : null;
    return from;
  }, [planned.dep, planned.dest]);
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
      for (const fav of favoriteAirports.filter(f => f.ident !== homeAirport.ident).slice(0, 6)) {
        void queryClient.prefetchQuery(courseQuery(homeAirport.ident, fav.ident));
      }
    });
    return () => cancel(handle);
  }, []);
  // Fly Here read ahead, as an airport's card opens, at the pilot's ask
  // for a fast route to nav log: its course asked for now from where it
  // would go from, so the tap lands on it answered -- and the planner,
  // asked for the course, starts on the chart's read and the ground under
  // the route (app.prefetch), the two slow parts of a nav log, while the
  // pilot reads the card. Not the checkpoints themselves: that request
  // waits on the read, holding one of the planner's request threads for
  // seconds for a route that may never be flown.
  useEffect(() => {
    if (!place) return;
    let gone = false;
    void (async () => {
      const ship = useOwnShip.getState();
      const from = await fromFor(place, ship.enabled ? ship.fix : null);
      if (gone || !from) return;
      void queryClient.prefetchQuery(courseQuery(from, place));
    })();
    return () => { gone = true; };
  }, [place, fromFor]);
  const flyHere = useCallback(async (to: Pick<AirportPlace, "ident">) => {
    feel("directTo");
    const from = await fromFor(to.ident, await positionNow());
    const next: Record<string, string> = { dest: to.ident };
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
      const plan = {
        dep: from, dest: to.ident, stops: [], altitudeFt: "", altitudeChoice: "fastest" as const, depart, aircraft, load: load + 1,
        // Through Class B unless avoided, as the page plans it (class_b):
        // left out, the read-ahead was another key, the page's own log
        // asked for again at the tap.
        classBClearance: true, checkpoints: showWaypoints, rules: flightRules,
      };
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
    await new Promise(go => requestAnimationFrame(() => window.setTimeout(go, 0)));
    // The tapped button out of the way first: taken out of the page with
    // the focus in it, the browser worked out the whole page's style there
    // and then, in the middle of the route's first draw.
    (document.activeElement as HTMLElement | null)?.blur();
    // All of it in one draw, the route with its own Load count: drawn first
    // with the old one, the nav log was asked for twice, the first cancelled.
    flushSync(() => {
      setLoad(n => n + 1);
      setUnder(to.ident);
      // The route half way, its profile and figures in sight.
      if (panelNow.current !== "full") setPanel("half");
      setSearchParams(next, { replace: true, flushSync: true });
    });
  }, [fromFor, depart, setSearchParams, setPanel, showWaypoints, aircraft, load, flightRules, setLoad, setUnder]);
  return { flyHere };
}
