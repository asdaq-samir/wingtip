import { useCallback, useEffect, useMemo } from "react";
import { loadFlightChart } from "../components/loadFlightChart";
import { nextLanding } from "../figures";
import { useDryRun } from "./useDryRun";
import { useFlyingMode } from "./useFlyingMode";
import { useCopilotPublish } from "./useCopilotPublish";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanFpl } from "./usePlanFpl";
import type { PlanViewModel } from "./usePlanView";

/**
 * The flight flown: on paper from the Profile card (useDryRun), and in the
 * airplane (useFlyingMode), handed to the in-flight copilot
 * (useCopilotPublish), for usePlanWorkspace.
 */
export function usePlanFlight(
  { planned, depart, routed, flightRules }: PlanRoute,
  { s, course, selected, directToPoint }: PlanAnswerModel,
  { profileShown, openNearest }: PlanFpl,
  { setViewPick }: PlanViewModel,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  // The flight flown on paper, from the Profile card (useDryRun).
  const dryRun = useDryRun({ course, selected, legs: s.legs, depart, routed, profileShown });
  // The airplane flying the route (useFlyingMode): its NRST is Nearest's
  // list over Airport, as the microphone's is; its D→ direct to the next
  // landing, as the Stops' Direct To goes (directToPoint).
  const flyNearest = useCallback(() => {
    setViewPick("search");
    openNearest();
  }, [setViewPick, openNearest]);
  const flyDirectTo = nextLanding(s.totals, `${planned.dest}`).to;
  const flyDirect = useMemo(
    () => (flyDirectTo ? { to: flyDirectTo, go: () => directToPoint(flyDirectTo) } : null),
    [flyDirectTo, directToPoint],
  );
  const { flying, done: doneFlying } = useFlyingMode({ routed, nearest: flyNearest, direct: flyDirect });
  // The flight handed to the in-flight copilot (features/copilot).
  useCopilotPublish({
    dest: `${planned.dest}`,
    rules: flightRules,
    line: course?.course_line,
    totals: s.totals,
    aircraft: s.nav?.aircraft,
  });
  // The dry run's chart's code fetched ahead, a few seconds after a run can
  // be had, so the run's first frame has its chart (loadFlightChart).
  const dryRunReady = dryRun.ready;
  useEffect(() => {
    if (!dryRunReady) return;
    const id = setTimeout(() => void loadFlightChart(), 3000);
    return () => clearTimeout(id);
  }, [dryRunReady]);
  return {
    dryRunning: dryRun.running,
    goMissed: dryRun.goMissed,
    dryRunReady,
    startDryRun: dryRun.start,
    stopDryRun: dryRun.stop,
    goMissedNow: dryRun.goMissedNow,
    flying,
    doneFlying,
  };
}
