import type { ComponentProps } from "react";
import { MapPin } from "lucide-react";
import { useTabSearch } from "../../lib/tabSearch";
import type { SearchField } from "../../../../components/PanelCapsule";

type ListSearch = ComponentProps<typeof SearchField>;

/**
 * Nearest's field, where the nearest fields are measured from (the one card
 * rule, the owner 2026-11-10: one search field, scoped to the list it is
 * over), drawn at the top of its card (NearestCard): Nearest is a card, its
 * own drawer over the sheet (the card rule's 3), so the sheet's first row
 * is under it while it is open and the place could not be typed there
 * (nearest.spec's smoke test, 2026-11-12). The traffic's scoped field went
 * for the one search, which finds airplanes too (the owner, 2026-11-14).
 * `nearTyped` is what is typed in it (features/plan/lib/tabSearch's `near`).
 */
export function nearSearch(nearTyped: string): ListSearch {
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
