import type { FlowField } from "../../lib/map/sources/weatherLayers";
import { callEngine } from "../../lib/engine/engine";
import type { EngineAnswer } from "../../lib/engine/engine";
import { WEATHER } from "../../lib/tokens";

/** A field that is on: the store's choices but Off. */
export type ShownField = Exclude<FlowField, "off">;

/** A ramp's stop: the value in the field's unit and its colour, a token
 *  with an opacity in 255ths, as weatherlayers-gl's palette takes it. */
type Stop = [number, [number, number, number, number]];

/** One field as the layer draws it and the legend explains it. */
export interface FieldLook {
  /** The Map menu's and the legend's name. */
  name: string;
  /** The legend's title: the name and its unit. */
  title: string;
  /** The field's colour ramp, low to high, as the map draws it. */
  ramp: Stop[];
  /** The legend's bar, where it is not the ramp itself: a banded field's
   *  bands as equal blocks, so a narrow band (a ceiling under 500 ft) is
   *  read as well as a wide one. Its values are then the bands' places. */
  bar: Stop[];
  /** The legend's marks: a value at its place on the bar, or a word. */
  ticks: { at: number; label: string }[];
}

/** The menu's names, in its order (the owner's pick, 2026-11-12): the wind
 *  and what it carries first, then the sky, then the air. Known without
 *  the engine, so the Map menu's row needs none. */
const NAMES: Record<ShownField, string> = {
  wind: "Wind",
  gust: "Gusts",
  precip: "Precipitation",
  cloud: "Clouds",
  ceiling: "Ceiling",
  cape: "Thunderstorm energy",
  temp: "Temperature",
  vis: "Visibility",
};

/** The Map menu's and the legend's choices, Off first in the menu. */
export const FIELDS: { value: ShownField; label: string }[] = (Object.keys(NAMES) as ShownField[]).map((value) => ({
  value,
  label: NAMES[value],
}));

/** Whether a field is drawn with the wind's streaks over it: the wind and
 *  its gusts only, as Apple Weather's maps do (the owner's pick,
 *  2026-11-12); the others are a colour field alone. */
export const hasStreaks = (field: ShownField) => field === "wind" || field === "gust";

const tone = (hex: string, alpha: number): [number, number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  alpha,
];

/** The wind's field and the gusts': one hue deepening with speed, the
 *  map tinted rather than a rainbow, as Apple Weather's wind map is (the
 *  owner's screenshot, 2026-11-11); calm nearly clear. */
const WIND_RAMP: Stop[] = [
  [0, tone(WEATHER.flowWindCalm, 40)],
  [25, tone(WEATHER.flowWindBreeze, 140)],
  [50, tone(WEATHER.flowWindStrong, 190)],
  [75, tone(WEATHER.flowWindGale, 220)],
];
const KNOT_TICKS = [0, 25, 50, 75].map((at) => ({ at, label: String(at) }));

type Bands = EngineAnswer<"model_weather_bands">;
type Band = Bands["cape"][number];

/** A banded field's legend: each band an equal block of its colour, its
 *  word (and least figure, where `figure`) at the block's middle. */
function blocks(bands: Band[], colours: string[], figure: (from: number) => string | null) {
  const bar: Stop[] = bands.flatMap((_, i): Stop[] => [
    [i, tone(colours[i]!, 220)],
    [i + 0.999, tone(colours[i]!, 220)],
  ]);
  const ticks = bands.map((b, i) => {
    const f = figure(b.from);
    return { at: i + 0.5, label: f ? `${b.word} ${f}` : b.word };
  });
  return { bar, ticks };
}

const feet = (ft: number) => (ft > 0 ? ft.toLocaleString("en-US") : null);

/**
 * The fields' looks, from the engine's bands (model_weather_bands): the
 * precipitation's intensity words by reflectivity (AIM 7-1-12), the
 * ceiling's by AIM 7-1-7's categories, CAPE's by the NWS's. The colours
 * and how each fades in are the map's own.
 */
function looks(bands: Bands): Record<ShownField, FieldLook> {
  const [light, moderate, heavy, extreme] = bands.precip.bands;
  // Precipitation in the reflectivity a radar would see for its rate (the
  // engine's precip_dbz), so the model's hours and the radar's read
  // alike. Clear under the engine's least, as Apple Weather's
  // precipitation map draws only where it falls; blue to violet to
  // magenta to yellow, its ramp (the owner's screenshot, 2026-11-11). The
  // top a step past extreme's floor, where the brightest returns are.
  const least = bands.precip.least_dbz;
  const top = extreme!.from + 15;
  const rain: Stop[] = [
    [least - 0.1, tone(WEATHER.flowRainLight, 0)],
    [least, tone(WEATHER.flowRainLight, 160)],
    [moderate!.from, tone(WEATHER.flowRainModerate, 190)],
    [heavy!.from, tone(WEATHER.flowRainHeavy, 215)],
    [extreme!.from, tone(WEATHER.flowRainExtreme, 235)],
    [top, tone(WEATHER.flowRainExtremeTop, 245)],
  ];
  const edges = [light!.from, moderate!.from, heavy!.from, extreme!.from, top];
  const rainTicks = bands.precip.bands.map((b, i) => ({ at: (edges[i]! + edges[i + 1]!) / 2, label: b.word }));

  // The ceiling in the airport marks' category colours, hard-edged at the
  // bands, strongest lowest; over VFR's floor it fades to clear by twice
  // that, so the map is tinted where a ceiling matters, not everywhere.
  const ceilingColours = [WEATHER.flowCeilingLifr, WEATHER.flowCeilingIfr, WEATHER.flowCeilingMvfr, WEATHER.flowCeilingVfr];
  const ceilingAlpha = [220, 200, 170, 110];
  const vfr = bands.ceiling[bands.ceiling.length - 1]!.from;
  const ceiling: Stop[] = bands.ceiling.flatMap((b, i): Stop[] => {
    const next = bands.ceiling[i + 1]?.from;
    const start: Stop = [b.from, tone(ceilingColours[i]!, ceilingAlpha[i]!)];
    return next === undefined ? [start, [vfr * 2, tone(ceilingColours[i]!, 0)]] : [start, [next - 1, start[1]]];
  });

  // CAPE yellow to magenta, clear at none and filling in over the weak
  // band's lower half, so a calm map stays the chart.
  const capeColours = [WEATHER.flowCapeWeak, WEATHER.flowCapeModerate, WEATHER.flowCapeStrong, WEATHER.flowCapeExtreme];
  const [, capeModerate, capeStrong, capeExtreme] = bands.cape;
  const cape: Stop[] = [
    [0, tone(WEATHER.flowCapeWeak, 0)],
    [capeModerate!.from / 2, tone(WEATHER.flowCapeWeak, 130)],
    [capeModerate!.from, tone(WEATHER.flowCapeModerate, 170)],
    [capeStrong!.from, tone(WEATHER.flowCapeStrong, 200)],
    [capeExtreme!.from, tone(WEATHER.flowCapeExtreme, 225)],
  ];

  const plain = (name: ShownField, title: string, ramp: Stop[], ticks: FieldLook["ticks"]): FieldLook => ({
    name: NAMES[name],
    title,
    ramp,
    bar: ramp,
    ticks,
  });
  return {
    wind: plain("wind", "Wind (kt)", WIND_RAMP, KNOT_TICKS),
    gust: plain("gust", "Gusts (kt)", WIND_RAMP, KNOT_TICKS),
    precip: plain("precip", "Precipitation", rain, rainTicks),
    cloud: plain(
      "cloud",
      "Cloud cover (%)",
      [
        [0, tone(WEATHER.flowCloud, 0)],
        [50, tone(WEATHER.flowCloud, 110)],
        [100, tone(WEATHER.flowCloud, 215)],
      ],
      [0, 50, 100].map((at) => ({ at, label: String(at) })),
    ),
    ceiling: { name: NAMES.ceiling, title: "Ceiling (ft above ground)", ramp: ceiling, ...blocks(bands.ceiling, ceilingColours, feet) },
    cape: {
      name: NAMES.cape,
      title: "CAPE (J/kg)",
      ramp: cape,
      ...blocks(bands.cape, capeColours, (from) => (from > 0 ? from.toLocaleString("en-US") : null)),
    },
    temp: plain(
      "temp",
      "Temperature (°C)",
      [
        [-30, tone(WEATHER.flowTempFrigid, 170)],
        [-10, tone(WEATHER.flowTempCold, 170)],
        [0, tone(WEATHER.flowTempFreezing, 170)],
        [10, tone(WEATHER.flowTempCool, 170)],
        [20, tone(WEATHER.flowTempMild, 170)],
        [30, tone(WEATHER.flowTempWarm, 170)],
        [40, tone(WEATHER.flowTempHot, 170)],
      ],
      [-20, 0, 20, 40].map((at) => ({ at, label: String(at) })),
    ),
    vis: plain(
      "vis",
      "Visibility (SM)",
      [
        [0, tone(WEATHER.flowVisLow, 200)],
        [5, tone(WEATHER.flowVisHigh, 90)],
        [10, tone(WEATHER.flowVisHigh, 0)],
      ],
      [0, 5, 10].map((at) => ({ at, label: String(at) })),
    ),
  };
}

let built: Record<ShownField, FieldLook> | null = null;

/** A field's look, built once from the engine's bands: asked inside the
 *  flow layer, which waits for the engine (FlowGl's useEngineWhen). */
export function lookOf(field: ShownField): FieldLook {
  built ??= looks(callEngine("model_weather_bands", {}));
  return built[field];
}

/** The streaks, white with a breath of blue (Apple Weather's), fainter and
 *  shorter-lived where the wind is light, brighter where it is fast. */
export const STREAK_RAMP: Stop[] = [
  [0, tone(WEATHER.flowStreak, 70)],
  [15, tone(WEATHER.flowStreak, 170)],
  [40, tone(WEATHER.flowStreak, 255)],
];

/** The legend's bar as a CSS gradient, top the highest, its stops at their
 *  places between the ramp's first and last values. */
export function rampGradient(ramp: Stop[]): string {
  const low = ramp[0]![0],
    high = ramp[ramp.length - 1]![0];
  const stops = [...ramp].reverse().map(([at, [r, g, b, a]]) => {
    const hex = [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    // At least a quarter strong, so the bar's clear end still reads.
    const strength = Math.round((Math.max(a, 64) / 255) * 100);
    return `color-mix(in srgb, #${hex} ${strength}%, transparent) ${(((high - at) / (high - low)) * 100).toFixed(1)}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

/** A tick's place down the bar, 0 at the top. */
export function tickPlace(ramp: Stop[], at: number): number {
  const low = ramp[0]![0],
    high = ramp[ramp.length - 1]![0];
  return Math.min(1, Math.max(0, (high - at) / (high - low)));
}
