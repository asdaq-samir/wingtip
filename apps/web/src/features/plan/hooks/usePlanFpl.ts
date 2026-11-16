import type { PanelState } from "../../../lib/mapChrome";
import { useFplCards } from "./useFplCards";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanCards } from "./usePlanCards";
import type { PlanPicks } from "./usePlanPicks";
import type { PlanMapModel } from "./usePlanMap";
import type { PlanViewModel } from "./usePlanView";

/**
 * FPL's tabs, the Stops and the lists in full (useFplCards), and whether
 * the Profile's tab is offered, for usePlanWorkspace.
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
  // The Profile's tab only where the side view is drawn: a route planned,
  // not a local flight (ProfileSideView).
  return { ...cards, profileReady: routed && !!course && !s.local };
}

/** The cards over FPL, as the workspace's hooks read them. */
export type PlanFpl = ReturnType<typeof usePlanFpl>;
