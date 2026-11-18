import { useEffect } from "react";
import { usePreferences } from "../../../lib/preferences";
import { courseQuery, queryClient } from "../../../lib/queryClient";
import { loadRoutePanel, prefetchPilotPanel } from "../routePanelParts";

/**
 * What the planner fetches ahead once the page is idle (usePlanWorkspace),
 * in one place: the route panel's code (routePanel), so it is in hand
 * before a route is; the routes from Home to each Favorite, the ones flown
 * most, their courses asked for so the planner reads their charts and
 * ground ahead (app.prefetch) -- at the pilot's ask for a fast app, a new
 * route's chart read being 3 to 6 s of its nav log, six at the most, once
 * a page; and the pilot console's chunk two seconds on, so the gear opens
 * it at once.
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
    const later = window.setTimeout(prefetchPilotPanel, 2000);
    return () => {
      cancel(handle);
      window.clearTimeout(later);
    };
  }, []);
}
