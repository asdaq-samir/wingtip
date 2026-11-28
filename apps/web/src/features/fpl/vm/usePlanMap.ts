import type { PanelState } from "../../../lib/mapChrome";
import { useMapPins } from "./useMapPins";
import { useFlyHere } from "./useFlyHere";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanCards } from "./usePlanCards";
import { useKept } from "./useKept";

/**
 * Where the map is brought to (useMapPins), and Fly Here from a card on
 * it (useFlyHere), for usePlanWorkspace.
 */
export function usePlanMap(
  route: PlanRoute,
  { course, aircraft }: PlanAnswerModel,
  { place, heldPoint, nearFrom, nearOpen }: PlanCards,
  setPanel: (state: PanelState) => void,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { planned, depart, load, setLoad, showWaypoints, flightRules, setAddress } = route;
  // Where the map is brought to (useMapPins).
  const pins = useMapPins({ place, heldPoint, nearFrom, nearOpen, planned, course });
  // Fly Here (useFlyHere).
  const { flyHere } = useFlyHere({ planned, place, depart, aircraft, load, setLoad, showWaypoints, flightRules, setPanel, setAddress });
  // One object while nothing in it changes (useKept), as each slice is.
  return useKept({ ...pins, flyHere });
}

/** Where the map is brought to, as the workspace's hooks read it. */
export type PlanMapModel = ReturnType<typeof usePlanMap>;
