import { useCallback, useState } from "react";
import { useIsMobile } from "../../../hooks/use-mobile";
import { positionIdent, stopsOf } from "../../../lib/identSchema";
import { useGeo, type LatLon } from "../../../lib/geo";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { ADDRESS_CLEARED } from "../../../lib/address";
import type { PanelState } from "../../../lib/mapChrome";
import { riseToSee, directKeys, panelNow, procsWithoutDirect } from "../../plan";
import { useRouteListEdit, useRouteLine } from "../../route";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanViewModel } from "./usePlanView";
import type { PlanPicks } from "./usePlanPicks";
import { coursePoints } from "../../../lib/course";

/**
 * FPL's route as a list and a line (usePlanWorkspace): folded to its one
 * line, or open to edit (the one layout, decision 0046), its points edited
 * in place (useRouteListEdit), a stop being added, a point dropped on the
 * map into it, its close, and the Routes' chips (useRouteLine).
 */
export function usePlanRouteList(
  route: PlanRoute,
  { course, ways, own }: PlanAnswerModel,
  { setViewPick, panel, panelOpen }: PlanViewModel,
  { proceduresAt }: Pick<PlanPicks, "proceduresAt">,
  setPanel: (state: PanelState) => void,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { planned, hasPoints, routePoints, setRoute, setStops, setAddress, wholeRoute, fuelParam, flightRules } = route;
  // Add Stop open: from its own button, or from no legal altitude's --
  // "via", its Fly via round a Class B, the ways round suggested.
  const [addingStop, setAddingStop] = useState<false | "stop" | "via">(false);
  // FPL's list edited in place (useRouteListEdit).
  const { setAddAt, ...edit } = useRouteListEdit({ stops: planned.stops, course, routePoints, setRoute, setAddingStop });
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
    ownAltitudeFt: own.altitudeFt,
    setStops,
    flightRules,
  });
  // Folded to its one line once whole, and open to edit (its airport
  // cards, Add a Stop, the route's field and the figures under them)
  // (decision 0046). On a phone the sheet's height drives it, as Apple
  // Maps shows more as its sheet rises (the coordinator's rule after the
  // owner's iPhone screenshot of a blank full sheet, 2026-11-17): at half
  // and the pill it is folded, all the way up it is open, so a full sheet
  // is never blank. A tap on the line opens it and raises the sheet; Done
  // folds it and lowers it to half. Before it is whole it is always open,
  // its two ends' cards to fill. Made whole a point at a time, or typed or
  // pasted into its field, it stays open for the pilot to go on; arriving
  // whole at once from elsewhere -- Fly Here, a link, a Saved flight -- it
  // folds, unless the sheet is all the way up. Never folded while its field
  // has the focus (what is typed is not yet sent).
  const onPhone = useIsMobile();
  const full = onPhone && panel === "full";
  const [wasWhole, setWasWhole] = useState(wholeRoute);
  const [hadPoints, setHadPoints] = useState(hasPoints);
  // Whether the focus is in the open route (RouteEditor), its field typed in.
  const [editorFocused, setEditorFocused] = useState(false);
  if (wholeRoute !== wasWhole || hasPoints !== hadPoints) {
    setWasWhole(wholeRoute);
    setHadPoints(hasPoints);
    if (wholeRoute && !wasWhole) edit.setRouteOpen(hadPoints || editorFocused || full);
    if (!hasPoints) edit.setRouteOpen(false);
  }
  // The sheet's height, as last seen: a move to full opens the route, a
  // move down from it folds it (on a phone).
  const [heightWas, setHeightWas] = useState<boolean | null>(null);
  if (onPhone && heightWas !== full) {
    setHeightWas(full);
    if (full && wholeRoute) edit.setRouteOpen(true);
    else if (!full && heightWas !== null && !editorFocused) edit.setRouteOpen(false);
  }
  // A hold or a procedure asked for from elsewhere (the map's Hold Here, a
  // voice's "the ILS one nine right at Milwaukee") opens the route, whose
  // list draws them: once for each ask, once the sheet is up.
  const asked = holdAsk ?? proceduresAt;
  const [askSeen, setAskSeen] = useState<typeof asked>(null);
  if (asked && asked !== askSeen && panelOpen && wholeRoute) {
    setAskSeen(asked);
    edit.setRouteOpen(true);
  }
  const routeFolded = wholeRoute && !edit.routeOpen && !addingStop;
  const { setRouteOpen } = edit;
  // The line tapped: open, and on a phone all the way up for its room.
  const openRoute = useCallback(() => {
    setRouteOpen(true);
    if (onPhone && panelNow.current !== "full") setPanel("full");
  }, [setRouteOpen, setPanel, onPhone]);
  // Done: folded again, and on a phone back down to half, where it reads.
  const foldRoute = useCallback(() => {
    setRouteOpen(false);
    setAddingStop(false);
    setAddAt(null);
    if (onPhone && panelNow.current === "full") setPanel("half");
  }, [setRouteOpen, setAddAt, setPanel, onPhone]);
  return {
    ...edit,
    ...line,
    addingStop,
    setAddingStop,
    addingChange,
    holdAsk,
    dropIntoRoute,
    clearRoute,
    routeFolded,
    openRoute,
    foldRoute,
    setEditorFocused,
  };
}
