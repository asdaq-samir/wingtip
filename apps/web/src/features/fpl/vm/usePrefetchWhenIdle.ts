import { useEffect } from "react";
import { usePreferences } from "../../../lib/preferences";
import { courseQuery, queryClient } from "../../../lib/queryClient";
import { afterRouteDrawn } from "../../../lib/routeDrawn";
import { loadRoutePanel, prefetchPilotPanel, prefetchTapCards } from "../routePanelParts";

/** When the cards drawn only at a tap are fetched, ms after the route
 *  opened has drawn (lib/routeDrawn), so they never share its first
 *  seconds, and well before a pilot's first tap on the map. */
const TAP_CARDS_AFTER_MS = 6000;

/**
 * What the planner fetches ahead once the page is idle (usePlanWorkspace),
 * in one place: the route panel's code (routePanel), so it is in hand
 * before a route is; the routes from Home to each Favorite, the ones flown
 * most, their courses asked for so the planner reads their charts and
 * ground ahead (app.prefetch) -- at the pilot's ask for a fast app, a new
 * route's chart read being 3 to 6 s of its nav log, six at the most, once
 * a page; the pilot console's chunk two seconds after the route opened has
 * drawn (lib/routeDrawn), so the gear opens it at once; and the cards drawn
 * at a tap (an airport's, an airspace's, a flight's, the Stops, the flying
 * parts) and the Brief's airport sections six seconds after it, out of a
 * route's first seconds (prefetchTapCards).
 */
export function usePrefetchWhenIdle() {
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
    const later = afterRouteDrawn(prefetchPilotPanel, 2000);
    const cards = afterRouteDrawn(prefetchTapCards, TAP_CARDS_AFTER_MS);
    return () => {
      cancel(handle);
      later();
      cards();
    };
  }, []);
}
