import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";
import type { IControl, Map as MlMap, RasterLayerSpecification } from "maplibre-gl";
import { GridLayer, GridStyle, ImageType, ParticleLayer, RasterLayer, type TextureData } from "weatherlayers-gl";
import { useEngineWhen } from "../../lib/engine/useEngineReady";
import { slotId, useGlLayer, useGlMap } from "../../lib/map/gl/glLayer";
import { prefersReducedMotion } from "../../lib/motion";
import { WEATHER } from "../../lib/tokens";
import { FlowBar } from "./FlowBar";
import { FlowBubble } from "./FlowBubble";
import { FlowHatch } from "./FlowHatch";
import { FlowLegend } from "./FlowLegend";
import { STREAK_RAMP, hasStreaks, lookOf, type ShownField } from "./flowLook";
import { pictureQuery, useFlowTexture } from "./flowTexture";
import { useWeatherFlow, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

/** The streaks on a phone and on a larger screen: dense enough to read the
 *  flow as Apple Weather's map does, few enough to hold the frame rate on
 *  an iPhone (each streak is a line segment the GPU moves every frame). */
const STREAKS_PHONE = 2500;
const STREAKS_WIDE = 5000;
/** How many frames a streak lives, and how far it moves a frame for a knot. */
const STREAK_AGE = 22;
const STREAK_SPEED = 2;
/** The colour field over the chart: the chart read through it. */
const FIELD_OPACITY = 0.75;
const RADAR_CREDIT = "Radar: NWS NEXRAD via Iowa Environmental Mesonet";

/** Whether the page is in sight: nothing animates in a hidden tab. */
function usePageShown() {
  return useSyncExternalStore(
    (on) => {
      document.addEventListener("visibilitychange", on);
      return () => document.removeEventListener("visibilitychange", on);
    },
    () => !document.hidden,
  );
}

/**
 * The flow layer (the owner, 2026-11-11: "Can we overlay weather and wind
 * like this?", Windy's map, then Apple Weather's wind and precipitation
 * maps as the look): the model weather's field as a colour wash and, on
 * the wind and the gusts (hasStreaks), the wind as thin streaks over it,
 * as Apple Weather's maps draw them, drawn with weatherlayers-gl's RasterLayer
 * and ParticleLayer on deck.gl, interleaved into the map's own style
 * under its areas, lines and marks (slot "areas"), so the airports, the
 * route and the airspace stay on top. A chunk of its own, loaded only
 * once the layer is turned on.
 *
 * Under Reduce Motion the streaks are still arrows (GridLayer's), and
 * nothing moves; in a hidden tab the streaks stop. For an hour already
 * past, the precipitation is the radar's mosaic, observed, in place of
 * the model's. With it, the legend (top left, its close and its field
 * menu), the timeline (above the sheet) and the value bubble. The
 * fields' bands and words are the engine's (flowLook), so it waits for it.
 */
export default function FlowGl() {
  useEngineWhen(true);
  const { map } = useGlMap();
  const flow = useWeatherFlow();
  const field = flow.field === "off" ? "wind" : flow.field;
  const streaks = hasStreaks(field);
  const { frame, layer } = flow;
  const radar = field === "precip" && frame?.past && frame.radar_tiles ? frame.radar_tiles : null;
  const fieldTexture = useFlowTexture(frame, field, !radar);
  const windTexture = useFlowTexture(frame, "wind", streaks);
  const shown = usePageShown();
  const [reduced] = useState(prefersReducedMotion);
  const overlay = useMemo(() => new MapboxOverlay({ interleaved: true, layers: [] }), []);
  const phone = map.getContainer().clientWidth < 640;

  useEffect(() => {
    const control = overlay as unknown as IControl;
    const unshim = shimTransform(map);
    map.addControl(control);
    return () => {
      if (map.style) map.removeControl(control);
      unshim();
    };
  }, [map, overlay]);

  // The next hour's pictures fetched ahead, so play steps without a wait.
  usePrefetchNext(flow.frames, flow.shown, field);

  useEffect(() => {
    const wind = streaks ? windTexture : undefined;
    overlay.setProps({ layers: layer ? layersOf(layer, field, fieldTexture, wind, { reduced, animate: shown, phone }) : [] });
  }, [overlay, layer, field, fieldTexture, windTexture, streaks, reduced, shown, phone]);

  return (
    <>
      {radar && <RadarTiles key={radar} url={radar} />}
      {layer?.bounds && <FlowHatch bounds={layer.bounds} />}
      <FlowLegend field={field} frame={frame} radar={!!radar} />
      <FlowBar />
      {layer && <FlowBubble field={field} layer={layer} frame={frame} />}
    </>
  );
}

/**
 * deck.gl 9.4's interleaved mode (@deck.gl/mapbox's deck-utils) reads
 * `map.transform` -- its height, and with terrain its elevation -- which
 * MapLibre 6 moved from the map onto its camera (Map._camera.transform);
 * without it every frame threw "reading 'height'" and nothing drew
 * (measured 2026-11-12, deck.gl 9.4.1 on MapLibre 6.17). Given back to
 * the map for as long as the layer is on, only where the map has none.
 * TODO: drop once @deck.gl/mapbox reads MapLibre 6's camera itself.
 */
function shimTransform(map: MlMap): () => void {
  if ("transform" in map) return () => {};
  const camera = (map as unknown as { _camera?: { transform?: unknown } })._camera;
  if (!camera?.transform) return () => {};
  Object.defineProperty(map, "transform", { configurable: true, get: () => camera.transform });
  return () => {
    delete (map as unknown as { transform?: unknown }).transform;
  };
}

function usePrefetchNext(frames: FlowFrame[], shown: number, field: ShownField) {
  const client = useQueryClient();
  const next = frames[shown + 1];
  useEffect(() => {
    if (!next) return;
    for (const f of new Set<ShownField | "wind">(hasStreaks(field) ? [field, "wind"] : [field])) {
      if (!next.fields.includes(f)) continue;
      void client.prefetchQuery(pictureQuery(next, f));
    }
  }, [client, next, field]);
}

function layersOf(
  layer: FlowLayer,
  field: ShownField,
  fieldTexture: TextureData | undefined,
  /** The wind's picture where the field has streaks (hasStreaks), else none. */
  windTexture: TextureData | undefined,
  { reduced, animate, phone }: { reduced: boolean; animate: boolean; phone: boolean },
): Layer[] {
  const bounds = layer.bounds as [number, number, number, number];
  const spec = layer.fields[field];
  const wind = layer.fields.wind;
  // Into the map's style under its "areas" slot (lib/map/gl/glLayer's
  // SLOTS): over the chart and the radar, under the areas, the airspace,
  // the route and the marks. @deck.gl/mapbox's prop, which the layers'
  // own types do not list, so spread rather than written.
  const place: { beforeId?: string } = { beforeId: slotId("areas") };
  const out: Layer[] = [];
  if (fieldTexture && spec) {
    out.push(
      new RasterLayer({
        id: "flow-field",
        image: fieldTexture,
        imageType: spec.vector ? ImageType.VECTOR : ImageType.SCALAR,
        imageUnscale: spec.unscale as [number, number],
        bounds,
        palette: lookOf(field).ramp,
        opacity: FIELD_OPACITY,
        ...place,
      }),
    );
  }
  if (windTexture && wind) {
    const common = { image: windTexture, imageType: ImageType.VECTOR, imageUnscale: wind.unscale as [number, number], bounds, ...place };
    out.push(
      reduced
        ? new GridLayer({
            id: "flow-arrows",
            ...common,
            style: GridStyle.ARROW,
            density: 0,
            iconColor: tone(WEATHER.flowStreak),
            palette: STREAK_RAMP,
          })
        : new ParticleLayer({
            id: "flow-streaks",
            ...common,
            numParticles: phone ? STREAKS_PHONE : STREAKS_WIDE,
            maxAge: STREAK_AGE,
            speedFactor: STREAK_SPEED,
            width: 1.2,
            palette: STREAK_RAMP,
            animate,
          }),
    );
  }
  return out;
}

const tone = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** An hour past, the precipitation the radar saw (IEM's NEXRAD mosaic, as
 *  the loop draws it), in place of the model's. */
function RadarTiles({ url }: { url: string }) {
  const id = "flow-radar";
  const source = { [id]: { type: "raster" as const, tiles: [url], tileSize: 256, maxzoom: 10, attribution: RADAR_CREDIT } };
  const raster: RasterLayerSpecification = { id, type: "raster", source: id, paint: { "raster-opacity": 0.75, "raster-fade-duration": 0 } };
  useGlLayer("areas", source, [raster]);
  return null;
}
