import { Suspense, type ReactNode } from "react";
import { LocalDuration } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { LOCAL_MINUTES } from "../../../lib/address";
import Segmented from "../../../components/Segmented";
import type { FlightRules } from "../../../lib/preferences";

/** The flight rules a route is planned under. */
const FLIGHT_RULES = [
  { value: "vfr", label: "VFR" },
  { value: "ifr", label: "IFR" },
];

/** The route's chips: the airplane, the altitude and the time
 *  (`flightInputs`), the flight rules beside the altitude, a local
 *  flight's time aloft, and before there is a route its ••• (`share`). */
export default function RouteControls({
  vm,
  flightInputs,
  share,
}: {
  vm: PlanSlices<"plan" | "route">;
  flightInputs: ReactNode;
  share: ReactNode;
}) {
  const { flightRules, localMin, setFlightRules } = vm.route;
  const { changeLocalMin, s } = vm.plan;
  return (
    // One line, never wrapped: it is FPL's bar (FplBar), the one search's
    // field's size (the owner, 2026-11-14), so the airplane and the
    // altitude give way (InlineField's shrink) before the buttons do.
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-1">
      {/* The chips' room while their code comes (routePanel). */}
      <Suspense fallback={<span className="h-9 w-48" aria-hidden="true" />}>{flightInputs}</Suspense>
      {/* VFR or IFR beside the altitude it sets the rules for, a segmented
          control the fields' 28 tall (the owner, 2026-11-17, moved from
          the Profile card's top): the rules change the altitudes legal, the
          reserve and the Brief, so they sit with the altitude, not in one
          of its cards. None for a local flight, which has no altitude. */}
      {!s.local && (
        <Segmented
          compact
          label="Flight rules"
          value={flightRules}
          onChange={(v) => setFlightRules(v as FlightRules)}
          testId="flight-rules"
          options={FLIGHT_RULES}
          className="ml-1 shrink-0"
        />
      )}
      {s.local && (
        <Suspense fallback={<span className="h-8 w-20 shrink-0" aria-hidden="true" />}>
          <LocalDuration minutes={localMin} options={LOCAL_MINUTES} onChange={changeLocalMin} />
        </Suspense>
      )}
      {/* The route's ••• at the row's end only before there is a route,
          for its Undo (a cleared route put back), the map's choices and a
          half route's Clear; once there is one it ends FPL's floating bar
          (FplTabBar; the owner, 2026-11-17: "move everything to the tab
          bar with a ... instead of share"). A round button at a fixed 32 in
          points, as iOS's bar buttons keep their size at any text size
          (the FPL audit's A3). */}
      {share && (
        <div className="ml-auto flex shrink-0 items-center pl-2" data-testid="route-actions">
          {share}
        </div>
      )}
    </div>
  );
}
