import type { FlowField } from "../../lib/map/sources/weatherLayers";
import { callEngine } from "../../lib/engine/engine";
import type { EngineAnswer } from "../../lib/engine/engine";
import { FLOW, MAP, WEATHER } from "../../lib/tokens";
import { aviationLooks, tone } from "./aviationLooks";

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
  /** How strongly the field covers the chart, 0 to 1: the wind and its
   *  gusts a light tint, as the chart under them still has to be read;
   *  the temperature nearly solid, as Apple Weather's temperature map is
   *  (the owner's screenshot, 2026-11-12), the chart showing faintly; the
   *  precipitation as strong, but only where it falls (its ramp is clear
   *  elsewhere). The airports, the route and the airspace stay over all
   *  of them (FlowGl's slot). */
  opacity: number;
}

/** The field's cover over the chart by kind (FieldLook.opacity). */
const COVER = FLOW.cover;

/** The menu's names, in its order (the owner's pick, 2026-11-12): the wind
 *  and what it carries first, then the sky, then the air, then the
 *  Aviation Weather Center's hazards aloft. Known without the engine, so
 *  the Map menu's row needs none. */
const NAMES: Record<ShownField, string> = {
  wind: "Wind",
  gust: "Gusts",
  precip: "Precipitation",
  cloud: "Clouds",
  ceiling: "Ceiling",
  cape: "Thunderstorm energy",
  temp: "Temperature",
  vis: "Visibility",
  icing: "Icing",
  turb: "Turbulence",
  frzlvl: "Freezing level",
  tops: "Cloud tops",
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

/** The wind's field and the gusts': one hue deepening with speed, the
 *  map tinted rather than a rainbow, as Apple Weather's wind map is (the
 *  owner's screenshot, 2026-11-11); calm nearly clear. */
const WIND_RAMP = FLOW.ramp.wind;
const KNOT_TICKS = FLOW.scale.windTicks.map((at) => ({ at, label: String(at) }));

type Bands = EngineAnswer<"model_weather_bands">;
type Band = Bands["cape"][number];

/** A banded field's legend: each band an equal block of its colour, its
 *  word (and least figure, where `figure`) at the block's middle. */
function blocks(bands: Band[], colours: string[], figure: (from: number) => string | null) {
  const bar: Stop[] = bands.flatMap((_, i): Stop[] => [
    [i, tone(colours[i]!, FLOW.alpha.block)],
    [i + 0.999, tone(colours[i]!, FLOW.alpha.block)],
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
  const top = extreme!.from + FLOW.scale.rainHeadroom;
  const a = FLOW.alpha.rain;
  const rain: Stop[] = [
    [least - 0.1, tone(WEATHER.flowRainLight, a[0]!)],
    [least, tone(WEATHER.flowRainLight, a[1]!)],
    [moderate!.from, tone(WEATHER.flowRainModerate, a[2]!)],
    [heavy!.from, tone(WEATHER.flowRainHeavy, a[3]!)],
    [extreme!.from, tone(WEATHER.flowRainExtreme, a[4]!)],
    [top, tone(WEATHER.flowRainExtremeTop, a[5]!)],
  ];
  const edges = [light!.from, moderate!.from, heavy!.from, extreme!.from, top];
  const rainTicks = bands.precip.bands.map((b, i) => ({ at: (edges[i]! + edges[i + 1]!) / 2, label: b.word }));

  // The ceiling in the airport marks' category colours, hard-edged at the
  // bands, strongest lowest; over VFR's floor it fades to clear by twice
  // that, so the map is tinted where a ceiling matters, not everywhere.
  const ceilingColours = [WEATHER.flowCeilingLifr, WEATHER.flowCeilingIfr, WEATHER.flowCeilingMvfr, WEATHER.flowCeilingVfr];
  const ceilingAlpha = FLOW.alpha.ceiling;
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
  const c = FLOW.alpha.cape;
  const cape: Stop[] = [
    [0, tone(WEATHER.flowCapeWeak, c[0]!)],
    [capeModerate!.from / 2, tone(WEATHER.flowCapeWeak, c[1]!)],
    [capeModerate!.from, tone(WEATHER.flowCapeModerate, c[2]!)],
    [capeStrong!.from, tone(WEATHER.flowCapeStrong, c[3]!)],
    [capeExtreme!.from, tone(WEATHER.flowCapeExtreme, c[4]!)],
  ];

  const plain = (name: ShownField, title: string, ramp: Stop[], ticks: FieldLook["ticks"], opacity: number = COVER.wash): FieldLook => ({
    name: NAMES[name],
    title,
    ramp,
    bar: ramp,
    ticks,
    opacity,
  });
  return {
    wind: plain("wind", "Wind (kt)", WIND_RAMP, KNOT_TICKS, COVER.tint),
    gust: plain("gust", "Gusts (kt)", WIND_RAMP, KNOT_TICKS, COVER.tint),
    precip: plain("precip", "Precipitation", rain, rainTicks, COVER.solid),
    cloud: plain(
      "cloud",
      "Cloud cover (%)",
      FLOW.ramp.cloud,
      [0, 50, 100].map((at) => ({ at, label: String(at) })),
    ),
    ceiling: {
      name: NAMES.ceiling,
      title: "Ceiling (ft above ground)",
      ramp: ceiling,
      opacity: COVER.wash,
      ...blocks(bands.ceiling, ceilingColours, feet),
    },
    cape: {
      name: NAMES.cape,
      opacity: COVER.wash,
      title: "CAPE (J/kg)",
      ramp: cape,
      ...blocks(bands.cape, capeColours, (from) => (from > 0 ? from.toLocaleString("en-US") : null)),
    },
    // Solid, as Apple Weather's temperature map is, held at the hot end
    // to 45 so the legend's six marks fall evenly, every 15 degrees.
    temp: plain(
      "temp",
      "Temperature (°C)",
      FLOW.ramp.temp,
      [-30, -15, 0, 15, 30, 45].map((at) => ({ at, label: String(at) })),
      COVER.solid,
    ),
    vis: plain(
      "vis",
      "Visibility (SM)",
      FLOW.ramp.vis,
      [0, 5, 10].map((at) => ({ at, label: String(at) })),
    ),
    ...aviationLooks(callEngine("aviation_grid_bands", {})),
  };
}

let built: Record<ShownField, FieldLook> | null = null;

/** A field's look, built once from the engine's bands: asked inside the
 *  flow layer, which waits for the engine (FlowGl's useEngineWhen). */
export function lookOf(field: ShownField): FieldLook {
  built ??= looks(callEngine("model_weather_bands", {}));
  return built[field];
}

/** The streaks, white with a breath of blue (Apple Weather's), fainter
 *  where the wind is light, brighter where it is fast. Each is brightest
 *  at its head: weatherlayers-gl fades a streak's tail to nothing along
 *  its length (ParticleLineLayer's opacity, 1 - age / maxAge), so the
 *  head can be near white without the lines reading as solid. */
export const STREAK_RAMP = FLOW.ramp.streak;

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

/** The streaks on a phone and on a larger screen: many, as Apple Weather's
 *  map has them (the owner's screenshots, 2026-11-12). weatherlayers-gl
 *  draws each streak as maxAge line segments (ParticleLineLayer keeps
 *  numParticles x maxAge of them on the GPU and moves them every frame),
 *  so what an iPhone has to draw is the segments: the count is held under
 *  a budget of them, and a longer life at a low zoom draws fewer streaks. */
const STREAKS_PHONE = 6000;
const STREAKS_WIDE = 12000;
const SEGMENTS_PHONE = 240_000;
const SEGMENTS_WIDE = 480_000;
/**
 * How many frames a streak lives at a zoom, and how far it moves a frame
 * for a knot, so how long its trail is, the tail fading along it
 * (ParticleLineLayer's opacity, 1 - age / maxAge; weatherlayers-gl
 * divides the speed by the zoom's scale, so a trail is as long on the
 * screen at every zoom unless these change). Close in, mid-length lines,
 * as Apple Weather's are over a city -- twice the 12 frames at 1.2 that
 * read as dashes on the owner's iPhone, short of the 22 at 2 that read as
 * falling rain (the owner's screenshots, 2026-11-12); zoomed out, long
 * curving flow lines that trace the circulation, a low's spiral seen
 * whole, as Apple's map over an ocean (the owner's second screenshot):
 * about four times as long by zoom 3. By whole zoom levels, as a change
 * of life rebuilds the layer's buffers.
 */
function streakLife(zoom: number) {
  const out = Math.max(0, MAP.zoomStreakNear - Math.round(zoom));
  return { age: Math.min(64, 24 + out * 10), speed: Math.min(2, 1.3 + out * 0.175) };
}

/** The streaks at a zoom on a screen: their life and speed, and as many
 *  as the segment budget allows at that life. */
export function streaksAt(zoom: number, phone: boolean) {
  const { age, speed } = streakLife(zoom);
  const most = phone ? STREAKS_PHONE : STREAKS_WIDE;
  return { age, speed, count: Math.min(most, Math.floor((phone ? SEGMENTS_PHONE : SEGMENTS_WIDE) / age)) };
}
