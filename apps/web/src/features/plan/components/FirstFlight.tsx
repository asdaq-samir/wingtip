import { Suspense, lazy, useState } from "react";
import { useFirstFlight } from "../hooks/useFirstFlight";
import type { PanelState } from "../../../lib/mapChrome";
import type { PanelView } from "../hooks/usePanelView";
import type { RouteParts } from "./RouteBox";

/** Each its own chunk, off the first load every pilot waits for
 *  (scripts/first-load.mjs): drawn once on a device, if ever. */
const WelcomeSheet = lazy(() => import("./WelcomeSheet"));
const FplTip = lazy(() => import("./FplTip"));

/**
 * The first flight (useFirstFlight; the owner's option A, 2026-11-13):
 * the welcome sheet the first time the planner opens with no route on
 * this device, whose Let's Go Flying leaves the one search ready for
 * where to; then, after the first route, the tip on the FPL tab. Each once.
 */
export default function FirstFlight({
  routed,
  onPlan,
  pickView,
  setPanel,
}: {
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  pickView: (view: PanelView) => void;
  setPanel: (state: PanelState) => void;
}) {
  const { welcome, go, tip, closeTip } = useFirstFlight({ routed, onPlan, pickView, setPanel });
  // Kept once drawn, so the sheet closes with its own motion.
  const [drawn, setDrawn] = useState(welcome);
  if (welcome && !drawn) setDrawn(true);
  return (
    <Suspense fallback={null}>
      {drawn && <WelcomeSheet open={welcome} onGo={go} />}
      {tip && <FplTip onClose={closeTip} />}
    </Suspense>
  );
}
