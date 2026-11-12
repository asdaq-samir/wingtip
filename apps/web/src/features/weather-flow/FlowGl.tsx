import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Layer } from "@deck.gl/core";
import type { Map as MlMap, RasterLayerSpecification } from "maplibre-gl";
import { GridLayer, GridStyle, ImageType, ParticleLayer, RasterLayer, type TextureData } from "weatherlayers-gl";
import { useEngineWhen } from "../../lib/engine/useEngineReady";
import { deckSlot, useDeckLayers } from "../../lib/map/gl/deckLayers";
import { useGlLayer, useGlMap } from "../../lib/map/gl/glLayer";
import { useGlView } from "../../lib/map/gl/useGlView";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { prefersReducedMotion } from "../../lib/motion";
import { WEATHER } from "../../lib/tokens";
import { FlowBar } from "./FlowBar";
import { FlowAirmets } from "./FlowAirmets";
import { FlowBubble } from "./FlowBubble";
import { FlowHatch } from "./FlowHatch";
import { FlowLegend } from "./FlowLegend";
import { FlowPins } from "./FlowPins";
import { fileOf, levelShown } from "./flowLevels";
import { STREAK_RAMP, hasStreaks, lookOf, streaksAt, type ShownField } from "./flowLook";
import { pictureQuery, useFlowTexture } from "./flowTexture";
import { useWeatherFlow, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

/** A streak's width, CSS pixels: a hairline, as Apple's are. */
const STREAK_WIDTH = 0.7;

/** The map's zoom, by whole levels, as the camera comes to rest. */
const wholeZoom = (map: MlMap) => Math.round(map.getZoom());

const RADAR_CREDIT = "Radar: NWS NEXRAD via Iowa Environmental Mesonet";
/** At this zoom and out, the GFS's world wind streaks run past AWC's box,
 *  across the oceans, as Apple Weather's do zoomed out (the owner,
 *  2026-11-12); closer in, AWC's alone. */
const WORLD_ZOOM = 4;

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
 * and ParticleLayer on deck.gl (lib/map/gl/deckLayers), interleaved into the map's own style
 * under its areas, lines and marks (slot "areas"), so the airports, the
 * route and the airspace stay on top. A chunk of its own, loaded only
 * once the layer is turned on.
 *
 * Under Reduce Motion the streaks are still arrows (GridLayer's), and
 * nothing moves; in a hidden tab the streaks stop. For an hour already
 * past, the precipitation is the radar's mosaic, observed, in place of
 * the model's. With it, the legend (top left, its close and its field
 * menu), the timeline (above the sheet), the value bubble and, on the
 * temperature, its pills at the pilot's position and favourites. The
 * fields' bands and words are the engine's (flowLook), so it waits for it.
 */
export default function FlowGl() {
  useEngineWhen(true);
  const { map } = useGlMap();
  const flow = useWeatherFlow();
  const field = flow.field === "off" ? "wind" : flow.field;
  const streaks = hasStreaks(field);
  const { frame, layer } = flow;
  const picked = useWeatherLayers((s) => s.flowLevel);
  // The level shown and the pictures it means: the field's at it, and the
  // wind's streaks at the wind's level, the surface's under the gusts.
  const level = levelShown(layer, field, picked);
  const file = field === "gust" ? "gust" : fileOf(field, level);
  const windFile = field === "wind" ? file : "wind";
  const radar = field === "precip" && frame?.past && frame.radar_tiles ? frame.radar_tiles : null;
  const { box: zoom } = useGlView(wholeZoom, "rest");
  const world = streaks && windFile === "wind" && zoom <= WORLD_ZOOM && !!layer?.world_bounds;
  const fieldTexture = useFlowTexture(frame, file, !radar);
  const windTexture = useFlowTexture(frame, windFile, streaks);
  const worldTexture = useFlowTexture(frame, "world", world);
  const shown = usePageShown();
  const [reduced] = useState(prefersReducedMotion);
  const phone = map.getContainer().clientWidth < 640;

  // The next hour's pictures fetched ahead, so play steps without a wait.
  usePrefetchNext(flow.frames, flow.shown, streaks ? [file, windFile] : [file]);

  const layers = useMemo(() => {
    const wind = streaks ? windTexture : undefined;
    const textures = { field: fieldTexture, wind, world: world ? worldTexture : undefined };
    return layer ? layersOf(layer, field, textures, { reduced, animate: shown, phone, zoom }) : [];
  }, [layer, field, fieldTexture, windTexture, worldTexture, world, streaks, reduced, shown, phone, zoom]);
  useDeckLayers("flow", layers);

  return (
    <>
      {radar && <RadarTiles key={radar} url={radar} />}
      {layer?.bounds && !world && <FlowHatch bounds={layer.bounds} />}
      <FlowLegend field={field} file={file} level={level} layer={layer} frame={frame} radar={!!radar} world={world} />
      <FlowBar />
      {frame && <FlowAirmets frame={frame} />}
      {layer && <FlowBubble field={field} file={file} level={level} layer={layer} frame={frame} />}
      {layer && field === "temp" && <FlowPins layer={layer} frame={frame} file={file} />}
    </>
  );
}

function usePrefetchNext(frames: FlowFrame[], shown: number, files: string[]) {
  const client = useQueryClient();
  const next = frames[shown + 1];
  const wanted = files.join(",");
  useEffect(() => {
    if (!next) return;
    for (const f of new Set(wanted.split(","))) {
      if (!next.fields.includes(f)) continue;
      void client.prefetchQuery(pictureQuery(next, f));
    }
  }, [client, next, wanted]);
}

function layersOf(
  layer: FlowLayer,
  field: ShownField,
  /** The field's picture; the wind's where the field has streaks
   *  (hasStreaks); the world's wind zoomed out (WORLD_ZOOM). */
  textures: { field?: TextureData; wind?: TextureData; world?: TextureData },
  { reduced, animate, phone, zoom }: { reduced: boolean; animate: boolean; phone: boolean; zoom: number },
): Layer[] {
  const bounds = layer.bounds as [number, number, number, number];
  const spec = layer.fields[field];
  const wind = layer.fields.wind;
  const { field: fieldTexture, wind: windTexture, world: worldTexture } = textures;
  // Into the map's style under its "areas" slot (lib/map/gl/glLayer's
  // SLOTS): over the chart and the radar, under the areas, the airspace,
  // the route and the marks.
  const place = deckSlot("areas");
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
        opacity: lookOf(field).opacity,
        ...place,
      }),
    );
  }
  // The world's wind first, under AWC's: the weather service clears it
  // inside the layer's box (app.flow_aloft), so the two never overlap.
  const sources: { id: string; image: TextureData; bounds: [number, number, number, number] }[] = [];
  if (worldTexture && wind && layer.world_bounds)
    sources.push({ id: "world", image: worldTexture, bounds: layer.world_bounds as [number, number, number, number] });
  if (windTexture && wind) sources.push({ id: "box", image: windTexture, bounds });
  for (const source of sources) {
    const common = {
      image: source.image,
      imageType: ImageType.VECTOR,
      imageUnscale: wind!.unscale as [number, number],
      bounds: source.bounds,
      ...place,
    };
    out.push(
      reduced
        ? new GridLayer({
            id: `flow-arrows-${source.id}`,
            ...common,
            style: GridStyle.ARROW,
            density: 0,
            iconColor: tone(WEATHER.flowStreak),
            palette: STREAK_RAMP,
          })
        : new ParticleLayer({
            id: `flow-streaks-${source.id}`,
            ...common,
            numParticles: streaksAt(zoom, phone).count,
            maxAge: streaksAt(zoom, phone).age,
            speedFactor: streaksAt(zoom, phone).speed,
            width: STREAK_WIDTH,
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
