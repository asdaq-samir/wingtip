import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { useGlMap } from "../glLayer";
import { DEM } from "./dem";
import { aloftFeatures, aloftPieces, type AloftPoint } from "./geometry";
import { setExtrusionData, useExtrusion } from "./useExtrusion";

/** The ground at a point as the 3D map stands things on it, metres: the
 *  same tiles its extrusions read (MapLibre's queryTerrainElevation); null
 *  on a flat map. */
const groundOf = (map: MlMap) => (mid: [number, number]) => map.queryTerrainElevation(mid);

/**
 * The route at the plan's altitudes in 3D: a magenta band in the air, and
 * a curtain from it down to the course drawn on the ground (RouteGl's
 * line, which lies on the 3D ground as the chart does). Each piece lifted
 * by its altitude less the ground at its middle (geometry's aloftFeatures),
 * read again as finer terrain tiles come in.
 */
export default function AloftGl({ points }: { points: AloftPoint[] }) {
  const { map } = useGlMap();
  useExtrusion(map, "route-aloft-curtain", {
    type: "fill-extrusion",
    paint: { "fill-extrusion-color": "#c0309f", "fill-extrusion-opacity": 0.22, "fill-extrusion-base": 0, "fill-extrusion-height": ["get", "top"] },
  });
  useExtrusion(map, "route-aloft", {
    type: "fill-extrusion",
    paint: { "fill-extrusion-color": "#c0309f", "fill-extrusion-opacity": 0.9, "fill-extrusion-base": ["get", "bottom"], "fill-extrusion-height": ["get", "top"] },
  });
  // The band 150 m across and 30 m deep, a few points at the zooms 3D is
  // looked at; the curtain a wall 20 m thick under it.
  const band = useMemo(() => aloftPieces(points, 150), [points]);
  const wall = useMemo(() => aloftPieces(points, 20), [points]);
  useEffect(() => {
    let timer = 0;
    const lift = () => {
      const ground = groundOf(map);
      setExtrusionData(map, "route-aloft", aloftFeatures(band, ground, 30));
      setExtrusionData(map, "route-aloft-curtain", aloftFeatures(wall, ground, null));
    };
    lift();
    // Again as the terrain's tiles come in, a quarter second after the
    // last, not at each.
    const came = (e: { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId !== DEM || !e.tile) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(lift, 250);
    };
    map.on("sourcedata", came);
    const el = map.getContainer();
    el.dataset.routeAloft = String(band.length);
    return () => {
      window.clearTimeout(timer);
      map.off("sourcedata", came);
      delete el.dataset.routeAloft;
    };
  }, [map, band, wall]);
  return null;
}
