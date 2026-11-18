import { useState } from "react";

/**
 * Whether FPL's suggested routes are out (RoutesToggle, FplRoute) and their
 * ways drawn on the map (PlanMap), for the route they were turned on for:
 * `key` is that route, its two ends (null while there are no ways to
 * suggest). Put away whenever it changes -- another plan, the route
 * cleared, its ways gone -- so they never come out by themselves on the
 * next plan, where a store kept for the page's life left them out (the
 * owner's list, 2026-11-18). A pick among them changes only the route's
 * stops, not its ends, so it keeps them out. Kept in the plan's view model
 * (usePlanRouteList), above the sheet, which draws FPL anew as it moves.
 */
export function useRoutesShown(key: string | null) {
  const [shown, setShown] = useState(false);
  const [shownKey, setShownKey] = useState(key);
  // Adjusted as the render goes, React's way for state that follows a prop.
  if (key !== shownKey) {
    setShownKey(key);
    setShown(false);
  }
  return { routesShown: shown && key !== null && key === shownKey, setRoutesShown: setShown };
}
