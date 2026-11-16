import type { PanelState } from "../../../lib/mapChrome";
import type { PanelList } from "./usePanelView";
import { usePlaceCards } from "./usePlaceCards";
import type { PlanRoute } from "./usePlanRoute";

/**
 * The cards over the tabs and the lists in full (usePlanWorkspace): an
 * airport's, a point's, an airplane's, a past flight's (usePlaceCards),
 * and which of the lists -- the Favorites and Recents, airports' and
 * airplanes' together, the routes planned -- is the one open.
 */
export function usePlanCards({ address, setAddress }: PlanRoute, setPanel: (state: PanelState) => void) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const placeCards = usePlaceCards({ address, setAddress, setPanel });
  const { list, closeList } = placeCards.cards;
  // That list put away, where it is the one open: a search field's focus
  // and an Add take the list's place.
  const listAway = (name: PanelList) => {
    if (list === name) closeList();
  };
  return {
    ...placeCards,
    ...placeCards.cards,
    // The lists in full, the address's (`list`, useAddressCards), kept for
    // their place as its cards are.
    favoritesOpen: list === "favorites",
    airportRecentsOpen: list === "recents",
    routeRecentsOpen: list === "routes",
    listAway,
    // A field's or a point's card over the place up, its own out of sight.
    cardUp: !!placeCards.cards.place || !!placeCards.cards.heldPoint,
  };
}

/** The cards over the tabs, as the workspace's hooks read them. */
export type PlanCards = ReturnType<typeof usePlanCards>;
