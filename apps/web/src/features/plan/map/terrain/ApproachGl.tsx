import { useQuery } from "@tanstack/react-query";
import { PathLayer } from "@deck.gl/layers";
import { useEffect, useMemo } from "react";
import type { ProcedureDrawing } from "../../../../lib/api/types";
import { deckColour, deckSlot, useDeckLayers } from "../../../../lib/map/gl/deckLayers";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../../../../lib/map/gl/glLayer";
import { useGeo } from "../../../../lib/geo";
import { airportQuery } from "../../../../lib/queryClient";
import { usePreferences } from "../../../../lib/preferences";
import { CHART } from "../../../../lib/tokens";
import { curtainLayer } from "./curtain";
import { aloft, approachScene, centrelineFeatures, pickedApproach, ringPoints } from "./approachScene";
import { aloftPath, curtainWalls } from "./geometry";

/** The lines in the air, metres across: the glidepath and the approach a
 *  little narrower than the route's 150 m (AloftGl), the ring narrower
 *  again, so the runway's way in reads under the route's own magenta. */
const GLIDE_M = 60;
const PATH_M = 90;
const RING_M = 45;

/**
 * The way in to a field in 3D (TerrainGl mounts it for the route's
 * destination, or the field whose card is open): each runway's extended
 * centreline dashed on the ground, the glidepath to its threshold in the
 * air, the approach picked there at its altitudes with a curtain down to
 * its ground track (as AloftGl hangs the route's), and a ring at the
 * pattern's altitude. Every figure is the engine's (approachScene); the
 * lines in the air are deck.gl's PathLayer at metres above the sea.
 */
export default function ApproachGl({ ident, picked }: { ident: string; picked: ProcedureDrawing[] }) {
  const { map } = useGlMap();
  const { data: field } = useQuery(airportQuery(ident));
  const approach = useMemo(() => pickedApproach(ident, picked), [ident, picked]);
  const scene = useMemo(() => (field ? approachScene(field, approach) : null), [field, approach]);

  // On the ground: under the route, over the chart and the imagery, so
  // the 3D ground drapes it as it does the chart.
  useGlLayer("lines", { "approach-centreline": { type: "geojson", data: EMPTY } }, [
    {
      id: "approach-centreline",
      type: "line",
      source: "approach-centreline",
      layout: { "line-cap": "butt" },
      paint: { "line-color": CHART.centreline, "line-width": 2, "line-opacity": 0.9, "line-dasharray": [4, 3] },
    },
  ]);
  useGlData("approach-centreline", scene ? centrelineFeatures(scene) : null);

  const geo = useGeo();
  // The lines in the air stood up by the Heights' stretch, as the ground is.
  const stretch = usePreferences((s) => s.heightStretch);
  const layers = useMemo(() => {
    if (!scene) return [];
    const path = scene.path ? aloft(scene.path) : [];
    const lines = [
      ...scene.glidepaths.map((g) => ({ path: aloftPath(aloft(g.points), stretch), colour: CHART.glidepath, width: GLIDE_M })),
      ...(path.length > 1 ? [{ path: aloftPath(path, stretch), colour: CHART.procedure, width: PATH_M }] : []),
      ...(scene.ring && geo ? [{ path: aloftPath(ringPoints(geo, scene), stretch), colour: CHART.pattern, width: RING_M }] : []),
    ];
    return [
      curtainLayer("approach-curtain", curtainWalls(path, stretch), CHART.procedure, 0.2),
      new PathLayer<(typeof lines)[number]>({
        id: "approach-aloft",
        data: lines,
        getPath: (l) => l.path as never,
        getColor: (l) => deckColour(l.colour, 0.9),
        getWidth: (l) => l.width,
        widthUnits: "meters",
        widthMinPixels: 2,
        jointRounded: true,
        ...deckSlot("route"),
      }),
    ];
  }, [scene, geo, stretch]);
  useDeckLayers("approach-aloft", layers);

  // For the browser tests: what is drawn, and whose figures.
  useEffect(() => {
    if (!scene) return;
    const el = map.getContainer();
    el.dataset.approachScene = [
      ident,
      `glidepaths=${scene.glidepaths.map((g) => `${g.end}:${g.source}`).join(",")}`,
      `path=${scene.path?.length ?? 0}`,
      `ring=${scene.ring?.ft ?? ""}`,
    ].join(" ");
    return () => {
      delete el.dataset.approachScene;
    };
  }, [map, scene, ident]);
  return null;
}
