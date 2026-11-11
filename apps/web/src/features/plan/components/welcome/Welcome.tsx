import { Suspense, lazy } from "react";
import { WELCOME, unseen, useTips } from "../../../../lib/firstRunTips";
import type { RouteParts } from "../RouteBox";

/** The card on its own chunk: shown once per device, so nothing of it
 *  belongs in the first load every visit pays for (the web's budget). */
const WelcomeCard = lazy(() => import("./WelcomeCard"));

/**
 * The welcome: a short card the first time the planner opens on this
 * device with no route, before the first flight's card (FirstFlight).
 * Once left, by any of its ways, it is not shown again (useWelcome).
 */
export default function Welcome({
  routed,
  onPlan,
  onOpened,
}: {
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  onOpened: () => void;
}) {
  const due = useTips((s) => unseen(s.seen, WELCOME));
  if (!due || routed) return null;
  return (
    <Suspense fallback={null}>
      <WelcomeCard onPlan={onPlan} onOpened={onOpened} />
    </Suspense>
  );
}
