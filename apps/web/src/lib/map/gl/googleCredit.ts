import { AttributionControl } from "maplibre-gl";
import { useEffect, useState } from "react";
import { GOOGLE, GOOGLE_REFERRER_POLICY } from "../sources/googleSession";
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
function useGoogleCredit(html: string | null) {
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

/** "Google Maps" and the copyright for what is in sight, asked of Google's
 *  viewport service at each rest, as its Map Tiles API's terms ask, while
 *  a session's tiles are drawn (`session` set). */
export function useGoogleAttribution(session: string | null, key: string | null) {
  const { map } = useGlMap();
  const [copyright, setCopyright] = useState("");
  useEffect(() => {
    if (!session || !key) return;
    let live = true;
    const ask = () => {
      const b = map.getBounds();
      const q = new URLSearchParams({
        session,
        key,
        zoom: String(Math.round(map.getZoom() + 1)),
        north: String(Math.min(89.9, b.getNorth())),
        south: String(Math.max(-89.9, b.getSouth())),
        east: String(Math.max(-179.9, Math.min(179.9, b.getEast()))),
        west: String(Math.max(-179.9, Math.min(179.9, b.getWest()))),
      });
      void fetch(`${GOOGLE}/tile/v1/viewport?${q}`, { referrerPolicy: GOOGLE_REFERRER_POLICY })
        .then((r) => (r.ok ? r.json() : null))
        .then((info: { copyright?: string } | null) => {
          if (live && info?.copyright) setCopyright(info.copyright);
        })
        .catch(() => {
          /* the copyright as it was */
        });
    };
    ask();
    map.on("moveend", ask);
    return () => {
      live = false;
      map.off("moveend", ask);
    };
  }, [map, session, key]);
  useGoogleCredit(
    session ? `<span aria-label="Google Maps" data-testid="google-credit">Google Maps</span>${copyright ? ` · ${copyright}` : ""}` : null,
  );
}
