import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Marker } from "maplibre-gl";
import { Cloud, CloudRain, MoonStar, Snowflake, Sun } from "lucide-react";
import { cn } from "cn";
import { callEngine } from "../../lib/engine/engine";
import { useGlMap, useGlMiss } from "../../lib/map/gl/glLayer";
import { TEXT } from "../../lib/text";
import { aviationReading } from "./aviationLooks";
import { fileOf } from "./flowLevels";
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
 * cape_category); the wind at a level its temperature there too; AWC's
 * icing and turbulence their words (the engine's icing_severity and
 * turbulence_category), the freezing level and the cloud tops their
 * level; the others their value and unit.
 */
export function FlowBubble({
  field,
  file,
  level,
  layer,
  frame,
}: {
  field: ShownField;
  /** The picture shown (flowLevels' fileOf), the field at its level. */
  file: string;
  level: string | null;
  layer: FlowLayer;
  frame: FlowFrame | null;
}) {
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
  // The wind at a level says the temperature there too (the owner,
  // 2026-11-12); Max is no one level, so has none.
  const windTemp = field === "wind" && level !== null && level !== "max" ? fileOf("temp", level) : null;
  const texture = useFlowTexture(frame, file);
  const temp = useFlowTexture(frame, windTemp ?? "temp", precip || windTemp !== null);
  const cloud = useFlowTexture(frame, "cloud", precip);
  if (!point) return null;
  const read = valueAt(layer, file, texture, point);
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
  } else if (read && (field === "icing" || field === "turb" || field === "frzlvl" || field === "tops")) {
    const said = aviationReading(field, read.value);
    body = <Said over={said.over} figure={said.figure} under={said.under} />;
  } else if (read) {
    const t = windTemp ? valueAt(layer, windTemp, temp, point) : null;
    body = <Figure field={field} unit={layer.fields[field]?.unit ?? ""} read={read} temp={t ? t.value : null} />;
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

/** A value's figure in the badge: what it is above, the figure, below. */
function Figure({
  field,
  unit,
  read,
  temp = null,
}: {
  field: ShownField;
  unit: string;
  read: { value: number; direction?: number; calm?: boolean; noCeiling?: boolean };
  /** The temperature at the wind's level, C, where it is known. */
  temp?: number | null;
}) {
  let over: string | null = null;
  let figure = String(Math.round(read.value));
  let under = unit;
  if (field === "vis") figure = read.value.toFixed(read.value < 3 ? 1 : 0);
  // Where the wind blows from as one of the 16 points (the engine's
  // compass_point, JO 7930.2 3-3-9's), above its speed, as Apple Weather's
  // badge says it ("NNW").
  if (field === "wind" && read.direction !== undefined && !read.calm) over = callEngine("compass_point", { bearing_deg: read.direction });
  // The engine reads the ceiling rounded to its picture's 50 ft, and its
  // top as none (flow_sample's no_ceiling, AIM 7-1-7).
  if (field === "ceiling") [figure, under] = read.noCeiling ? ["None", "ceiling"] : [read.value.toLocaleString("en-US"), "ft agl"];
  if (field === "cape") over = callEngine("cape_category", { j_kg: read.value });
  // A wind under a knot is calm and has no direction (FMH-1 Table 5-1,
  // 5.5.2): the word alone, in place of a speed and a unit.
  if (field === "wind" && read.calm) [figure, under] = ["Calm", ""];
  if (field === "wind" && temp !== null) under = `${under} ${Math.round(temp)}°`.trim();
  return <Said over={over} figure={figure} under={under} />;
}

/** A badge's three lines: what it is, the figure, its unit. */
function Said({ over, figure, under }: { over: string | null; figure: string; under: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5 leading-none tabular-nums">
      {over !== null && <span className={cn("font-semibold opacity-60", TEXT.caption)}>{over}</span>}
      {/* A word ("Moderate", "FL060") smaller than a figure, so it fits the badge. */}
      <span className={cn("font-bold", figure.length > 4 ? TEXT.detail : TEXT.title)}>{figure}</span>
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
