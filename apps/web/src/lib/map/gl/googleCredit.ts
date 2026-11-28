import { AttributionControl } from "maplibre-gl";
import { useEffect, useState } from "react";
import { GOOGLE_REFERRER_POLICY } from "../sources/googleSession";
import { GOOGLE } from "../sources/imagery";
import { useGlMap } from "./glLayer";
import logoDay from "./google/GoogleMaps_Logo_DarkGray.svg";
import logoNight from "./google/GoogleMaps_Logo_White.svg";

/** Google's credit on the map itself while its tiles are drawn, in words
 *  always in sight: the stock MapLibre attribution laid out in full, not
 *  folded behind its (i). Google Maps Platform's Map Tiles API policies
 *  (developers.google.com/maps/documentation/tile/policies, read
 *  2026-11-11), "Display Google Maps attribution": "You must include clear
 *  Google Maps attribution when displaying content from Google Maps
 *  Platform APIs", the logo where possible (GOOGLE_MAPS_LOGO); and "Display Google's data
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

/** Google's own Google Maps logo, as its Map Tiles API policies ask
 *  "whenever possible" (a recommendation the owner took
 *  on 2026-11-21):
 *  the official files from Google's attribution assets
 *  (developers.google.com/maps/documentation/tile/policies, "Download the
 *  Google Maps attribution assets"), unaltered, at the 16 dp the policy
 *  sets as its least height, with its clear space (index.css). The credit
 *  sits on the page's own solid colour, a plain background, so it is the
 *  non-outlined logo: dark grey by day, white in a dark look, one shown
 *  (index.css). Its alt text is the "Google Maps" a screen reader says. */
const GOOGLE_MAPS_LOGO = [
  `<img class="google-maps-logo google-maps-logo-day" src="${logoDay}" alt="Google Maps">`,
  `<img class="google-maps-logo google-maps-logo-night" src="${logoNight}" alt="Google Maps">`,
].join("");

/** Google's logo and the copyright for what is in sight, asked of Google's
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
  useGoogleCredit(session ? `${GOOGLE_MAPS_LOGO}${copyright ? ` ${copyright}` : ""}` : null);
}
