import { AttributionControl } from "maplibre-gl";
import { useEffect } from "react";
import { create } from "zustand";
import { LEGAL_PAGES } from "../../legal";
import { wantScreen } from "../../navigation/wanted";
import { useGlMap } from "./glLayer";

/** The credits each layer owes its source while it is drawn (the imagery's,
 *  Google's, the traffic's), by the layer's own key. */
const useCredits = create<{ credits: Record<string, string> }>(() => ({ credits: {} }));

/** A layer's credit at the map's foot while it is drawn, as its source's
 *  terms ask; none (null) while it has none to give. */
export function useMapCredit(key: string, html: string | null) {
  useEffect(() => {
    if (!html) return;
    useCredits.setState((s) => ({ credits: { ...s.credits, [key]: html } }));
    return () =>
      useCredits.setState((s) => {
        const { [key]: _gone, ...rest } = s.credits;
        return { credits: rest };
      });
  }, [key, html]);
}

/** The legal links first, as Apple Maps on the web sets Privacy, Terms and
 *  Legal before its imagery's credit; Legal is About, where every data
 *  source and its licence is listed (components/dataSources). */
const LINKS = [
  ...LEGAL_PAGES.filter((p) => p.key !== "support").map(
    (p) => `<a href="${p.href}" target="_blank" rel="noopener">${p.key === "privacy" ? "Privacy" : "Terms"}</a>`,
  ),
  '<a href="?open=about" data-open-about="">Legal</a>',
];

/**
 * The map's one row of small print at its bottom right, just over the
 * sheet: Privacy | Terms | Legal, then each source's credit while its layer
 * is drawn (and the sources' own, the overlay tiles' FAA cycle among them,
 * which MapLibre's AttributionControl adds itself), as Apple Maps on the
 * web has Privacy | Terms | Legal | Imagery (the owner's screenshot,
 * 2026-11-10). One control, where each layer added its own at the bottom
 * left. With the sheet all the way up it gives way (index.css), and the
 * search's page carries the same links at its foot (SheetFooter).
 */
export function MapCredits() {
  const { map } = useGlMap();
  const credits = useCredits((s) => s.credits);
  useEffect(() => {
    const control = new AttributionControl({ compact: false, customAttribution: [...LINKS, ...Object.values(credits)] });
    map.addControl(control, "bottom-right");
    return () => {
      map.removeControl(control);
    };
  }, [map, credits]);
  // Legal opens About in the app, not the page again by its link.
  useEffect(() => {
    const el = map.getContainer();
    const open = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[data-open-about]")) return;
      event.preventDefault();
      wantScreen("about");
    };
    el.addEventListener("click", open);
    return () => el.removeEventListener("click", open);
  }, [map]);
  return null;
}
