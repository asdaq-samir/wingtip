import { PathLayer } from "@deck.gl/layers";
import { useDrawnStretch } from "./heightStretch";
import { useEffect, useMemo } from "react";
import { deckColour, deckSlot, useDeckLayers } from "../../../../lib/map/gl/deckLayers";
import { useGlMap } from "../../../../lib/map/gl/glLayer";
import { CHART } from "../../../../lib/tokens";
import { ALOFT_MIN_PX, ALOFT_WIDTH_M, curtainLayer } from "./curtain";
import { aloftPath, curtainWalls, type AloftPoint } from "./geometry";

/**
 * The route at the plan's altitudes in 3D: a magenta line in the air, and
 * a curtain from it down to the course drawn on the ground (RouteGl's
 * line, which lies on the 3D ground as the chart does). deck.gl's
 * PathLayer and walls (lib/map/gl/deckLayers) at metres above the sea,
 * the plan's own altitudes, stood up by the Heights' stretch as the
 * ground is; the ground hides the curtain's foot.
 */
export default function AloftGl({ points }: { points: AloftPoint[] }) {
  const { map } = useGlMap();
  const stretch = useDrawnStretch();
  const layers = useMemo(
    () => [
      curtainLayer("route-aloft-curtain", curtainWalls(points, stretch), CHART.course, 0.22),
      new PathLayer<number[][]>({
        id: "route-aloft",
        data: [aloftPath(points, stretch)],
        getPath: (p) => p as never,
        getColor: deckColour(CHART.course, 0.9),
        getWidth: ALOFT_WIDTH_M,
        widthUnits: "meters",
        widthMinPixels: ALOFT_MIN_PX,
        jointRounded: true,
        capRounded: true,
        ...deckSlot("route"),
      }),
    ],
    [points, stretch],
  );
  useDeckLayers("route-aloft", layers);
  // For the browser tests: the points the line is drawn through.
  useEffect(() => {
    const el = map.getContainer();
    el.dataset.routeAloft = String(points.length);
    return () => {
      delete el.dataset.routeAloft;
    };
  }, [map, points]);
  return null;
}
