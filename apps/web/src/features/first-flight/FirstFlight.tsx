import { Suspense, lazy, useEffect, useState } from "react";
import { useFailedAction } from "../../lib/problems";
import { holdAskOnOpen } from "../../lib/map/position/ownShip";
import { FIRST_FLIGHT, FPL_TIP, unseen, useTips } from "../../lib/firstRunTips";
import type { PanelState } from "../../lib/mapChrome";
import type { PanelView } from "../plan";
import type { RouteParts } from "../route";

/** Its walkthrough, welcome and tip on a chunk of their own, off the first
 *  load every pilot waits for (scripts/first-load.mjs): drawn once on a
 *  device, if ever. */
const FirstFlightParts = lazy(() => import("./FirstFlightParts"));

export interface FirstFlightProps {
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  pickView: (view: PanelView) => void;
  setPanel: (state: PanelState) => void;
}

/**
 * The first flight (useFirstFlight; the owner's option A, 2026-11-13):
 * the welcome sheet the first time the planner opens with no route on
 * this device, whose Let's Go Flying leaves the one search ready for
 * where to; then, after the first route, the tip on the FPL toggle. Each
 * once. Here only whether either is still to show, which the tips' store
 * says at once: the walkthrough's chunk (FirstFlightParts) is asked for
 * then, and kept once asked, so a destination picked from the welcome is
 * still planned after both are seen.
 */
export default function FirstFlight(props: FirstFlightProps) {
  const welcome = useTips((s) => !props.routed && unseen(s.seen, FIRST_FLIGHT));
  const due = useTips((s) => unseen(s.seen, FIRST_FLIGHT) || unseen(s.seen, FPL_TIP));
  const [wanted, setWanted] = useState(due);
  if (due && !wanted) setWanted(true);
  // Nothing stacked over the welcome: an alert raised meanwhile (a refused
  // position's "No position" on a first launch) waits until it closes.
  // Nor the browser's position question on load: the welcome's Location
  // row asks it, at a tap (holdAskOnOpen). Held here, on the first load,
  // not in the walkthrough's chunk, which comes after the page's ask.
  useEffect(() => {
    useFailedAction.setState({ held: welcome });
    holdAskOnOpen(welcome);
    return () => {
      useFailedAction.setState({ held: false });
      holdAskOnOpen(false);
    };
  }, [welcome]);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <FirstFlightParts {...props} />
    </Suspense>
  );
}
