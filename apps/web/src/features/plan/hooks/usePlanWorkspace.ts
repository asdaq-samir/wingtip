import { useEffect } from "react";
import type { WorkspaceProps } from "../../shell";
import { prefetchPilotPanel } from "../routePanelParts";
import { panelNow } from "./panelNow";
import { usePlanAhead } from "./usePlanAhead";
import { usePlanRoute, useRecentRoute } from "./usePlanRoute";
import { usePlanAnswer } from "./usePlanAnswer";
import { usePlanCards } from "./usePlanCards";
import { usePlanPicks } from "./usePlanPicks";
import { usePlanMap } from "./usePlanMap";
import { usePlanStops } from "./usePlanStops";
import { usePlanView } from "./usePlanView";
import { usePlanRouteList } from "./usePlanRouteList";
import { usePlanFpl } from "./usePlanFpl";
import { usePlanSearch } from "./usePlanSearch";
import { usePlanFlight } from "./usePlanFlight";
import { usePlanLeg } from "./usePlanLeg";
import { usePlanBrief } from "./usePlanBrief";

/**
 * The planner's view model (PlanWorkspace, MVVM): the plan read from the
 * address, the queries, the picks and every handler that changes them,
 * and what the screen works out from them. The view draws from it.
 *
 * One object per concern, each a hook in its own file beside this one,
 * read by the view as `vm.<concern>`: the route in the address and its
 * edits (`route`, usePlanRoute), the plan for it and the airplane
 * (`plan`, usePlanAnswer), the cards over the tabs (`cards`), what is
 * picked at the route's fields (`picks`), where the map is brought to and
 * Fly Here (`map`), the suggested stops (`stops`), the place up and the
 * sheet's size (`view`), FPL's list and line (`routeList`), the cards over
 * FPL (`fpl`), the search bars (`search`), the dry run and flying
 * (`flight`), the point and leg picked (`leg`), and what the screen says
 * of the plan with the flight to save (`brief`). Their order here is the
 * order their effects run in.
 */
export function usePlanWorkspace({ panel, setPanel }: Pick<WorkspaceProps, "panel" | "setPanel">) {
  "use no memo"; // Left to its own memos, as it always was: compiled, it put 18 KB on the first load.
  useEffect(() => {
    const later = window.setTimeout(prefetchPilotPanel, 2000);
    return () => window.clearTimeout(later);
  }, []);
  // The panel's size as of now, for what a tap does with it: read when
  // tapped, not a dependency, so a turn of the sheet does not make every
  // handler new and with them the route's list, the nav log and the
  // briefing drawn again -- 37 ms of the nav log alone at a quarter of a
  // laptop's speed, at the turn's first frame (profiled on the phone
  // project, half to the pill, 2026-10-27: the owner's "the non smooth map
  // and sheet").
  useEffect(() => {
    panelNow.current = panel;
  }, [panel]);
  const route = usePlanRoute();
  const plan = usePlanAnswer(route);
  const cards = usePlanCards(route, setPanel);
  const picks = usePlanPicks(route, plan);
  const map = usePlanMap(route, plan, cards, setPanel);
  const stops = usePlanStops(route, plan, cards, picks);
  // The latest Recents and Saved planned ahead (usePlanAhead), once the
  // route up is planned (or there is none).
  const { routed, planned, load, showWaypoints, flightRules } = route;
  const planSettled = !routed || plan.s.totals != null || plan.s.unflyable != null;
  usePlanAhead({ planSettled, planned, aircraft: plan.aircraft, load, showWaypoints, flightRules });
  useRecentRoute(route, plan.course);
  const view = usePlanView(route, cards, panel, setPanel);
  const routeList = usePlanRouteList(route, plan, view, setPanel);
  const fpl = usePlanFpl(route, plan, cards, picks, map, stops.fuelStopPins, view, setPanel);
  const search = usePlanSearch(route, cards, map, view);
  const flight = usePlanFlight(route, plan, fpl, view);
  const leg = usePlanLeg(route, plan, fpl, flight.dryRunning);
  const brief = usePlanBrief(route, plan, fpl, routeList.waypointStops);
  return { view, route, plan, cards, picks, map, stops, routeList, fpl, search, flight, leg, brief };
}

/** The planner's view model, as its view and sub-views read it. */
export type PlanWorkspaceModel = ReturnType<typeof usePlanWorkspace>;
