import type { CircleLayerSpecification, GeoJSONSource, SymbolLayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { CATEGORY, CHART } from "../../../../lib/tokens";
import { useGlData, useGlLayer, useGlMap, useGlTap } from "../../../../lib/map/gl/glLayer";
import { cameraOf } from "../../../../lib/map/gl/camera";
import { GL_FONT_BOLD, TAP } from "../../../../lib/map/gl/layers/common";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { useSearchResultRows, useSearchResults } from "../../hooks/useSearchResults";
import { useGlFit } from "../useGlFit";

const SOURCE = "search-results";
/** MapLibre's own clustering (the owner, 2026-11-10: the results' marks
 *  merge into a numbered bubble, as Apple Maps' do). Only these marks: the
 *  chart's airport symbols keep their give-way rules, never clustered, so
 *  a big field is never folded away. */
const SOURCES = {
  [SOURCE]: {
    type: "geojson" as const,
    data: { type: "FeatureCollection" as const, features: [] },
    cluster: true,
    clusterRadius: 44,
    clusterMaxZoom: 11,
  },
};
/** A bubble of several results, in the map's tint, the count in it. */
const BUBBLE: CircleLayerSpecification = {
  id: "search-results-bubble",
  type: "circle",
  source: SOURCE,
  filter: ["has", "point_count"],
  paint: { "circle-color": CHART.mapBlue, "circle-radius": 16, "circle-stroke-color": CHART.casing, "circle-stroke-width": 2 },
};
const COUNT: SymbolLayerSpecification = {
  id: "search-results-count",
  type: "symbol",
  source: SOURCE,
  filter: ["has", "point_count"],
  layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": GL_FONT_BOLD, "text-size": 14, "text-allow-overlap": true },
  paint: { "text-color": CHART.casing },
};
/** One result: a round mark in its flight category's colour (AIM 7-1-7's
 *  colours, the map's own), the tint where the field has no report, ringed
 *  white so it stands off the chart. */
const POINT: CircleLayerSpecification = {
  id: "search-results-point",
  type: "circle",
  source: SOURCE,
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": [
      "match",
      ["get", "category"],
      "VFR",
      CATEGORY.VFR!,
      "MVFR",
      CATEGORY.MVFR!,
      "IFR",
      CATEGORY.IFR!,
      "LIFR",
      CATEGORY.LIFR!,
      CHART.mapBlue,
    ],
    "circle-radius": 11,
    "circle-stroke-color": CHART.casing,
    "circle-stroke-width": 3,
  },
};
const LAYERS = [BUBBLE, COUNT, POINT];

/**
 * A search sent, its fields on the map (useSearchResults), as Apple Maps
 * marks the results of a search over its map (the owner's screenshot,
 * 2026-11-10): over the chart, fitted above the sheet once as the list
 * first comes and as its filters change, the same fields as the list. A tap on a mark opens
 * its card, as its row does; a tap on a bubble zooms in to part it. Gone
 * as the search is cleared.
 */
export function SearchResultsGl() {
  const { map } = useGlMap();
  const sent = useSearchResults((s) => s.sent);
  const { rows } = useSearchResultRows();
  useGlLayer("top", SOURCES, LAYERS);
  const shown = useMemo(() => (sent ? rows : []), [sent, rows]);
  const features = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      shown.length
        ? {
            type: "FeatureCollection",
            features: shown.map((a) => ({
              type: "Feature",
              properties: { ident: a.ident, category: a.flight_category ?? "" },
              geometry: { type: "Point", coordinates: [a.lon, a.lat] },
            })),
          }
        : null,
    [shown],
  );
  useGlData(SOURCE, features);
  // Where each mark and bubble is, for the browser tests (useGlProbe).
  useGlProbe("search-result-marks", ["search-results-point", "search-results-bubble"], (f) => ({
    ident: f.properties.ident ?? null,
    count: f.properties.point_count ?? null,
  }));
  // Once a search sent or its filters changed, the pilot's picks; not as
  // its results refresh (useGlFit).
  const filters = useSearchResults((s) => s.filters);
  useGlFit(shown, sent ? `search:${JSON.stringify([sent, filters])}` : null, 11);
  useGlTap(["search-results-point"], TAP.mark, TAP.rank.field, (feature) => {
    const ident = feature.properties.ident as string | undefined;
    if (ident) useSearchResults.getState().open?.(ident);
  });
  useGlTap(["search-results-bubble"], TAP.mark, TAP.rank.field, (feature) => {
    const source = map.getSource<GeoJSONSource>(SOURCE);
    const id = feature.properties.cluster_id as number | undefined;
    if (!source || id == null || feature.geometry.type !== "Point") return;
    const [lon, lat] = feature.geometry.coordinates as [number, number];
    void source.getClusterExpansionZoom(id).then((zoom) => cameraOf(map).pick([lon, lat], { zoom }));
  });
  return null;
}
