import { AttributionControl } from "maplibre-gl";
import { useEffect, useState } from "react";
import { LEGAL_PAGES } from "../../legal";
import { wantScreen } from "../../navigation/wanted";
import { useGlMap } from "./glLayer";
import { useCredits } from "./creditStore";

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
 * is drawn and the sources' own (the overlay tiles' FAA cycle, the radar
 * loop's), in that order, as Apple Maps on the
 * web has Privacy | Terms | Legal | Imagery (the owner's screenshot,
 * 2026-11-10). One control, where each layer added its own at the bottom
 * left. With the sheet all the way up it gives way (index.css), and the
 * search's page carries the same links at its foot (SheetFooter).
 */
export function MapCredits() {
  const { map } = useGlMap();
  const credits = useCredits((s) => s.credits);
  const sources = useSourceCredits();
  useEffect(() => {
    // One string, in the row's order: MapLibre sorts its entries by
    // length and drops one held in another, so the sources' own come
    // after the links here and not again before them.
    const all = [...LINKS, ...Object.values(credits), ...sources.filter((c) => !Object.values(credits).includes(c))];
    const control = new AttributionControl({ compact: false, customAttribution: all.join(" | ") });
    map.addControl(control, "bottom-right");
    return () => {
      map.removeControl(control);
    };
  }, [map, credits, sources]);
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

/** The credits the map's sources carry (their `attribution`), as the
 *  style has them now. */
function useSourceCredits(): string[] {
  const { map } = useGlMap();
  const [credits, setCredits] = useState<string[]>([]);
  useEffect(() => {
    const read = () => {
      const now = [
        ...new Set(
          Object.values(map.getStyle()?.sources ?? {})
            .map((s) => ("attribution" in s ? s.attribution : undefined))
            .filter((a): a is string => !!a),
        ),
      ];
      setCredits((was) => (was.join("|") === now.join("|") ? was : now));
    };
    read();
    map.on("styledata", read);
    return () => {
      map.off("styledata", read);
    };
  }, [map]);
  return credits;
}
