import { useRouteSheets } from "./useRouteSheets";
import { useRunwayWinds } from "./useRunwayWinds";
import { useProcedureSheet } from "./useProcedureSheet";
import { useRouteLayout } from "./useRouteLayout";
import type { ProceduresRouteProps, RouteListFlat } from "./routeProps";

/** A day, min: the longest time on the ground at a stop the planner takes. */
export const DAY_MIN = 24 * 60;

/**
 * FPL's route list's view model (ProceduresRoute): the procedures sheet's
 * place and page, the dialogs open, each field's procedures, card and
 * forecast wind asked for, the runways picked into the wind for the pilot,
 * and the fuel in the tanks at each point. The list itself is drawn by
 * ProceduresRoute and its parts (features/procedures).
 */
export function useProceduresRoute(given: ProceduresRouteProps) {
  // Read flat by the list's parts: the route's data and each group's fields.
  const { runways, procedurePicks, pointActions, stopPlans, ...data } = given;
  const props: RouteListFlat = { ...data, ...runways, ...procedurePicks, ...pointActions, ...stopPlans };
  const { rows, directTo = null, askHold = null, holds, stopsFull = false, fuel = null, routeLine = null } = props;
  // The sheets the list opens over it, one at a time (useRouteSheets).
  const sheets = useRouteSheets({ holds, rows, askHold });
  // Each field's wind, and the runways landed on, left from and picked
  // into it (useRunwayWinds).
  const winds = useRunwayWinds(props);
  // The procedures' sheet and its picks (useProcedureSheet).
  const sheet = useProcedureSheet(props, winds.cards);
  // The rows' layout: open or folded, along the route, the tanks (useRouteLayout).
  const layout = useRouteLayout(props);
  return { ...props, directTo, askHold, stopsFull, fuel, routeLine, ...sheet, ...sheets, ...winds, ...layout };
}

/** FPL's route list's view model, as its parts read it. */
export type ProceduresRouteModel = ReturnType<typeof useProceduresRoute>;

/** The model's fields a part reads, by name (as FPL's PlanSlices): what a
 *  part depends on is in its signature, and it is handed no more. */
export type RouteListSlice<K extends keyof ProceduresRouteModel> = Pick<ProceduresRouteModel, K>;
