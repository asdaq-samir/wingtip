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
  { briefShown, closeBrief }: PlanFpl,
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
  // A checkpoint picked on the chart with the Brief open: the Brief put
  // away for the nav log the pick is shown in.
  const pickPoint = useCallback(
    (lat: number, lon: number) => {
      if (briefShown) closeBrief();
      selectPointAt(lat, lon);
    },
    [briefShown, closeBrief, selectPointAt],
  );
  return { ...leg, pickPoint };
}
