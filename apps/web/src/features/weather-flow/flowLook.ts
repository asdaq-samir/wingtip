import type { FlowField } from "../../lib/map/sources/weatherLayers";
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
  /** The field's colour ramp, low to high. */
  ramp: Stop[];
  /** The legend's marks: a value at its place on the bar, or a word. */
  ticks: { at: number; label: string }[];
}

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

/**
 * Precipitation in the reflectivity a radar would see for its rate (the
 * weather service's precip_dbz, the WSR-88D's Z-R relation), so the
 * model's hours and the radar's read alike, named by the AIM's WSR-88D
 * precipitation intensity terminology (AIM chapter 7, section 1, "Weather
 * Radar Services", its table "WSR-88D Weather Radar Precipitation
 * Intensity Terminology": under 30 dBZ light, 30 to 40 moderate, over 40
 * to 50 heavy, over 50 extreme). Clear where none
 * falls (under 10 dBZ, a trace), as Apple Weather's precipitation map
 * draws only where it falls; blue to violet to magenta to yellow, its
 * ramp (the owner's screenshot, 2026-11-11).
 * TODO(#482): the intensity bands belong to the engine with the rest of
 * the weather's words; the legend should ask them by name.
 */
const RAIN_RAMP: Stop[] = [
  [9.9, tone(WEATHER.flowRainLight, 0)],
  [10, tone(WEATHER.flowRainLight, 160)],
  [30, tone(WEATHER.flowRainModerate, 190)],
  [40, tone(WEATHER.flowRainHeavy, 215)],
  [50, tone(WEATHER.flowRainExtreme, 235)],
  [65, tone(WEATHER.flowRainExtremeTop, 245)],
];

const LOOKS: Record<ShownField, FieldLook> = {
  wind: { name: "Wind", title: "Wind (kt)", ramp: WIND_RAMP, ticks: KNOT_TICKS },
  gust: { name: "Gusts", title: "Gusts (kt)", ramp: WIND_RAMP, ticks: KNOT_TICKS },
  precip: {
    name: "Precipitation",
    title: "Precipitation",
    ramp: RAIN_RAMP,
    ticks: [
      { at: 20, label: "Light" },
      { at: 35, label: "Moderate" },
      { at: 45, label: "Heavy" },
      { at: 57, label: "Extreme" },
    ],
  },
  cloud: {
    name: "Clouds",
    title: "Cloud cover (%)",
    ramp: [
      [0, tone(WEATHER.flowCloud, 0)],
      [50, tone(WEATHER.flowCloud, 110)],
      [100, tone(WEATHER.flowCloud, 215)],
    ],
    ticks: [0, 50, 100].map((at) => ({ at, label: String(at) })),
  },
  temp: {
    name: "Temperature",
    title: "Temperature (°C)",
    ramp: [
      [-30, tone(WEATHER.flowTempFrigid, 170)],
      [-10, tone(WEATHER.flowTempCold, 170)],
      [0, tone(WEATHER.flowTempFreezing, 170)],
      [10, tone(WEATHER.flowTempCool, 170)],
      [20, tone(WEATHER.flowTempMild, 170)],
      [30, tone(WEATHER.flowTempWarm, 170)],
      [40, tone(WEATHER.flowTempHot, 170)],
    ],
    ticks: [-20, 0, 20, 40].map((at) => ({ at, label: String(at) })),
  },
  vis: {
    name: "Visibility",
    title: "Visibility (SM)",
    ramp: [
      [0, tone(WEATHER.flowVisLow, 200)],
      [5, tone(WEATHER.flowVisHigh, 90)],
      [10, tone(WEATHER.flowVisHigh, 0)],
    ],
    ticks: [0, 5, 10].map((at) => ({ at, label: String(at) })),
  },
};

export const lookOf = (field: ShownField): FieldLook => LOOKS[field];

/** The Map menu's and the legend's choices, Off first in the menu. */
export const FIELDS: { value: ShownField; label: string }[] = (Object.keys(LOOKS) as ShownField[]).map((value) => ({
  value,
  label: LOOKS[value].name,
}));

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
