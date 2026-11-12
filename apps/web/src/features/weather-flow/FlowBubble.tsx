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
import { useGlMap, useGlMiss } from "../../lib/map/gl/glLayer";
import { TEXT } from "../../lib/text";
import type { ShownField } from "./flowLook";
import { useFlowTexture } from "./flowTexture";
import { usePlayer, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

/** Under this reflectivity no precipitation is said: a trace (the legend's
 *  clear, flowLook's RAIN_RAMP). */
const FALLING_DBZ = 10;
/** Broken or more, five eighths of the sky (the Federal Meteorological
 *  Handbook No. 1, chapter 9, "Sky Condition", its reportable amounts:
 *  BKN 5/8 to 7/8): the glyph is a cloud. */
const CLOUDY_PERCENT = 62.5;

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
 * precipitation: the temperature there with what is falling or how cloudy,
 * in a dark badge; the others their value and unit.
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
    const falling = read && read.value >= FALLING_DBZ;
    const Glyph = falling ? (t && t.value <= 0 ? Snowflake : CloudRain) : c && c.value >= CLOUDY_PERCENT ? Cloud : null;
    if (t) {
      body = (
        <span className="flex items-center gap-0.5 font-semibold tabular-nums">
          {Math.round(t.value)}°{Glyph && <Glyph className="size-3.5" aria-hidden="true" />}
        </span>
      );
    }
  } else if (read) {
    const unit = layer.fields[field]?.unit ?? "";
    const figure = field === "vis" ? read.value.toFixed(read.value < 3 ? 1 : 0) : String(Math.round(read.value));
    const from = field === "wind" && read.direction !== undefined ? ((read.direction % 360) + 360) % 360 : null;
    body = (
      <span className="flex flex-col items-center leading-none tabular-nums">
        {from !== null && (
          <span className={cn("font-semibold", TEXT.caption)}>
            {formatDirection(from, DirectionType.INWARD, DirectionFormat.CARDINAL3)}
          </span>
        )}
        <span className="font-bold">{figure}</span>
        <span className={cn("uppercase", TEXT.caption)}>{unit}</span>
      </span>
    );
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
