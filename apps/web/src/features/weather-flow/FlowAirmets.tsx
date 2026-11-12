import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LineLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { api } from "../../lib/api/client";
import { callEngine } from "../../lib/engine/engine";
import { useGlData, useGlLayer } from "../../lib/map/gl/glLayer";
import { GL_FONT_BOLD, LABEL_HALO } from "../../lib/map/gl/layers/common";
import { areaColour } from "../../lib/map/weatherColours";
import type { FlowFrame } from "./useWeatherFlow";

const SOURCE = "flow-gairmets";
const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });

/** The G-AIRMETs' box: the lower 48 and round it, where they are issued
 *  (aviationweather.gov: "Contiguous 48 United States"), within the
 *  planner's widest box (70 degrees). */
const CONUS = { south: 18, west: -130, north: 56, east: -61 };

/** Each outline dashed in its hazard's colour, as the map's own weather
 *  areas draw a G-AIRMET (plan/map/layers/WeatherGl), and its label along
 *  it, as aviationweather.gov's Winds map labels its own ("SfcWind"). */
const LAYERS: (LineLayerSpecification | SymbolLayerSpecification)[] = [
  {
    id: "flow-gairmet-line",
    type: "line",
    source: SOURCE,
    paint: { "line-color": ["get", "colour"], "line-width": 1.5, "line-dasharray": [3, 2.5] },
  },
  {
    id: "flow-gairmet-label",
    type: "symbol",
    source: SOURCE,
    layout: {
      "symbol-placement": "line",
      "text-field": ["get", "label"],
      "text-font": GL_FONT_BOLD,
      "text-size": 11,
      "symbol-spacing": 320,
    },
    paint: { "text-color": ["get", "colour"], ...LABEL_HALO },
  },
];

/**
 * The G-AIRMETs for the hour the timeline shows (the owner's screenshot of
 * AWC's Winds map, 2026-11-12: a "SfcWind" polygon over the wind): the
 * same advisories the map's weather areas draw (the planner's weather map,
 * from aviationweather.gov's G-AIRMET cache file), the snapshot nearest
 * the hour (three hours apart, FAA-H-8083-28B 26.3.1.1), as outlines with
 * AWC's short hazard labels (the engine's gairmet_hazards). Under the
 * flow layer's own controls, over its colours.
 */
export function FlowAirmets({ frame }: { frame: FlowFrame }) {
  const at = Math.round(Date.parse(frame.valid) / 1000);
  const { data } = useQuery({
    queryKey: ["flowGairmets", at],
    queryFn: () => api.weatherMap(CONUS, null, at),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  useGlLayer("lines", { [SOURCE]: empty() }, LAYERS);
  const features = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!data) return null;
    const { labels } = callEngine("gairmet_hazards", {});
    return {
      type: "FeatureCollection",
      features: data.advisories
        .filter((a) => a.kind === "gairmet")
        .map((a) => ({
          type: "Feature",
          properties: { colour: areaColour(a), label: labels[a.hazard ?? ""] ?? a.hazard ?? "" },
          // The outline closed, its last point back at its first.
          geometry: { type: "LineString", coordinates: [...a.coords, a.coords[0]!].map((c) => [c[1]!, c[0]!]) },
        })),
    };
  }, [data]);
  useGlData(SOURCE, features);
  return null;
}
