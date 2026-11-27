import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { nearestQuery } from "../../../lib/queryClient";
import { useSearchCentre } from "./useSearchCentre";
import { useSearchPanel } from "../search/useSearchPanel";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanCards } from "./usePlanCards";
import type { PlanMapModel } from "./usePlanMap";
import type { PlanViewModel } from "./usePlanView";
import { useKept } from "./useKept";

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
  // the UI audit's C9): the strip says which it is near (`nearMap`). Only
  // while that page asks, so a pan elsewhere draws nothing here (useSearchCentre).
  const asked = useSearchCentre(homeShown && !nearOrigin);
  // Kept as it was while the page is put away under a card: a right-click's
  // held point or a place opened hides the home, and the strip, its centre
  // gone, fell back to Show My Position under the opening card, the
  // sections under it moving (airspace.spec's "drawn once", a layout shift
  // of 0.021 against 0.01, the night of 2026-11-27). Unchanged while hidden,
  // a pan elsewhere still draws nothing here.
  const [kept, setKept] = useState(asked);
  if (homeShown && asked !== kept) setKept(asked);
  const centre = homeShown ? asked : kept;
  const near = nearOrigin ?? centre;
  const { data: nearStrip } = useQuery({ ...nearestQuery(near?.lat ?? 0, near?.lon ?? 0), enabled: homeShown && !!near });
  // The search bars (useSearchPanel).
  const panel = useSearchPanel({ selectPlace, listAway, address, setAddress });
  // One object while nothing in it changes (useKept), as each slice is.
  return useKept({ ...panel, nearStrip, nearMap: !nearOrigin && !!centre });
}
