import { useQuery } from "@tanstack/react-query";
import { nearestQuery } from "../../../lib/queryClient";
import { useMapCentre } from "../../../lib/map/mapCentre";
import { useSearchPanel } from "./useSearchPanel";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanCards } from "./usePlanCards";
import type { PlanMapModel } from "./usePlanMap";
import type { PlanViewModel } from "./usePlanView";

/**
 * The search bars (useSearchPanel), and the Nearest strip on the search's
 * own page, for usePlanWorkspace.
 */
export function usePlanSearch(
  { address, setAddress }: PlanRoute,
  { place, heldPoint, nearOpen, favoritesOpen, airportRecentsOpen, selectPlace, listAway }: PlanCards,
  { nearOrigin }: PlanMapModel,
  { view }: PlanViewModel,
) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  // The search's own page in sight (SearchHome), its Nearest asked for
  // while it is: the list's own question, shared.
  const homeShown = view === "search" && !place && !heldPoint && !nearOpen && !favoritesOpen && !airportRecentsOpen;
  // With no position, the fields nearest the map's middle (lib/map/mapCentre;
  // the UI audit's C9): the strip says which it is near (`nearMap`).
  const centre = useMapCentre();
  const near = nearOrigin ?? centre;
  const { data: nearStrip } = useQuery({ ...nearestQuery(near?.lat ?? 0, near?.lon ?? 0), enabled: homeShown && !!near });
  // The search bars (useSearchPanel).
  const panel = useSearchPanel({ view, selectPlace, listAway, address, setAddress });
  return { ...panel, nearStrip, nearMap: !nearOrigin && !!centre };
}
