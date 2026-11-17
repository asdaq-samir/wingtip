import { useCallback } from "react";
import type { PanelState } from "../../../lib/mapChrome";
import { useFplCards } from "./useFplCards";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanCards } from "./usePlanCards";
import type { PlanPicks } from "./usePlanPicks";
import type { PlanMapModel } from "./usePlanMap";
import type { PlanViewModel } from "./usePlanView";

/**
 * The cards over FPL, the Stops and the lists in full (useFplCards), and
 * the Profile opened from the route's button, for usePlanWorkspace.
 */
export function usePlanFpl(
  { routed, planned, address, setAddress }: PlanRoute,
  { s, course }: PlanAnswerModel,
  { briefOpen }: PlanCards,
  { setProceduresShown }: PlanPicks,
  { fix }: PlanMapModel,
  fuelStopPins: { ident: string }[],
  { view, setViewPick }: PlanViewModel,
  setPanel: (state: PanelState) => void,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const cards = useFplCards({
    view,
    routed,
    local: !!s.local,
    planned,
    fix,
    fuelStopPins,
    briefOpen,
    setViewPick,
    setPanel,
    address,
    setAddress,
    setProceduresShown,
  });
  const { openProfileCard } = cards;
  // The Profile opened, at rest, from the route's Profile button, where the map's Play opened it and flew its
  // dry run at once until the owner took Play off the map (2026-11-02:
  // "I don't want the play button there, just the mic"); the run is the
  // profile's own Dry run button. With a route to draw it for: the side
  // view is drawn only then (sideView).
  const openProfile = useCallback(() => {
    setViewPick("plan");
    openProfileCard();
  }, [setViewPick, openProfileCard]);
  return { ...cards, openProfile, profileReady: routed && !!course && !s.local };
}

/** The cards over FPL, as the workspace's hooks read them. */
export type PlanFpl = ReturnType<typeof usePlanFpl>;
