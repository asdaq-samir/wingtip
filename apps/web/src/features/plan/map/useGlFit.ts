import { useContext, useEffect } from "react";
import { MapInsetsContext, SHEET_SECONDS } from "../../../lib/mapChrome";
import { prefersReducedMotion } from "../../../lib/motion";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { useGlMap } from "../../../lib/map/gl/glLayer";
import { glZoom } from "../../../lib/map/gl/glStyle";
import { FIT_MARGIN } from "../../../lib/map/clear";

/**
 * The map fitted to `points`, clear of the panel and the map's buttons,
 * flown there in the sheet's time, when `fitKey` changes (Nearest's
 * fields, a leg picked, a procedure, a pattern, the Stops). Not past
 * `maxZoom`, in the app's levels. Own ship stops
 * pulling the map back, as a route's fit stops it.
 */
export function useGlFit(points: { lat: number; lon: number }[], fitKey: string | null, maxZoom = 11, cover = { top: 0, bottom: 0 }) {
  const { map } = useGlMap();
  const insets = useContext(MapInsetsContext);
  // Over the map's own padding (the panel's room, which MapLibre adds):
  // what a sheet over the panel covers beyond it.
  const top = Math.max(0, cover.top - insets.top),
    bottom = Math.max(0, cover.bottom - insets.bottom);
  useEffect(() => {
    if (!fitKey || points.length === 0) return;
    const ownShip = useOwnShip.getState();
    if (ownShip.enabled && ownShip.follow) ownShip.setFollow(false);
    const lats = points.map((p) => p.lat),
      lons = points.map((p) => p.lon);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        padding: { ...FIT_MARGIN, top: FIT_MARGIN.top + top, bottom: FIT_MARGIN.bottom + bottom },
        maxZoom: glZoom(maxZoom),
        duration: prefersReducedMotion() ? 0 : SHEET_SECONDS * 2000,
      },
    );
    // Once a key: the points are that key's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, maxZoom, top, bottom]);
}
