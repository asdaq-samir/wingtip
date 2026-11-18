import { useEffect, useEffectEvent, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { cameraOf } from "./camera";
import { glZoom } from "./glStyle";
import { PICK_ZOOM } from "../mapPick";

/**
 * The thing an address names (a VOR's `navaid`, a fix's, a VFR waypoint's
 * or an airspace volume's `mark`), found in the cycle's overlay tiles by
 * `find`: at once where they are loaded about the view, else once the map
 * has been taken there, in to a pick's zoom (PICK_ZOOM), and they have come
 * in. Undefined while looked for, null where it is not there (shut down,
 * or a link from another cycle), which its card says where it was asked.
 * `at.key` names the ask: a new object for the same thing is no new ask.
 */
export function useLinkedTileFeature<T>(
  map: MlMap,
  at: { key: string; lat: number; lon: number } | null,
  find: () => T | null,
): T | null | undefined {
  const [found, setFound] = useState<{ key: string; value: T | null }>();
  const look = useEffectEvent(find);
  const key = at?.key ?? "";
  const lat = at?.lat ?? 0,
    lon = at?.lon ?? 0;
  useEffect(() => {
    if (!key) return;
    if (!look()) cameraOf(map).pick([lon, lat], { zoom: Math.max(map.getZoom(), glZoom(PICK_ZOOM)), duration: 0 });
    const rest = () => setFound({ key, value: look() });
    map.once("idle", rest);
    map.triggerRepaint();
    return () => {
      map.off("idle", rest);
    };
    // Asked again by its key alone (`at` read by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return found?.key === key ? found.value : undefined;
}

/** Close enough to be the thing a link names: its place to four places
 *  (11 m), the tile's to the tile's own precision. */
export const NEAR_DEG = 0.01;
