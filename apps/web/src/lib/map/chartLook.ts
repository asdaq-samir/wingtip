/**
 * The chart's Dimmer and Contrast (the Map card's Look, under Sunlight;
 * the owner, 2026-11-18: "can we have a dimmer and contrast sliders under
 * sunlight and remove it from the appearance?"): plain figures, no map,
 * which the preferences keep, the sliders set and glStyle's chartPaint
 * draws. A display's look, not an aviation figure. The figures are
 * design/tokens.json's chart-look group (CHART_LOOK), one for the web and
 * both phones; each one's reason is there.
 */
import { CHART_LOOK } from "../tokens";

/** How far the chart is dimmed by default in the dark theme: to half its
 *  brightness (MapLibre's raster-brightness-max 0.5), the night's look
 *  before the Dimmer, so a pilot who never moves it sees the chart as
 *  before. In the light theme it is not dimmed. */
export const NIGHT_DIM = CHART_LOOK.nightDim;

/** The deepest dim: the paper's white at 30% (raster-brightness-max 0.3).
 *  There it is about sRGB 77, a luminance of 0.074, which against the
 *  chart's black type is a contrast of some 2.5 to 1, about the least its
 *  small print still reads at; darker, the paper's white falls under 2 to
 *  1 and the chart's blue and magenta inks, darker than the paper
 *  already, sink into its black. */
export const DIM_MAX = CHART_LOOK.dimMax;

/** The Contrast slider's offset from the look's own (day, night or
 *  sunlight; 0 is that look as it was): down to a flatter chart, up to a
 *  harder one. */
export const CONTRAST_MIN = CHART_LOOK.contrastMin;
export const CONTRAST_MAX = CHART_LOOK.contrastMax;

/** Each slider's step: twenty-odd stops across, fine enough to set by
 *  eye, coarse enough that a key press shows. */
export const LOOK_STEP = CHART_LOOK.step;

/** The Dimmer kept for each appearance: light none, dark the night's. */
export interface ChartDim {
  light: number;
  dark: number;
}
export const DEFAULT_CHART_DIM: ChartDim = { light: 0, dark: NIGHT_DIM };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Two decimals, so a sum such as 0.13 + 0.1 is the figure it reads as. */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** The chart's raster-brightness-max: 1 less the dim, within 0 to
 *  DIM_MAX. In sunlight by day always 1, the full brightness a sunlit
 *  screen needs, whatever the Dimmer says (it keeps its value for after).
 *  At night (the dark theme) the Dimmer holds even in sunlight: a light
 *  sensor misreading in a dark cockpit must not blind the pilot at full
 *  brightness (the owner, 2026-11-18); sunlight's contrast still adds. */
export function chartBrightness(dim: number, sunlight: boolean, night: boolean): number {
  return sunlightUndims(sunlight, night) ? 1 : round2(1 - clamp(dim, 0, DIM_MAX));
}

/** Whether sunlight sets the chart at full brightness over the Dimmer:
 *  by day only, so the Dimmer row is greyed exactly then. */
export function sunlightUndims(sunlight: boolean, night: boolean): boolean {
  return sunlight && !night;
}

/** The chart's raster-contrast: the look's own plus the pilot's offset
 *  (within CONTRAST_MIN to CONTRAST_MAX), kept inside MapLibre's -1 to 1. */
export function chartContrast(base: number, offset: number): number {
  return round2(clamp(base + clamp(offset, CONTRAST_MIN, CONTRAST_MAX), -1, 1));
}
