import { useEffect, useState } from "react";
import { useGlMap } from "./glLayer";
import { useMapCredit } from "./creditStore";

/**
 * What the map's sources say of themselves -- the overlay tiles' FAA cycle,
 * the radar and satellite loop's source -- kept with the layers' own
 * (useMapCredit) for Status, the "On the map" rows. The map draws no row of
 * small print any more (the owner, 2026-11-11: "Yes status works"):
 * Privacy, Terms and Legal are at Settings' foot, every source and its
 * licence in About (components/dataSources), and the cycles in Status. Only
 * Google's credit stays on the map while its tiles are drawn (BaseGl's
 * GoogleCredit), as its Map Tiles API's policies ask.
 */
export function MapCredits() {
  const sources = useSourceCredits();
  useMapCredit("sources", sources.length ? sources.join(" · ") : null);
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
