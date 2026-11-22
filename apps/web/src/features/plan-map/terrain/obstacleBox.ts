import type { Map as MlMap } from "maplibre-gl";
import { glZoom } from "../../../lib/map/gl/glStyle";

export type ObstacleBox = { south: number; west: number; north: number; east: number };

/** The half-degree box round the view's middle, a degree each way at most,
 *  that the obstacles are asked for (the planner's /api/terrain/obstacles);
 *  null further out than zoom 9, where a post would be a pixel. The 3D
 *  posts (ObstaclesGl) and the hazard colouring's (HazardGl) ask the same. */
export function obstacleBox(map: MlMap): ObstacleBox | null {
  if (map.getZoom() < glZoom(9)) return null;
  // In -180 to 180: past the antimeridian the world's copy's centre is not.
  const c = map.getCenter().wrap();
  const out = (v: number, up: boolean) => (up ? Math.ceil(v * 2) : Math.floor(v * 2)) / 2;
  return { south: out(c.lat - 0.5, false), north: out(c.lat + 0.5, true), west: out(c.lng - 0.5, false), east: out(c.lng + 0.5, true) };
}

/** The obstacles' question for a box, one cache entry the two layers share. */
export const obstaclesKey = (box: ObstacleBox | null) => ["obstacles", box] as const;
