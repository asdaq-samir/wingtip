import { Suspense, type ReactNode } from "react";
import { LocalDuration } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { LOCAL_MINUTES } from "../../../lib/address";

/** The route's chips: the airplane, the altitude and the time
 *  (`flightInputs`) and a local flight's time aloft, nothing else (the
 *  owner, 2026-11-18: the route's ••• is the floating bar's More, once
 *  there is a route). The flight rules are the Profile card's (PlanCards;
 *  the owner, 2026-11-17). */
export default function RouteControls({ vm, flightInputs }: { vm: PlanSlices<"plan" | "route">; flightInputs: ReactNode }) {
  const { localMin } = vm.route;
  const { changeLocalMin, s } = vm.plan;
  return (
    // One line, never wrapped: it is FPL's bar (FplBar), the one search's
    // field's size (the owner, 2026-11-14), so the airplane and the
    // altitude give way (navlog/pillLook) rather than run off it.
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-1">
      {/* The chips' room while their code comes (routePanel). */}
      <Suspense fallback={<span className="h-9 w-48" aria-hidden="true" />}>{flightInputs}</Suspense>
      {s.local && (
        <Suspense fallback={<span className="h-8 w-20 shrink-0" aria-hidden="true" />}>
          <LocalDuration minutes={localMin} options={LOCAL_MINUTES} onChange={changeLocalMin} />
        </Suspense>
      )}
    </div>
  );
}
