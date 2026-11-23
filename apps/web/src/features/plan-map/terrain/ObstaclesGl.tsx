import { useQuery } from "@tanstack/react-query";
import { useDrawnStretch } from "./heightStretch";
import { useEffect } from "react";
import { api } from "../../../lib/api/client";
import { EMPTY, useGlMap } from "../../../lib/map/gl/glLayer";
import { glZoom } from "../../../lib/map/gl/glStyle";
import { useGlView } from "../../../lib/map/gl/useGlView";
import { obstacleFeatures } from "./geometry";
import { obstacleBox, obstaclesKey } from "./obstacleBox";
import { setExtrusionData, useExtrusion } from "./useExtrusion";
import { CHART } from "../../../lib/tokens";

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
    queryKey: obstaclesKey(box),
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
