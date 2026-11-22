import { useEffect } from "react";
import { markRouteDrawn } from "../../../lib/routeDrawn";
import { usePlanAhead } from "./usePlanAhead";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";

/**
 * What waits for the route up to be planned (or for there to be none),
 * usePlanWorkspace's part: the latest Recents and Saved planned ahead
 * (usePlanAhead), and what is fetched ahead for a later tap
 * (lib/routeDrawn).
 */
export function usePlanSettled(route: PlanRoute, answer: PlanAnswerModel) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { routed, planned, load, showWaypoints, flightRules } = route;
  const planSettled = !routed || answer.s.totals != null || answer.s.unflyable != null;
  usePlanAhead({ planSettled, planned, aircraft: answer.aircraft, load, showWaypoints, flightRules });
  useEffect(() => {
    if (planSettled) markRouteDrawn();
  }, [planSettled]);
}
