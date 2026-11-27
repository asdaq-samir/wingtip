import type { CircleLayerSpecification, ColorReliefLayerSpecification } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "../../../lib/api/client";
import { slotId, useGlData, useGlLayer, useGlMap } from "../../../lib/map/gl/glLayer";
import { glZoom } from "../../../lib/map/gl/glStyle";
import { useGlView } from "../../../lib/map/gl/useGlView";
import { CHART } from "../../../lib/tokens";
import { usePreferences } from "../../../lib/preferences";
import { DEM } from "../terrain/dem";
import { obstacleBox, obstaclesKey } from "../terrain/obstacleBox";
import { hazardColours, hazardView, LEVEL_COLOUR } from "./hazard";
import { useHazardView } from "./useHazardView";

const TINT = "terrain-hazard";
const OBSTACLES = "obstacles-hazard";
/** The obstacles the colouring rings, under the chart's own symbols' size. */
const OBSTACLE_LAYER: CircleLayerSpecification = {
  id: OBSTACLES,
  type: "circle",
  source: OBSTACLES,
  minzoom: glZoom(9),
  paint: {
    "circle-color": ["match", ["get", "level"], "warning", LEVEL_COLOUR.warning, LEVEL_COLOUR.caution],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], glZoom(9), 3, glZoom(13), 6],
    "circle-stroke-color": CHART.casing,
    "circle-stroke-width": 1,
  },
};
const SOURCES = { [OBSTACLES]: { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } } };
const LAYERS = [OBSTACLE_LAYER];

/**
 * Hazard colouring, ForeFlight's Hazard Advisor on the chart: the ground
 * and the FAA's obstacles coloured against the altitude flown -- red
 * within the pilot's clearance of it or above it, amber a further band
 * under that, nothing lower -- from the engine's hazard_view (the bands
 * and their 14 CFR 91.119 and 91.177 sources are its). The ground is the
 * planner's terrain tiles the relief is shaded from (ReliefGl's DEM),
 * coloured on the device by MapLibre's own color-relief layer, with the
 * bands fed in; the obstacles are the Digital Obstacle File's round the
 * view (/api/terrain/obstacles, the 3D posts' question), each the
 * engine's level, drawn only where it is red or amber.
 *
 * The altitude is the GPS's in flight and the plan's cruise on the ground
 * (the engine's); the Map card's Hazard Colouring turns it on, or on by
 * itself in flight. A picture against one altitude, not terrain
 * clearance: no TAWS. Mounted only while the setting is not off
 * (EngineLayers), its own chunk.
 */
export default function HazardGl({ cruiseFt }: { cruiseFt: number | null }) {
  const { map } = useGlMap();
  const view = useHazardView(cruiseFt);
  const shown = !!view?.shown;
  const warning = view?.warning_from_ft ?? null,
    caution = view?.caution_from_ft ?? null;
  useEffect(() => {
    if (!map.style) return;
    if (!shown || warning === null || caution === null) {
      if (map.getLayer(TINT)) map.removeLayer(TINT);
      return;
    }
    const colours = hazardColours({ warning_from_ft: warning, caution_from_ft: caution });
    if (map.getLayer(TINT)) map.setPaintProperty(TINT, "color-relief-color", colours);
    else {
      const tint: ColorReliefLayerSpecification = {
        id: TINT,
        type: "color-relief",
        source: DEM,
        // Never dimmed with the chart at night: it is a terrain warning, and
        // dimming it took its amber from about 1.6:1 to 1.3:1 against the
        // paper; a warning stays conspicuous, as own ship does.
        paint: { "color-relief-opacity": 1, "color-relief-color": colours },
      };
      map.addLayer(tint, slotId("imagery"));
    }
  }, [map, shown, warning, caution]);
  // The tint gone with the layer; what it is drawn from said on the map's
  // element, for the browser specs.
  useEffect(
    () => () => {
      if (map.style && map.getLayer(TINT)) map.removeLayer(TINT);
    },
    [map],
  );
  useEffect(() => {
    const el = map.getContainer();
    if (shown) el.dataset.hazard = `${warning}/${caution}/${view?.source ?? ""}`;
    return () => {
      delete el.dataset.hazard;
    };
  }, [map, shown, warning, caution, view?.source]);
  useGlLayer("marks", SOURCES, LAYERS);
  const { box } = useGlView(obstacleBox, "rest");
  const { data } = useQuery({
    queryKey: obstaclesKey(box),
    queryFn: () => api.obstacles(box!),
    enabled: !!box && shown,
    staleTime: 60 * 60 * 1000,
    placeholderData: (was) => was,
    meta: { silent: true },
  });
  const clearance = usePreferences((s) => s.hazardClearanceFt);
  const altitude = view?.altitude_ft ?? null;
  const features = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!shown || !data || altitude === null) return null;
    // The obstacles' tops against the very altitude the ground's colours are from.
    const levels = hazardView(
      "on",
      null,
      altitude,
      clearance,
      data.obstacles.map((o) => o.amsl_ft),
    ).levels;
    return {
      type: "FeatureCollection",
      features: data.obstacles.flatMap((o, i) =>
        levels[i] === "warning" || levels[i] === "caution"
          ? [
              {
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [o.lon, o.lat] },
                properties: { level: levels[i] },
              },
            ]
          : [],
      ),
    };
  }, [shown, data, altitude, clearance]);
  useGlData(OBSTACLES, features);
  return null;
}
