import type { ComponentProps } from "react";
import { MapPin } from "lucide-react";
import { useTabSearch } from "../../lib/tabSearch";
import type { SearchField } from "../../../../components/PanelCapsule";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

type ListSearch = ComponentProps<typeof SearchField>;

/**
 * The one search scoped to a list (the one card rule, the owner
 * 2026-11-10: one search field): with the traffic up, the field finds an
 * airplane heard; with Nearest, it takes the place to measure from. It
 * was a second field under the one search (PlanWorkspace's `head`); now
 * the one search's own field says and does this (OneSearchField's
 * `list`), what is typed kept in features/plan/lib/tabSearch. None
 * elsewhere: the field is the search's.
 */
export function listSearchOf(vm: PlanWorkspaceModel): ListSearch | null {
  return vm.view === "traffic" ? aircraftSearch(vm) : vm.nearOpen ? nearSearch(vm) : null;
}

/** The traffic's: an airplane by its callsign, registration or address. */
function aircraftSearch(vm: PlanWorkspaceModel): ListSearch {
  const { aircraftInput, aircraftTyped, listAway, pickingFavorite, pickingMine, pickView, routed } = vm;
  return {
    value: aircraftTyped,
    onChange: (aircraft) => useTabSearch.setState({ aircraft }),
    inputRef: aircraftInput,
    placeholder: pickingMine
      ? "Search for your airplane"
      : pickingFavorite
        ? "Search for an airplane to keep"
        : "Callsign, N-number or ICAO",
    label: "Find an airplane: callsign, registration or ICAO address",
    testId: "aircraft-search",
    capitals: true,
    // The list under the field in sight; the sheet stays where the pilot
    // put it (the owner, 2026-11-11), the keyboard the Drawer's to place.
    onFocus: () => {
      listAway("aircraft-favorites");
      listAway("aircraft-recents");
    },
    // Cancel leaves the traffic for the search's own scope again (the plan
    // with a route), the field being the one search's; the sheet stays at
    // the size the pilot left it (the owner, 2026-11-11).
    onCancel: () => {
      useTabSearch.setState({ aircraft: "", pickingMine: false, pickingFavorite: false });
      pickView(routed ? "plan" : "search");
    },
    onSubmit: () => useTabSearch.getState().submitAircraft?.(),
  };
}

/** Nearest's: where the nearest fields are measured from. */
function nearSearch(vm: PlanWorkspaceModel): ListSearch {
  const { nearTyped } = vm;
  return {
    value: nearTyped,
    onChange: (near) => useTabSearch.setState({ near }),
    placeholder: "Current position",
    label: "Nearest to: a town, an address or an airport",
    testId: "nearest-from",
    icon: MapPin,
    // Escape only lets the field go (SearchField blurs it): the sheet stays
    // at the size the pilot left it (the owner, 2026-11-11).
    onCancel: () => undefined,
    onSubmit: () => useTabSearch.getState().submitNear?.(),
    onClear: () => {
      const clear = useTabSearch.getState().clearNear;
      if (clear) clear();
      else useTabSearch.setState({ near: "" });
    },
  };
}
