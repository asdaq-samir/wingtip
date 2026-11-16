import { useCallback } from "react";
import { useLegSheet } from "./useLegSheet";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanFpl } from "./usePlanFpl";

/**
 * The point and the leg picked, and the route in order (useLegSheet), and
 * a checkpoint picked on the chart, for usePlanWorkspace.
 */
export function usePlanLeg(
  { routeKey, directParam, removeStop }: PlanRoute,
  { s, course, directToPoint }: PlanAnswerModel,
  { briefShown, openNavLog }: PlanFpl,
  dryRunning: Parameters<typeof useLegSheet>[0]["dryRunning"],
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const leg = useLegSheet({
    routeKey,
    course,
    logSelected: s.logSelected,
    legs: s.legs,
    dryRunning,
    directParam,
    directToPoint,
    removeStop,
  });
  const { selectPointAt } = leg;
  // A checkpoint picked on the chart with the Brief up: the Nav Log's tab
  // picked, where the pick is shown.
  const pickPoint = useCallback(
    (lat: number, lon: number) => {
      if (briefShown) openNavLog();
      selectPointAt(lat, lon);
    },
    [briefShown, openNavLog, selectPointAt],
  );
  return { ...leg, pickPoint };
}
