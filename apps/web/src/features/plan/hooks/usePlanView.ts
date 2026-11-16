import { useEffect, useState } from "react";
import { usePanelDragging, type PanelState } from "../../../lib/mapChrome";
import { usePanelView } from "./usePanelView";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanCards } from "./usePlanCards";

/**
 * The place up under the one search and the sheet's size (usePlanWorkspace):
 * what each place keeps open over it (usePanelView) -- the plan, the
 * route's box and its nav log; the search's own page and its results --
 * the places opened so far, and how far out the panel is.
 */
export function usePlanView(
  { planned, load, routed, hasPoints, address, setAddress }: PlanRoute,
  { cards, setBackToView }: PlanCards,
  panel: PanelState,
  setPanel: (state: PanelState) => void,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { view, setViewPick, pickView, pickPage } = usePanelView({
    cards,
    // With Load's count, which Fly Here and Plan Again move: a route asked
    // for again, the same as the one up, brings the plan to the front as a
    // new one does. Keyed on the points alone, Fly Here to the airport the
    // route already went to left the sheet on Search (the owner's iPhone,
    // 2026-11-12: "When I tap fly here, it still shows the search sheet").
    route: `${planned.dep}|${planned.stops.join(",")}|${planned.dest}|${load}`,
    hasRoute: routed || hasPoints,
    address,
    setAddress,
  });
  // The places opened so far, each kept under the others once it has been
  // (TabKept): back to one, it is as it was left, a list scrolled where it
  // was. Built again from nothing at every switch, a switch to the plan
  // was mostly its pills and pickers being made (50 to 80 ms at a phone's
  // speed, the 23 Oct profile).
  const [opened, setOpened] = useState(() => [view]);
  if (!opened.includes(view)) setOpened([...opened, view]);
  // An airplane's card's close goes back to the place it was opened over
  // (usePlaceCards' closeFlight), by the view's own setter.
  useEffect(() => {
    setBackToView(setViewPick);
  }, [setBackToView, setViewPick]);
  // The strips and lists drawn under the pill too while the sheet is on
  // the move, so they are there as it comes up: read as one answer with
  // the size, so a move between half and full -- where they are drawn
  // either way -- does not draw the whole workspace again at its start
  // and its end (the drag probe at CPU 4x, 2026-11-04: 100 to 170 ms each,
  // with the map's follow of the sheet waiting behind them).
  const stripsDrawn = usePanelDragging((d) => panel !== "peek" || d.dragging);
  return {
    panel,
    setPanel,
    // The panel out at all: the nav log is in sight, and a checkpoint
    // picked on the map opens its section.
    panelOpen: panel !== "peek",
    // A tab tapped takes the panel all the way up to show it; the tab up
    // tapped again there takes it back to half, at the pilot's ask.
    // In sight all the way up: half way the panel ends at the tabs, so a
    // checkpoint picked then is brought into view as it comes up.
    drawerOpen: panel === "full",
    view,
    setViewPick,
    pickView,
    pickPage,
    opened,
    stripsDrawn,
  };
}

/** The place up and the sheet's size, as the workspace's hooks read them. */
export type PlanViewModel = ReturnType<typeof usePlanView>;
