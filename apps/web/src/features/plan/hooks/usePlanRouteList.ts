import { useCallback, useState } from "react";
import { positionIdent, stopsOf } from "../../../lib/identSchema";
import { useGeo, type LatLon } from "../../../lib/geo";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { ADDRESS_CLEARED } from "../../../lib/address";
import { proceduresOf, proceduresParam } from "../../../lib/procedures";
import type { PanelState } from "../../../lib/mapChrome";
import { riseToSee } from "./panelNow";
import { routeWas } from "./planAddress";
import { useRouteListEdit } from "./useRouteListEdit";
import { useRouteLine } from "./useRouteLine";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanViewModel } from "./usePlanView";

/**
 * FPL's route as a list and a line (usePlanWorkspace): its points edited
 * in place (useRouteListEdit), a stop being added, the box folded away,
 * a point dropped on the map into it, its close, and the Routes' chips
 * over it (useRouteLine).
 */
export function usePlanRouteList(
  route: PlanRoute,
  { course, ways, own }: PlanAnswerModel,
  { setViewPick }: PlanViewModel,
  setPanel: (state: PanelState) => void,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { planned, routeEdit, routePoints, setRoute, setStops, setAddress, wholeRoute, fuelParam, flightRules } = route;
  // Add Stop open: from its own button, or from no legal altitude's --
  // "via", its Fly via round a Class B, the ways round suggested.
  const [addingStop, setAddingStop] = useState<false | "stop" | "via">(false);
  // FPL's list edited in place (useRouteListEdit).
  const { setAddAt, ...edit } = useRouteListEdit({ stops: planned.stops, course, routeEdit, routePoints, setRoute, setAddingStop });
  const addingChange = useCallback(
    (open: boolean) => {
      setAddingStop(open ? "stop" : false);
      if (!open) setAddAt(null);
    },
    [setAddAt],
  );
  // A point dropped on the map (AirspaceCard) into the route as the
  // pilot's own point off the nearest fix, at the owner's pick (mock 2 of
  // the canvas's points): where it bends the route least (bestStopIndex),
  // and flown to direct from where the airplane is (directToPoint's way,
  // the route as it was kept for Cancel), or held at (its hold's sheet
  // asked for once the plan has the leg to it). The card put away, all in
  // one change of the address.
  const [holdAsk, setHoldAsk] = useState<string | null>(null);
  const geo = useGeo();
  const dropIntoRoute = useCallback(
    (ident: string, at: LatLon, then: "add" | "direct" | "hold") => {
      if (!geo || !course) return;
      const points = [course.departure, ...(course.stops ?? []), course.destination];
      const index = geo.bestStopIndex(points, at);
      const ship = useOwnShip.getState();
      const fix = ship.enabled ? ship.fix : null;
      setAddress((prev) => {
        const stops = stopsOf(prev.stops);
        const withIt = [...stops.slice(0, index), ident, ...stops.slice(index)];
        const away = { place: null, at: null };
        if (then !== "direct") return { ...away, stops: withIt.join(",") };
        const procs = proceduresOf(prev.procs);
        return {
          ...away,
          dep: fix ? positionIdent(fix) : undefined,
          stops: [ident, ...stops.slice(index)].join(","),
          direct: ident,
          was: prev.was ?? routeWas(prev),
          // One direct at a time, as directToPoint's.
          procs: procs.some((p) => p.direct) ? proceduresParam(procs.map((p) => ({ ...p, direct: null }))) || null : undefined,
        };
      });
      // FPL's list in sight, its new row and the hold's sheet with it: up
      // to half from the pill, else where the pilot left the sheet.
      setViewPick("plan");
      riseToSee(setPanel);
      if (then === "hold") setHoldAsk(`${ident}@${Date.now()}`);
    },
    [geo, course, setAddress, setPanel, setViewPick],
  );
  // Clear route, at the pilot's ask: the address keeps nothing of the
  // route, and its box, the controls and the tabs stay out, empty, for
  // another. The panel stays the height it was: all the way up is in the
  // address (`view`), and clearing that with the route lowered it to its
  // pill.
  const clearRoute = useCallback(() => {
    // Every key taken out but the sheet's height.
    const keeping = () => ({ ...ADDRESS_CLEARED, view: undefined, place: null });
    // Cleared: FPL's box empty to type another in; the page toggle goes
    // back to the search (the owner, 2026-11-14: the empty box's own ✕
    // did the same, and is gone).
    void setAddress(keeping());
    setViewPick("plan");
  }, [setAddress, setViewPick]);
  // FPL's route line of the Routes' chips, and their ways on the chart
  // (useRouteLine).
  const line = useRouteLine({
    ...ways,
    stops: planned.stops,
    fuelParam,
    ownMinutes: own.minutes,
    ownGround: own.ground,
    ownNm: own.nm,
    ownGal: own.gal,
    setStops,
    flightRules,
  });
  // The route's chips: the airplane, the altitude, the time, Saved,
  // Approaches and Share (`controls`), and with no route the pill's too.
  // Folded from the start, no route yet too, at the owner's ask ("They
  // should not have route box from the start", 2026-11-05): the box only
  // while it is opened from the head, or a stop is typed in. Opened to
  // type a route, it folds by itself once the route is whole -- the
  // destination in -- as the pilot has what they opened it for.
  const [wasWhole, setWasWhole] = useState(wholeRoute);
  if (wholeRoute !== wasWhole) {
    setWasWhole(wholeRoute);
    if (wholeRoute && edit.routeOpen) edit.setRouteOpen(false);
  }
  // In the Plan never the box (the owner, 2026-11-05: "completely get rid
  // of the route box for in the plan").
  const routeFolded = routeEdit === "plan" || (routeEdit === "folded" && !edit.routeOpen && !addingStop);
  return { ...edit, ...line, addingStop, setAddingStop, addingChange, holdAsk, dropIntoRoute, clearRoute, routeFolded };
}
