import { useCallback, useState } from "react";
import { positionIdent, stopsOf } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { useGeo, type LatLon } from "../../../lib/geo";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { ADDRESS_CLEARED } from "../../../lib/address";
import type { PanelState } from "../../../lib/mapChrome";
import { riseToSee, directKeys, procsWithoutDirect } from "../../plan";
import { useRouteListEdit, useRouteLine } from "../../route";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanViewModel } from "./usePlanView";
import { coursePoints } from "../../../lib/course";
import { useRoutesShown } from "./useRoutesShown";

/**
 * FPL's route as a list and a line (usePlanWorkspace): its timeline, its
 * points edited in place (useRouteListEdit), its field open while it is
 * not yet whole or is typed in (decision 0046), a point dropped on the
 * map into it, its close, the Routes' chips (useRouteLine), and whether
 * they are out (useRoutesShown).
 */
export function usePlanRouteList(
  route: PlanRoute,
  { course, ways, own, s }: PlanAnswerModel,
  { setViewPick }: PlanViewModel,
  setPanel: (state: PanelState) => void,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { planned, hasPoints, routePoints, setRoute, setStops, setAddress, wholeRoute, fuelParam, flightRules } = route;
  // A stop being typed into the route's field (RouteBox's own Add a Stop).
  const [addingStop, setAddingStop] = useState<false | "stop">(false);
  // FPL's list edited in place (useRouteListEdit).
  const { setAddAt, ...edit } = useRouteListEdit({
    dep: planned.dep,
    dest: planned.dest,
    stops: planned.stops,
    course,
    routePoints,
    setRoute,
  });
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
      const points = coursePoints(course);
      const index = geo.bestStopIndex(points, at);
      const ship = useOwnShip.getState();
      const fix = ship.enabled ? ship.fix : null;
      setAddress((prev) => {
        const stops = stopsOf(prev.stops);
        const withIt = [...stops.slice(0, index), ident, ...stops.slice(index)];
        const away = { place: null, at: null };
        if (then !== "direct") return { ...away, stops: withIt.join(",") };
        return {
          ...away,
          dep: fix ? positionIdent(fix) : undefined,
          stops: [ident, ...stops.slice(index)].join(","),
          ...directKeys(prev, ident),
          // One direct at a time, as directToPoint's.
          procs: procsWithoutDirect(prev.procs),
        };
      });
      // FPL's list in sight, its new row and the hold's sheet with it: up
      // to half from the pill, else where the pilot left the sheet.
      setViewPick("plan");
      riseToSee(setPanel);
      if (then === "hold") {
        // `ident@visit@stamp`: which visit of the point is the new stop, for
        // its own leg's course (useRouteSheets).
        const seen = planned.stops.slice(0, index).filter((s) => sameField(s, ident)).length;
        setHoldAsk(`${ident}@${seen}@${Date.now()}`);
      }
    },
    [geo, course, planned.stops, setAddress, setPanel, setViewPick],
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
    ownAltitudeFt: own.altitudeFt,
    setStops,
    flightRules,
  });
  // The suggested routes out for this route's two ends, put away as they
  // change or the ways go (useRoutesShown).
  const shown = useRoutesShown(line.routeLine ? `${planned.dep}-${planned.dest}` : null);
  // The route open to edit while there is no whole route -- a new plan,
  // half a route, its timeline with the ends to pick -- and while a route
  // is typed or pasted into its field (RouteEditor), till its Done (decision 0046, the owner's
  // two-row timeline of 2026-11-17: the timeline is where the route is
  // edited, at any height of the sheet). Made whole by a pick of the one
  // search, or arriving whole from elsewhere -- Fly Here, a link, a Saved
  // flight -- it is the timeline alone. Never folded while its field has
  // the focus (what is typed is not yet sent).
  const [wasWhole, setWasWhole] = useState(wholeRoute);
  const [hadPoints, setHadPoints] = useState(hasPoints);
  // Whether the focus is in the route's field (RouteEditor).
  const [editorFocused, setEditorFocused] = useState(false);
  if (wholeRoute !== wasWhole || hasPoints !== hadPoints) {
    setWasWhole(wholeRoute);
    setHadPoints(hasPoints);
    if (wholeRoute && !wasWhole) edit.setRouteOpen(editorFocused);
    if (!hasPoints) edit.setRouteOpen(false);
  }
  // The route's field open (RouteEditor): asked for -- the timeline's Type
  // or Paste a Route before the route is whole, More's Type the Route
  // after -- a stop being typed into it, or a point the planner does not
  // know, which it says with its Remove (RouteBox), its line on the
  // timeline red with why. Before the route is whole the timeline is
  // open to edit with the field folded till it is asked for (the owner,
  // 2026-11-18: the empty route drawn as the whole one is).
  const boxOpen = edit.routeOpen || !!addingStop || !!s.unknownPlace;
  const routeFolded = wholeRoute && !boxOpen;
  const { setRouteOpen } = edit;
  // Done: the field folded away, the timeline alone.
  const foldRoute = useCallback(() => {
    setRouteOpen(false);
    setAddingStop(false);
    setAddAt(null);
  }, [setRouteOpen, setAddAt]);
  return {
    ...edit,
    ...line,
    ...shown,
    addingStop,
    setAddingStop,
    addingChange,
    holdAsk,
    dropIntoRoute,
    clearRoute,
    boxOpen,
    routeFolded,
    foldRoute,
    setEditorFocused,
  };
}
