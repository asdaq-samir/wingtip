import { useCallback, useEffect, useRef } from "react";
import { api } from "../../../lib/api/client";
import { positionNow } from "../../../lib/map/position/ownShip";
import { askSearchPick, useSearchPick, type SearchPick } from "../../../lib/oneSearch";
import { usePreferences } from "../../../lib/preferences";
import { FIRST_FLIGHT, FPL_TIP, unseen, useTips } from "../../../lib/firstRunTips";
import type { RouteParts } from "../components/RouteBox";
import type { PanelView } from "./usePanelView";

/**
 * The first flight (FirstFlight), the owner's option A (2026-11-13): a
 * welcome sheet the first time the app opens with no route on this
 * device, whose one button, Let's Go Flying (or the sheet swiped away),
 * goes on to the map with the one search ready for the destination: its
 * Search tab up and its field asking for one (lib/oneSearch's pick, as the
 * route's own pickers ask), not focused, so no keyboard jumps up until the
 * pilot taps it (the owner, 2026-11-13); no field of its own. Then, after
 * the first route, one tip on the FPL tab.
 * Each is kept as the tips are (lib/firstRunTips), so Settings' Show First
 * Flight Again brings them back.
 *
 * The airport picked is planned to from where the pilot is -- own ship's
 * fix, the nearest field to it (the planner's nearest) -- else from the
 * last departure this device planned from, or its Home; with neither, the
 * search asks for the departure in its turn. Then the route is set as the
 * box sets it (useRouteEdits' setRoute) and FPL is the page up, with the
 * tip pointing at its tab.
 */
export function useFirstFlight({
  routed,
  onPlan,
  pickView,
}: {
  /** Whether there is a route: the welcome is for a planner with none. */
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  pickView: (view: PanelView) => void;
}) {
  const seen = useTips((s) => s.seen);
  const see = useTips((s) => s.see);
  const lastDeparture = usePreferences((s) => s.recentRoutes[0]?.dep ?? s.homeAirport?.ident ?? null);
  const welcome = !routed && unseen(seen, FIRST_FLIGHT);
  const tip = routed && unseen(seen, FPL_TIP);

  const planTo = useCallback(
    (dest: string) => {
      void planFirstFlight(dest, null, {
        lastDeparture,
        onPlan: (parts) => {
          onPlan(parts);
          pickView("plan");
        },
      });
    },
    [lastDeparture, onPlan, pickView],
  );

  // The search's ask for the destination, while it is ours: let go once a
  // route is made some other way, so the next pick opens its card again.
  const asked = useRef<SearchPick | null>(null);
  useEffect(() => {
    if (!routed || !asked.current) return;
    if (useSearchPick.getState().pick === asked.current) useSearchPick.setState({ pick: null });
    asked.current = null;
  }, [routed]);

  /** Let's Go Flying, or the sheet swiped away: not offered again, and
   *  the map with the one search ready for where to, unfocused. */
  const go = useCallback(() => {
    see(FIRST_FLIGHT);
    pickView("search");
    asked.current = { label: "Destination", fixes: false, onPick: planTo };
    useSearchPick.setState({ pick: asked.current });
  }, [pickView, planTo, see]);

  const closeTip = useCallback(() => see(FPL_TIP), [see]);

  return { welcome, go, tip, closeTip };
}

/**
 * The airport picked planned to: from `from` where the search was asked
 * for it, else own ship's nearest field, else the last departure or Home;
 * with none, the search asks for the departure, and with the departure
 * the destination, it asks again for somewhere else.
 */
async function planFirstFlight(
  dest: string,
  from: string | null,
  to: { lastDeparture: string | null; onPlan: (parts: RouteParts) => void },
): Promise<void> {
  let dep = from;
  if (!dep) {
    const fix = await positionNow(4000);
    // The nearest field not to be had (no connection): the last
    // departure, else the pilot is asked, as with no position.
    if (fix) dep = (await api.nearestAirports(fix.lat, fix.lon).catch(() => []))[0]?.ident ?? null;
  }
  dep ??= to.lastDeparture;
  if (!dep) {
    // No position and nothing planned before: the search asks where from.
    askSearchPick({ label: "Departure", fixes: false, onPick: (picked) => void planFirstFlight(dest, picked, to) });
    return;
  }
  if (dep === dest) {
    askSearchPick({
      label: "Destination",
      fixes: false,
      problem: `${dest} is where you are. Pick somewhere to fly to.`,
      onPick: (picked) => void planFirstFlight(picked, from, to),
    });
    return;
  }
  to.onPlan({ dep, stops: [], dest });
}
