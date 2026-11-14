import { useQuery } from "@tanstack/react-query";
import { useDrawnStretch } from "./heightStretch";
import type { Map as MlMap } from "maplibre-gl";
import { useEffect } from "react";
import { api } from "../../../../lib/api/client";
import { EMPTY, useGlMap } from "../../../../lib/map/gl/glLayer";
import { glZoom } from "../../../../lib/map/gl/glStyle";
import { useGlView } from "../../../../lib/map/gl/useGlView";
import { obstacleFeatures } from "./geometry";
import { setExtrusionData, useExtrusion } from "./useExtrusion";
import { CHART } from "../../../../lib/tokens";

type Box = { south: number; west: number; north: number; east: number };

/** The half-degree box round the view's middle, a degree each way at most,
 *  that the obstacles are asked for; null further out than zoom 9, where
 *  a post would be a pixel. */
function obstacleBox(map: MlMap): Box | null {
  if (map.getZoom() < glZoom(9)) return null;
  // In -180 to 180: past the antimeridian the world's copy's centre is not.
  const c = map.getCenter().wrap();
  const out = (v: number, up: boolean) => (up ? Math.ceil(v * 2) : Math.floor(v * 2)) / 2;
  return { south: out(c.lat - 0.5, false), north: out(c.lat + 0.5, true), west: out(c.lng - 0.5, false), east: out(c.lng + 0.5, true) };
}

/**
 * The FAA's Digital Obstacle File's obstacles round the view, 200 ft and
 * taller (the planner's /api/terrain/obstacles), each a dark red post as
 * tall above its ground as the file says, a brighter red from 1,000 ft:
 * the towers a tilted chart shows standing, as the sectional's obstacle
 * symbols say they do; stood up by the Heights' stretch, as the ground
 * under them is.
 */
export default function ObstaclesGl() {
  const { map } = useGlMap();
  useExtrusion(map, "obstacles-3d", {
    type: "fill-extrusion",
    minzoom: glZoom(9),
    paint: {
      "fill-extrusion-color": ["case", [">=", ["get", "agl"], 1000], CHART.warning, CHART.obstacle],
      "fill-extrusion-opacity": 0.95,
      "fill-extrusion-height": ["get", "height"],
    },
  });
  const { box } = useGlView(obstacleBox, "rest");
  const stretch = useDrawnStretch();
  const { data } = useQuery({
    queryKey: ["obstacles", box],
    queryFn: () => api.obstacles(box!),
    enabled: !!box,
    staleTime: 60 * 60 * 1000,
    placeholderData: (was) => was,
    meta: { silent: true },
  });
  useEffect(() => {
    // 60 m across: a post a few points wide close in.
    setExtrusionData(map, "obstacles-3d", data ? obstacleFeatures(data.obstacles, 60, stretch) : EMPTY);
    map.getContainer().dataset.obstacles = String(data?.obstacles.length ?? 0);
  }, [map, data, stretch]);
  return null;
}
