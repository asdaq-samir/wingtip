import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ProcedureDrawing } from "../../../../lib/api/types";
import { EMPTY, useGlData, useGlLayer, useGlMap } from "../../../../lib/map/gl/glLayer";
import { airportQuery } from "../../../../lib/queryClient";
import { CHART } from "../../../../lib/tokens";
import { aloft, approachScene, centrelineFeatures, pickedApproach, ringPoints } from "./approachScene";
import { DEM } from "./dem";
import { aloftFeatures, aloftPieces } from "./geometry";
import { setExtrusionData, useExtrusion } from "./useExtrusion";

/** The bands in the air, metres: the glidepath and the approach a little
 *  narrower than the route's 150 m (AloftGl), the ring narrower again, so
 *  the runway's way in reads under the route's own magenta; each 20 m
 *  deep. Their pieces a quarter mile long, the ring's a tenth, so the
 *  glidepath's curve over the earth and the ring's round show. */
const GLIDE_M = 60;
const PATH_M = 90;
const RING_M = 45;
const DEEP_M = 20;
const WALL_M = 15;

/**
 * The way in to a field in 3D (TerrainGl mounts it for the route's
 * destination, or the field whose card is open): each runway's extended
 * centreline dashed on the ground, the glidepath to its threshold in the
 * air, the approach picked there at its altitudes with a curtain down to
 * its ground track (as AloftGl hangs the route's), and a ring at the
 * pattern's altitude. Every figure is the engine's (approachScene).
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

  useExtrusion(map, "approach-curtain", {
    type: "fill-extrusion",
    paint: {
      "fill-extrusion-color": CHART.procedure,
      "fill-extrusion-opacity": 0.2,
      "fill-extrusion-base": 0,
      "fill-extrusion-height": ["get", "top"],
    },
  });
  useExtrusion(map, "approach-aloft", {
    type: "fill-extrusion",
    paint: {
      "fill-extrusion-color": ["get", "colour"],
      "fill-extrusion-opacity": 0.9,
      "fill-extrusion-base": ["get", "bottom"],
      "fill-extrusion-height": ["get", "top"],
    },
  });

  const parts = useMemo(() => {
    if (!scene) return null;
    const path = scene.path ? aloft(scene.path) : [];
    return {
      bands: [
        ...scene.glidepaths.map((g) => ({ pieces: aloftPieces(aloft(g.points), GLIDE_M, 0.25), colour: CHART.glidepath })),
        { pieces: aloftPieces(path, PATH_M, 0.25), colour: CHART.procedure },
        { pieces: aloftPieces(ringPoints(scene), RING_M, 0.1), colour: CHART.pattern },
      ],
      wall: aloftPieces(path, WALL_M, 0.25),
    };
  }, [scene]);

  useEffect(() => {
    if (!parts || !scene) return;
    let timer = 0;
    const lift = () => {
      const ground = (mid: [number, number]) => map.queryTerrainElevation(mid);
      const features = parts.bands.flatMap((b) =>
        aloftFeatures(b.pieces, ground, DEEP_M).features.map((f) => ({ ...f, properties: { ...f.properties, colour: b.colour } })),
      );
      setExtrusionData(map, "approach-aloft", { type: "FeatureCollection", features });
      setExtrusionData(map, "approach-curtain", aloftFeatures(parts.wall, ground, null));
    };
    lift();
    // Again as the terrain's finer tiles come in, a quarter second after
    // the last (AloftGl's way).
    const came = (e: { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId !== DEM || !e.tile) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(lift, 250);
    };
    map.on("sourcedata", came);
    // For the browser tests: what is drawn, and whose figures.
    const el = map.getContainer();
    el.dataset.approachScene = [
      ident,
      `glidepaths=${scene.glidepaths.map((g) => `${g.end}:${g.source}`).join(",")}`,
      `path=${scene.path?.length ?? 0}`,
      `ring=${scene.ring?.ft ?? ""}`,
    ].join(" ");
    return () => {
      window.clearTimeout(timer);
      map.off("sourcedata", came);
      delete el.dataset.approachScene;
    };
  }, [map, parts, scene, ident]);
  return null;
}
