import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { googleMapsQuery } from "../../queryClient";
import { googleReferrer, googleTiles, useGoogleSession } from "../sources/googleSession";
import { useGlMap } from "./glLayer";
import { useGlView } from "./useGlView";
import { useGoogleAttribution } from "./googleCredit";

/**
 * Google's satellite imagery close in, under the chart (closeZoom), as
 * the address of its tiles, or null: asked for only once the map is a
 * level short of the chart's own last zoom (`tileMaxZoom`), so no session
 * or tile is fetched further out; null with no Google key (issue #210),
 * where the chart stays, enlarged, as before. Google's Map Tiles API, its
 * satellite map type without the roads layer, under the deployment's key
 * (docs/GOOGLE-MAPS.md); its credit, "Google Maps" and the copyright for
 * the view, on the map while the session is in use, as the API's policies
 * ask (googleCredit). The policies allow a hybrid view of Google's tiles
 * and other data where the attribution says which is Google's: the
 * chart's sources keep their own credit beside it (MapCredits).
 */
export function useCloseImagery(tileMaxZoom: number | null): string | null {
  const { map } = useGlMap();
  const { level } = useGlView();
  const near = tileMaxZoom != null && level >= tileMaxZoom - 1;
  const { data: google } = useQuery(googleMapsQuery);
  const { data: session } = useGoogleSession("imagery", near);
  const live = near && google && session ? session.session : null;
  useEffect(() => {
    if (live) map.setTransformRequest(googleReferrer);
  }, [map, live]);
  useGoogleAttribution(live, google?.key ?? null);
  return live && google ? googleTiles(live, google.key) : null;
}
