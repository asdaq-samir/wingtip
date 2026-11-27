import type { LineLayerSpecification, MapGeoJSONFeature } from "maplibre-gl";
import { useMemo } from "react";
import { useGlData, useGlLayer, type Slot } from "./glLayer";
import { useGlProbe } from "./useGlProbe";
import { withAlpha } from "../../rgb";

// Each line drawn, by its name where it has one, for the browser tests.
// With its colour, which says what a run is: a flown track's black where it
// kept to the course, red where it did not (TracksGl's FlownTrackGl).
const DRAWN = (f: MapGeoJSONFeature) => ({
  drawn: true,
  colour: f.properties.colour as string,
  ...(f.properties.name ? { name: f.properties.name } : {}),
});

export interface GlRun {
  /** [lat, lon], as the app keeps its lines. */
  points: [number, number][];
  colour: string;
  width: number;
  opacity?: number;
  /** What the browser tests know it by (data-<id>, useGlProbe):
   *  "pattern-at-KDLH". */
  name?: string;
}

/**
 * Lines drawn as one source and two layers -- a casing under, each run in
 * its own colour and width over it -- the shape every track on the map
 * takes (own ship's trail, a flown track, a past flight, a tracked
 * airplane's path, a leg picked in the Brief), every run of one kind in
 * one source rather than a line each.
 */
export function useGlLines(
  id: string,
  slot: Slot,
  runs: GlRun[] | null,
  casing: { colour: string; width: number; opacity: number } | null,
  dash?: number[],
) {
  const layers = useMemo<LineLayerSpecification[]>(
    () => [
      ...(casing
        ? [
            {
              id: `${id}-casing`,
              type: "line" as const,
              source: id,
              layout: { "line-join": "round" as const, "line-cap": "round" as const },
              paint: { "line-color": casing.colour, "line-width": casing.width, "line-opacity": casing.opacity },
            },
          ]
        : []),
      {
        id,
        type: "line",
        source: id,
        layout: { "line-join": "round", "line-cap": dash ? "butt" : "round" },
        // Each run's see-through in its colour (`ink`, withAlpha), the
        // layer's opacity left to the Dimmer alone (mapDim), a constant: an
        // opacity by feature times the Dimmer had MapLibre lay the source out
        // again at each step of the slider at night (the round-4 themes audit).
        paint: { "line-color": ["get", "ink"], "line-width": ["get", "width"], ...(dash ? { "line-dasharray": dash } : {}) },
      },
      // Read once a map (useGlLayer): the casing's look is the caller's constant.
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const sources = useMemo(() => ({ [id]: { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } } }), [id]);
  useGlLayer(slot, sources, layers);
  const data = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      runs
        ? {
            type: "FeatureCollection",
            features: runs
              .filter((r) => r.points.length > 1)
              .map((r) => ({
                type: "Feature",
                properties: {
                  colour: r.colour,
                  ink: withAlpha(r.colour, r.opacity ?? 1),
                  width: r.width,
                  ...(r.name ? { name: r.name } : {}),
                },
                geometry: { type: "LineString", coordinates: r.points.map(([lat, lon]) => [lon, lat]) },
              })),
          }
        : null,
    [runs],
  );
  useGlData(id, data);
  // Whether it is drawn, for the browser tests (data-<id>, useGlProbe).
  useGlProbe(id, [id], DRAWN);
}
