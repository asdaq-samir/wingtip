import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Marker } from "maplibre-gl";
import { Cloud, CloudRain, MoonStar, Snowflake, Sun } from "lucide-react";
import { cn } from "cn";
import { callEngine } from "../../lib/engine/engine";
import { useGlMap, useGlMiss } from "../../lib/map/gl/glLayer";
import { TEXT } from "../../lib/text";
import type { ShownField } from "./flowLook";
import { useFlowTexture, valueAt } from "./flowTexture";
import { usePlayer, type FlowFrame, type FlowLayer } from "./useWeatherFlow";

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
  useGlMiss((e) => set({ point: [e.lngLat.lng, e.lngLat.lat], tapped: true }));
  const tapped = usePlayer((s) => s.tapped);
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
    // Under a clear or broken-up sky, the sun or the moon as Apple
    // Weather's badge shows it: the moon from sunset to sunrise there at
    // the hour shown (the engine's sun_down, the sun's upper limb under
    // the horizon), not 14 CFR 1.1's night, which waits for civil
    // twilight's end -- the badge draws the sky, not a rule a flight is
    // held to.
    const down = frame ? callEngine("sun_down", { lat: point[1], lon: point[0], at_s: Date.parse(frame.valid) / 1000 }) : false;
    const Glyph =
      said?.falls_as === "snow"
        ? Snowflake
        : said?.falls_as === "rain"
          ? CloudRain
          : overcast
            ? Cloud
            : frame
              ? down
                ? MoonStar
                : Sun
              : null;
    if (t || said?.word)
      body = (
        <span className="flex flex-col items-center gap-0.5 leading-none tabular-nums">
          {t && <span className={cn("font-bold", TEXT.title)}>{Math.round(t.value)}°</span>}
          {Glyph && <Glyph className="size-4" aria-hidden="true" />}
          {said?.word && <span className={cn("font-semibold", TEXT.caption)}>{said.word}</span>}
        </span>
      );
  } else if (read) {
    body = <Figure field={field} unit={layer.fields[field]?.unit ?? ""} read={read} top={layer.fields[field]?.unscale[1]} />;
  }
  // The temperature a small pill with its figure alone, as the pilot's
  // position and favourites carry (FlowPins), and only where the pilot
  // tapped: at the map's centre it stood on own ship's pill. The others
  // a round badge.
  if (field === "temp" && !tapped) return null;
  if (field === "temp") return createPortal(<FlowPill value={read?.value ?? null} testId="weather-flow-bubble" />, el);
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
  // Where the wind blows from as one of the 16 points (the engine's
  // compass_point, JO 7930.2 3-3-9's), above its speed, as Apple Weather's
  // badge says it ("NNW").
  if (field === "wind" && read.direction !== undefined) over = callEngine("compass_point", { bearing_deg: read.direction });
  if (field === "ceiling") {
    if (nearTop(read.value, top)) [figure, under] = ["None", "ceiling"];
    else [figure, under] = [(Math.round(read.value / 50) * 50).toLocaleString("en-US"), "ft agl"];
  }
  if (field === "cape") over = callEngine("cape_category", { j_kg: read.value });
  return (
    <span className="flex flex-col items-center gap-0.5 leading-none tabular-nums">
      {over !== null && <span className={cn("font-semibold opacity-60", TEXT.caption)}>{over}</span>}
      <span className={cn("font-bold", TEXT.title)}>{figure}</span>
      <span className={cn("font-semibold uppercase opacity-60", TEXT.caption)}>{under}</span>
    </span>
  );
}

/** A value's small white pill, its figure alone (Apple Weather's
 *  temperature map, the owner's screenshot, 2026-11-12): degrees C, the
 *  legend's unit, rounded; a dash where the model has none. */
export function FlowPill({ value, testId }: { value: number | null; testId?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none flex h-7 min-w-9 items-center justify-center rounded-full bg-white px-2 font-bold text-black tabular-nums shadow-(--depth-float)",
        TEXT.detail,
      )}
      data-testid={testId}
    >
      {value === null ? "–" : Math.round(value)}
    </span>
  );
}
