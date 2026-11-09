import { useCallback } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import type { AltitudeChoice } from "../../../lib/api/types";
import { altitudesParam, groundOf, positionIdent, stopsOf } from "../../../lib/identSchema";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { feel } from "../../../lib/haptics";
import { sameField } from "../../../lib/procedures";
import { holdsOf, holdsParam, type Hold } from "../lib/routeHolds";
import { patched } from "../../../lib/useSearchParamsNow";
import { turnaroundMin } from "../components/navlog/rows";
import { directToPatch, routeWas } from "./planAddress";

/**
 * The plan's settings that are one change of the address each
 * (usePlanWorkspace), which plans again: a stop's time on the ground, a
 * hold, a Direct to, the departure time, the altitude's plan and a local
 * flight's time aloft. Each reads the address as it is when the change
 * is made (setSearchParams' `prev`).
 */
export function usePlanSetters(setSearchParams: SetURLSearchParams) {
  const changeLocalMin = useCallback((minutes: number) => {
    setSearchParams(prev => {
      return patched(prev, { local_min: minutes === 60 ? null : String(minutes) });
    }, { replace: true });
  }, [setSearchParams]);
  // A stop's time on the ground, from when it leaves (ProceduresRoute's
  // Depart step): the address's `ground`, the default 30 not written.
  const setGround = useCallback((ident: string, minutes: number) => {
    setSearchParams(prev => {
      const own = groundOf(prev.get("ground"));
      if (minutes === turnaroundMin()) delete own[ident];
      else own[ident] = minutes;
      return patched(prev, { ground: altitudesParam(own) || null });
    }, { replace: true });
  }, [setSearchParams]);
  // Direct to a point of the route, as ATC sends an airplane, at the
  // owner's ask ("direct to skips all the route before and redraws the
  // magenta line and flies directly to it"): the route from where the
  // airplane is -- own ship's fix, the dry run's airplane's while it flies
  // (simulateFix), with its altitude -- else from the departure, on from
  // the point as it was planned. The route as it was kept (`was`) for
  // Cancel, and the point (`direct`) for its strip and pressed button; one
  // at a time, a procedure's own direct given back (planAddress's
  // directToPatch).
  const directToPoint = useCallback((ident: string | null) => {
    const ship = useOwnShip.getState();
    const fix = ship.enabled ? ship.fix : null;
    if (ident) feel("directTo");
    setSearchParams(prev => directToPatch(prev, ident, fix), { replace: true });
  }, [setSearchParams]);
  // A hold set at a point, changed, or (null) taken off: one a point.
  const setHold = useCallback((fix: string, hold: Hold | null) => {
    setSearchParams(prev => {
      const kept = holdsOf(prev.get("holds")).filter(h => !sameField(h.fix, fix));
      return patched(prev, { holds: holdsParam(hold ? [...kept, hold] : kept) || null });
    }, { replace: true });
  }, [setSearchParams]);
  // Direct to a VOR or a fix off the chart (its card's Direct To), as to a
  // point of the route (directToPoint): from where the airplane is, to it,
  // and on through the route's stops to its destination, the route as it
  // was kept (`was`) for the strip's Cancel. Only from a position: from the
  // departure it would be a stop, Add to Route's.
  const directToChartPoint = useCallback((to: { ident: string }) => {
    const ship = useOwnShip.getState();
    const fix = ship.enabled ? ship.fix : null;
    if (!fix) return;
    feel("directTo");
    setSearchParams(prev => {
      const was = prev.get("was") ?? routeWas(prev);
      const stops = stopsOf(prev.get("stops")).filter(stop => !sameField(stop, to.ident));
      return patched(prev, { dep: positionIdent(fix), stops: [to.ident, ...stops].join(","), direct: to.ident, was, place: null });
    }, { replace: true });
  }, [setSearchParams]);
  // A different departure time may mean a different winds forecast:
  // kept in the address like the rest, which is what re-plans.
  const changeDepart = useCallback((iso: string) => {
    setSearchParams(prev => {
      return patched(prev, { depart: iso || null });
    }, { replace: true });
  }, [setSearchParams]);
  // A different plan -- lowest, highest, fastest, economical -- means
  // different legs too. A plan replaces a typed altitude: the address drops it, so
  // the log flies the plan and nothing else, and the Custom box (whose
  // draft belonged to the old address) empties with it.
  const changeAltitudeChoice = useCallback((choice: AltitudeChoice) => {
    feel("altitude");
    setSearchParams(prev => {
      return patched(prev, { altitude_ft: null, altitude_nearest: null, altitude_choice: choice === "fastest" ? null : choice });
    }, { replace: true });
  }, [setSearchParams]);
  return { changeLocalMin, setGround, directToPoint, setHold, directToChartPoint, changeDepart, changeAltitudeChoice };
}
