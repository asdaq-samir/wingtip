import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api/client";
import { positionNow } from "../../lib/map/position/ownShip";
import { askSearchPick, useSearchPick, type SearchPick } from "../../lib/oneSearch";
import { usePreferences } from "../../lib/preferences";
import { useProgressToast } from "../../lib/useProgressToast";
import { FIRST_FLIGHT, FPL_TIP, unseen, useTips } from "../../lib/firstRunTips";
import type { RouteParts } from "../route";
import type { PanelState } from "../../lib/mapChrome";
import { type PanelView, riseToSee } from "../plan";

/**
 * The first flight (FirstFlight), the owner's option A (2026-11-13): a
 * welcome sheet the first time the app opens with no route on this
 * device, whose one button, Let's Go Flying (or the sheet swiped away),
 * goes on to the map with the one search ready for the destination: its
 * Search page up and its field asking for one (lib/oneSearch's pick, as the
 * route's own pickers ask), not focused, so no keyboard jumps up until the
 * pilot taps it (the owner, 2026-11-13); no field of its own. Then, after
 * the first route, one tip on the page toggle where it shows FPL.
 * Each is kept as the tips are (lib/firstRunTips), so Settings' Show First
 * Flight Again brings them back.
 *
 * The airport picked is planned to from where the pilot is -- own ship's
 * fix, the nearest field to it (the planner's nearest) -- else from the
 * last departure this device planned from, or its Home; with neither, the
 * search asks for the departure in its turn. Then the route is set as the
 * box sets it (useRouteEdits' setRoute) and FPL is the page up, with the
 * tip pointing at the toggle once it shows FPL again (Search up).
 */
export function useFirstFlight({
  routed,
  onPlan,
  pickView,
  setPanel,
}: {
  /** Whether there is a route: the welcome is for a planner with none. */
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  pickView: (view: PanelView) => void;
  setPanel: (state: PanelState) => void;
}) {
  const seen = useTips((s) => s.seen);
  const see = useTips((s) => s.see);
  const lastDeparture = usePreferences((s) => s.recentRoutes[0]?.dep ?? s.homeAirport?.ident ?? null);
  const welcome = !routed && unseen(seen, FIRST_FLIGHT);
  const tip = routed && unseen(seen, FPL_TIP);
  // The wait of up to 4 s for a fix once the destination is picked, said
  // as the page's progress line (the owner's Q2, 2026-11-21), so the pilot
  // isn't left with nothing happening; shown only past 400 ms, as every
  // progress line is (useProgressToast).
  const [finding, setFinding] = useState(false);
  useProgressToast(finding ? FINDING_YOU : null);

  // The search's ask for the destination, while it is ours.
  const asked = useRef<SearchPick | null>(null);
  // The latest pick's turn: a pick made while an earlier one still waits
  // for the fix takes its place, the earlier one let go.
  const turn = useRef(0);
  const planTo = useCallback(
    (dest: string) => {
      const mine = ++turn.current;
      // The ask held while the fix is waited for (up to 4 s, no route
      // yet, Search still up), so the field typed in again picks again;
      // a tap on a Nearest, Recent or Favorite tile with the field at rest
      // opens its card, as the ask waits for the field (lib/oneSearch's
      // pickInUse; the owner, 2026-11-23).
      if (asked.current) useSearchPick.setState({ pick: asked.current });
      void planFirstFlight(dest, null, {
        stale: () => mine !== turn.current,
        lastDeparture,
        onFinding: setFinding,
        onPlan: (parts) => {
          onPlan(parts);
          pickView("plan");
        },
      });
    },
    [lastDeparture, onPlan, pickView],
  );

  // The ask let go once a route is made, by the pick or some other way,
  // so the next tap opens its card again.
  useEffect(() => {
    if (!routed || !asked.current) return;
    if (useSearchPick.getState().pick === asked.current) useSearchPick.setState({ pick: null });
    asked.current = null;
  }, [routed]);

  /** Let's Go Flying, or the sheet swiped away: not offered again, and
   *  the map with the one search ready for where to, unfocused, the sheet
   *  risen from the pill to half so its page is seen (rule 11, riseToSee). */
  const go = useCallback(() => {
    see(FIRST_FLIGHT);
    pickView("search");
    riseToSee(setPanel);
    asked.current = { label: "Destination", fixes: false, onPick: planTo, waiting: true };
    useSearchPick.setState({ pick: asked.current });
  }, [pickView, planTo, see, setPanel]);

  const closeTip = useCallback(() => see(FPL_TIP), [see]);

  return { welcome, go, tip, closeTip };
}

/** The progress line while the first route waits for a position. */
export const FINDING_YOU = "Finding where you are…";

/**
 * The airport picked planned to: from `from` where the search was asked
 * for it, else own ship's nearest field, else the last departure or Home;
 * with none, the search asks for the departure, and with the departure
 * the destination, it asks again for somewhere else.
 */
async function planFirstFlight(
  dest: string,
  from: string | null,
  to: {
    lastDeparture: string | null;
    onFinding: (finding: boolean) => void;
    onPlan: (parts: RouteParts) => void;
    /** A later pick has taken this one's place. */
    stale?: () => boolean;
  },
): Promise<void> {
  let dep = from;
  if (!dep) {
    to.onFinding(true);
    try {
      const fix = await positionNow(4000);
      // The nearest field not to be had (no connection): the last
      // departure, else the pilot is asked, as with no position.
      if (fix) dep = (await api.nearestAirports(fix.lat, fix.lon).catch(() => []))[0]?.ident ?? null;
    } finally {
      to.onFinding(false);
    }
  }
  dep ??= to.lastDeparture;
  if (to.stale?.()) return;
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
