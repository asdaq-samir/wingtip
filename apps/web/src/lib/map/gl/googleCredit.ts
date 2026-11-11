import { AttributionControl } from "maplibre-gl";
import { useEffect } from "react";
import { useGlMap } from "./glLayer";

/** Google's credit on the map itself while its tiles are drawn, in words
 *  always in sight: the stock MapLibre attribution laid out in full, not
 *  folded behind its (i). Google Maps Platform's Map Tiles API policies
 *  (developers.google.com/maps/documentation/tile/policies, read
 *  2026-11-11), "Display Google Maps attribution": "You must include clear
 *  Google Maps attribution when displaying content from Google Maps
 *  Platform APIs", the logo where possible and "In cases where space is
 *  limited, the text Google Maps is acceptable"; and "Display Google's data
 *  attributions": the copyright the viewport answer gives (BaseGl), shown
 *  "usually the bottom right corner of the displayed set of tiles", folded
 *  only where it cannot fit, and then behind an element "labeled 'Data
 *  sources'" -- never a bare (i). */
export function useGoogleCredit(html: string | null) {
  const { map } = useGlMap();
  useEffect(() => {
    if (!html) return;
    const control = new AttributionControl({ compact: false, customAttribution: html });
    map.addControl(control, "bottom-right");
    return () => {
      map.removeControl(control);
    };
  }, [map, html]);
}
