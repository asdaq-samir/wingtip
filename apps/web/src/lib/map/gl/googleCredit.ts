import { AttributionControl } from "maplibre-gl";
import { useEffect } from "react";
import { useGlMap } from "./glLayer";

/** Google's copyright on the map itself while its tiles are drawn, as
 *  Google's Map Tiles API policies ask of every map that shows them: the
 *  stock MapLibre attribution at its smallest, the (i) that opens to it. */
export function useGoogleCredit(html: string | null) {
  const { map } = useGlMap();
  useEffect(() => {
    if (!html) return;
    const control = new AttributionControl({ compact: true, customAttribution: html });
    map.addControl(control, "bottom-right");
    return () => {
      map.removeControl(control);
    };
  }, [map, html]);
}
