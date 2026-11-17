import { Suspense, type ReactNode } from "react";
import { LocalDuration } from "../routePanelParts";
import type { PlanWorkspaceModel } from "../vm/usePlanWorkspace";
import { LOCAL_MINUTES } from "../../../lib/address";

/** The route's chips: the airplane, the altitude and the time
 *  (`flightInputs`), a local flight's time aloft, and the route's •••
 *  (`share`). */
export default function RouteControls({ vm, flightInputs, share }: { vm: PlanWorkspaceModel; flightInputs: ReactNode; share: ReactNode }) {
  const { localMin } = vm.route;
  const { changeLocalMin, s } = vm.plan;
  return (
    // One line, never wrapped: it is FPL's bar (FplBar), the one search's
    // field's size (the owner, 2026-11-14), so the airplane and the
    // altitude give way (InlineField's shrink) before the buttons do.
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-1">
      {/* The chips' room while their code comes (routePanel). */}
      <Suspense fallback={<span className="h-9 w-48" aria-hidden="true" />}>{flightInputs}</Suspense>
      {s.local && (
        <Suspense fallback={<span className="h-8 w-20 shrink-0" aria-hidden="true" />}>
          <LocalDuration minutes={localMin} options={LOCAL_MINUTES} onChange={changeLocalMin} />
        </Suspense>
      )}
      {/* At the row's end the route's ••• alone: the Brief, the Nav Log,
          the Profile and Share are the floating bar at the sheet's foot
          (FplTabBar; the owner, 2026-11-16). A round button at a fixed 32 in
          points, as iOS's bar buttons keep their size at any text size
          (the FPL audit's A3). */}
      <div className="ml-auto flex shrink-0 items-center pl-3.5" data-testid="route-actions">
        {/* The route's menu, with a route or without: before one, only its
            Show Route As (the owner, 2026-11-13: the layout reachable
            before there is a route), where it was once kept back until a
            route was entered ("the share button should not appear before
            a route is entered"). */}
        {share}
      </div>
    </div>
  );
}
