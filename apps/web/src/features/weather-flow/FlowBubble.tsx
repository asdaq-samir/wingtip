import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Marker } from "maplibre-gl";
import { Cloud, CloudRain, Snowflake } from "lucide-react";
import {
  DirectionFormat,
  DirectionType,
  ImageInterpolation,
  ImageType,
  formatDirection,
  getRasterPoints,
  type TextureData,
} from "weatherlayers-gl";
import { cn } from "cn";
import { callEngine } from "../../lib/engine/engine";
import { useGlMap, useGlMiss } from "../../lib/map/gl/glLayer";
import { TEXT } from "../../lib/text";
import type { ShownField } from "./flowLook";
import { useFlowTexture } from "./flowTexture";
import { usePlayer, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

/** A picture's value at a point: weatherlayers-gl's own reading of it. */
function valueAt(layer: FlowLayer, field: ShownField | "wind", texture: TextureData | undefined, point: [number, number]) {
  const spec = layer.fields[field];
  if (!texture || !spec) return null;
  const read = getRasterPoints(
    {
      image: texture,
      image2: null,
      imageSmoothing: 0,
      imageInterpolation: ImageInterpolation.LINEAR,
      imageWeight: 0,
      imageType: spec.vector ? ImageType.VECTOR : ImageType.SCALAR,
      imageUnscale: spec.unscale as [number, number],
      imageMinValue: null,
      imageMaxValue: null,
    },
    layer.bounds as GeoJSON.BBox,
    [point],
  ).features[0]?.properties;
  return read && Number.isFinite(read.value) ? read : null;
}

/**
 * The value at a point, a round badge on the map as Apple Weather's maps
 * have (the owner's screenshots, 2026-11-11): where the map stood when the
 * layer came on, then wherever the pilot taps the chart (a tap that finds
 * nothing else). The wind: where it blows from, its speed, KT; the
 * precipitation, in a dark badge: the temperature there with what is
 * falling or how cloudy, and the intensity's word, the legend's (the
 * engine's precip_intensity, AIM 7-1-12), with no rate and no unit (the
 * owner's pick, 2026-11-12); the ceiling its feet above the ground, or
 * none; CAPE its figure and the NWS's category (the engine's
 * cape_category); the others their value and unit.
 */
export function FlowBubble({ field, layer, frame }: { field: ShownField; layer: FlowLayer; frame: FlowFrame | null }) {
  const { map } = useGlMap();
  const point = usePlayer((s) => s.point);
  const set = usePlayer((s) => s.set);
  const el = useMemo(() => document.createElement("div"), []);
  const marker = useMemo(() => new Marker({ element: el, anchor: "center" }), [el]);

  useEffect(() => {
    if (!point) {
      const c = map.getCenter();
      set({ point: [c.lng, c.lat] });
    }
  }, [map, point, set]);
  useGlMiss((e) => set({ point: [e.lngLat.lng, e.lngLat.lat] }));
  useEffect(() => {
    if (!point) return;
    marker.setLngLat(point).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, marker, point]);

  const precip = field === "precip";
  const texture = useFlowTexture(frame, field);
  const temp = useFlowTexture(frame, "temp", precip);
  const cloud = useFlowTexture(frame, "cloud", precip);
  if (!point) return null;
  const read = valueAt(layer, field, texture, point);
  let body: React.ReactNode = <span className={TEXT.caption}>–</span>;
  if (precip) {
    const t = valueAt(layer, "temp", temp, point);
    const c = valueAt(layer, "cloud", cloud, point);
    const said = read ? callEngine("precip_intensity", { dbz: read.value, temp_c: t?.value ?? null }) : null;
    const overcast = c ? ["BKN", "OVC"].includes(callEngine("cloud_cover", { percent: c.value }).cover) : false;
    const Glyph = said?.falls_as === "snow" ? Snowflake : said?.falls_as === "rain" ? CloudRain : overcast ? Cloud : null;
    if (t || said?.word)
      body = (
        <span className="flex flex-col items-center leading-none tabular-nums">
          {t && (
            <span className="flex items-center gap-0.5 font-semibold">
              {Math.round(t.value)}°{Glyph && <Glyph className="size-3.5" aria-hidden="true" />}
            </span>
          )}
          {said?.word && <span className={cn("font-semibold", TEXT.caption)}>{said.word}</span>}
        </span>
      );
  } else if (read) {
    body = <Figure field={field} unit={layer.fields[field]?.unit ?? ""} read={read} top={layer.fields[field]?.unscale[1]} />;
  }
  return createPortal(
    <div
      className={cn(
        "pointer-events-none flex size-14 items-center justify-center rounded-full shadow-(--depth-float)",
        precip ? "bg-black/80 text-white" : "bg-white text-black",
      )}
      data-testid="weather-flow-bubble"
    >
      {body}
    </div>,
    el,
  );
}

/** The ceiling's picture holds 50 ft a step to its top (the weather
 *  service's flow_grid), where a ceiling over it and none are both kept:
 *  either is no ceiling a category turns on (AIM 7-1-7's highest bound is
 *  3,000 ft), so it reads as none. */
const nearTop = (value: number, top: number | undefined) => top !== undefined && value >= top - 25;

/** A value's figure in the badge: what it is above, the figure, below. */
function Figure({
  field,
  unit,
  read,
  top,
}: {
  field: ShownField;
  unit: string;
  read: { value: number; direction?: number };
  top?: number;
}) {
  let over: string | null = null;
  let figure = String(Math.round(read.value));
  let under = unit;
  if (field === "vis") figure = read.value.toFixed(read.value < 3 ? 1 : 0);
  if (field === "wind" && read.direction !== undefined) {
    over = formatDirection(((read.direction % 360) + 360) % 360, DirectionType.INWARD, DirectionFormat.CARDINAL3);
  }
  if (field === "ceiling") {
    if (nearTop(read.value, top)) [figure, under] = ["None", "ceiling"];
    else [figure, under] = [(Math.round(read.value / 50) * 50).toLocaleString("en-US"), "ft agl"];
  }
  if (field === "cape") over = callEngine("cape_category", { j_kg: read.value });
  return (
    <span className="flex flex-col items-center leading-none tabular-nums">
      {over !== null && <span className={cn("font-semibold", TEXT.caption)}>{over}</span>}
      <span className="font-bold">{figure}</span>
      <span className={cn("uppercase", TEXT.caption)}>{under}</span>
    </span>
  );
}
