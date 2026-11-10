import { MapPin } from "lucide-react";
import { useTabSearch } from "../../lib/tabSearch";
import { SearchField } from "../../../../components/PanelCapsule";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/**
 * A list's own field under the one search (PlanWorkspace's `head`): the
 * traffic's search for an airplane heard, or Nearest's place to measure
 * from, what is typed kept in features/plan/lib/tabSearch. One SearchField
 * in the one place whichever it is, so a switch between them changes its
 * props and keeps the field itself.
 */
export default function ListSearchField({ vm }: { vm: PlanWorkspaceModel }) {
  return vm.view === "traffic" ? aircraftSearch(vm) : nearSearch(vm);
}

/** The traffic's field, the search bar's shape. */
function aircraftSearch(vm: PlanWorkspaceModel) {
  const { aircraftInput, aircraftTyped, listAway, panel, pickingFavorite, pickingMine, quietFocus, setPanel, upAsTyped } = vm;
  return (
    <SearchField
      value={aircraftTyped}
      onChange={(aircraft) => {
        useTabSearch.setState({ aircraft });
        upAsTyped(aircraft);
      }}
      inputRef={aircraftInput}
      placeholder={
        pickingMine ? "Search for your airplane" : pickingFavorite ? "Search for an airplane to keep" : "Callsign, N-number or ICAO"
      }
      label="Find an airplane: callsign, registration or ICAO address"
      testId="aircraft-search"
      capitals
      // Up, the list under the field in sight -- not by an Add's focus,
      // which leaves the panel where it is (focusQuietly).
      onFocus={() => {
        listAway("aircraft-favorites");
        listAway("aircraft-recents");
        if (panel === "peek" && !quietFocus.current) setPanel("full");
      }}
      onCancel={() => {
        useTabSearch.setState({ aircraft: "", pickingMine: false, pickingFavorite: false });
        setPanel("peek");
      }}
      onSubmit={() => useTabSearch.getState().submitAircraft?.()}
    />
  );
}

/** Nearest's field: where the nearest fields are measured from. */
function nearSearch(vm: PlanWorkspaceModel) {
  const { nearTyped, panel, setPanel } = vm;
  return (
    <SearchField
      value={nearTyped}
      onChange={(near) => useTabSearch.setState({ near })}
      placeholder="Current position"
      label="Nearest to: a town, an address or an airport"
      testId="nearest-from"
      icon={MapPin}
      onFocus={() => {
        if (panel === "peek") setPanel("full");
      }}
      onCancel={() => setPanel("peek")}
      onSubmit={() => useTabSearch.getState().submitNear?.()}
      onClear={() => {
        const clear = useTabSearch.getState().clearNear;
        if (clear) clear();
        else useTabSearch.setState({ near: "" });
      }}
    />
  );
}
