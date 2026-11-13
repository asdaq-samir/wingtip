import { useCallback } from "react";
import type { SetAddress } from "../../../lib/address";
import type { AltitudeChoice } from "../../../lib/api/types";
import { altitudesParam, groundOf, positionIdent, stopsOf } from "../../../lib/identSchema";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { feel } from "../../../lib/haptics";
import { sameField } from "../../../lib/procedures";
import { holdsOf, holdsParam, type Hold } from "../lib/routeHolds";
import { turnaroundMin } from "../components/navlog/rows";
import { directToPatch, routeWas } from "./planAddress";
import { useDirectReady, type PlanNow } from "./directOnDevice";

const NO_PLAN: PlanNow = { course: null, legs: [], nav: null, totals: null };

/**
 * The plan's settings that are one change of the address each
 * (usePlanWorkspace), which plans again: a stop's time on the ground, a
 * hold, a Direct to, the departure time, the altitude's plan and a local
 * flight's time aloft. Each reads the address as it is when the change
 * is made (setAddress's `prev`).
 */
export function usePlanSetters(
  setAddress: SetAddress,
  /** The plan now, for a Direct To worked out on the device with no
   *  connection (directOnDevice's useDirectReady): where it cannot be, the
   *  route stays as it is. */
  plan: PlanNow = NO_PLAN,
) {
  const readyDirect = useDirectReady(plan);
  const changeLocalMin = useCallback(
    (minutes: number) => {
      void setAddress({ local_min: minutes });
    },
    [setAddress],
  );
  // A stop's time on the ground, from when it leaves (ProceduresRoute's
  // Depart step): the address's `ground`, the default 30 not written.
  const setGround = useCallback(
    (ident: string, minutes: number) => {
      void setAddress((prev) => {
        const own = groundOf(prev.ground);
        if (minutes === turnaroundMin()) delete own[ident];
        else own[ident] = minutes;
        return { ground: altitudesParam(own) || null };
      });
    },
    [setAddress],
  );
  // Direct to a point of the route, as ATC sends an airplane, at the
  // owner's ask ("direct to skips all the route before and redraws the
  // magenta line and flies directly to it"): the route from where the
  // airplane is -- own ship's fix, the dry run's airplane's while it flies
  // (simulateFix), with its altitude -- else from the departure, on from
  // the point as it was planned. The route as it was kept (`was`) for
  // Cancel, and the point (`direct`) for its strip and pressed button; one
  // at a time, a procedure's own direct given back (planAddress's
  // directToPatch).
  const directToPoint = useCallback(
    (ident: string | null) => {
      const ship = useOwnShip.getState();
      const fix = ship.enabled ? ship.fix : null;
      if (ident && !readyDirect(ident, fix)) return;
      if (ident) feel("directTo");
      void setAddress((prev) => directToPatch(prev, ident, fix));
    },
    [setAddress, readyDirect],
  );
  // A hold set at a point, changed, or (null) taken off: one a point.
  const setHold = useCallback(
    (fix: string, hold: Hold | null) => {
      void setAddress((prev) => {
        const kept = holdsOf(prev.holds).filter((h) => !sameField(h.fix, fix));
        return { holds: holdsParam(hold ? [...kept, hold] : kept) || null };
      });
    },
    [setAddress],
  );
  // Direct to a VOR or a fix off the chart (its card's Direct To), as to a
  // point of the route (directToPoint): from where the airplane is, to it,
  // and on through the route's stops to its destination, the route as it
  // was kept (`was`) for the strip's Cancel. Only from a position: from the
  // departure it would be a stop, Add to Route's.
  const directToChartPoint = useCallback(
    (to: { ident: string }) => {
      const ship = useOwnShip.getState();
      const fix = ship.enabled ? ship.fix : null;
      if (!fix || !readyDirect(to.ident, fix)) return;
      feel("directTo");
      void setAddress((prev) => {
        const was = prev.was ?? routeWas(prev);
        const stops = stopsOf(prev.stops).filter((stop) => !sameField(stop, to.ident));
        return { dep: positionIdent(fix), stops: [to.ident, ...stops].join(","), direct: to.ident, was, place: null };
      });
    },
    [setAddress, readyDirect],
  );
  // A different departure time may mean a different winds forecast:
  // kept in the address like the rest, which is what re-plans.
  const changeDepart = useCallback(
    (iso: string) => {
      void setAddress({ depart: iso || null });
    },
    [setAddress],
  );
  // A different plan -- lowest, highest, fastest, economical -- means
  // different legs too. A plan replaces a typed altitude: the address drops it, so
  // the log flies the plan and nothing else, and the Custom box (whose
  // draft belonged to the old address) empties with it.
  const changeAltitudeChoice = useCallback(
    (choice: AltitudeChoice) => {
      feel("altitude");
      // The fastest is the address's own, not written.
      void setAddress({ altitude_ft: null, altitude_nearest: null, altitude_choice: choice });
    },
    [setAddress],
  );
  return { changeLocalMin, setGround, directToPoint, setHold, directToChartPoint, changeDepart, changeAltitudeChoice };
}
