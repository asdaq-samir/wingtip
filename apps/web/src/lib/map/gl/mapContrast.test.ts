import { describe, expect, it } from "vitest";
import { luminanceOf, scaledHex } from "../../rgb";
import { CHART, CHART_PAINT, MAP_LABEL } from "../../tokens";
import { CONTRAST_MAX, CONTRAST_MIN, DIM_MAX, LOOK_STEP, chartBrightness, chartContrast } from "../chartLook";
import { labelInk } from "./layers/common";
import { mapDimWords } from "./mapDim";

/** WCAG 2's contrast ratio of two luminances. */
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** The night's own raster-contrast (glStyle's chartPaint). */
const NIGHT_CONTRAST = CHART_PAINT.nightContrast;
/** The night's default Dimmer (chart-look.night-dim). */
const DEFAULT_DIM = 0.5;
/** The night's reds: a TFR's edge and an obstacle in the warning band
 *  (hazard's LEVEL_COLOUR); the amber of the caution band. */
const REDS = [CHART.tfr, CHART.warning];

/** Every step of the Map card's Contrast, -30% to +40%. */
function offsets(): number[] {
  const out: number[] = [];
  for (let o = CONTRAST_MIN; o <= CONTRAST_MAX + 1e-9; o += LOOK_STEP) out.push(Math.round(o * 100) / 100);
  return out;
}

/** The paper's luminance and the figures set at a Contrast offset and a
 *  Dimmer, at night: the chart's white through the raster's contrast,
 *  then its brightness, as MapLibre draws it (mapDimWords' paper). */
function at(offset: number, dim = DEFAULT_DIM) {
  const b = chartBrightness(dim, false, true);
  const k = chartContrast(NIGHT_CONTRAST, offset);
  const { paper, warning, words } = mapDimWords(true, b, k);
  return { paper: luminanceOf(scaledHex("#ffffff", paper)), b, warn: warning, words };
}

/**
 * The night's marks against the chart's paper across the Map card's whole
 * Contrast range at the default Dimmer (the themes audit, round 6, N3: the
 * TFR's red fell to 2.57:1 at -30% when it was dimmed by the chart's
 * brightness alone). Past about 65% of the Dimmer no mark can reach 3:1
 * on the paper, even black: the pilot's choice (rules.md).
 */
describe("the night's warnings across the Contrast range", () => {
  it("hold the TFR's and the obstacles' red at 3:1 or more over the paper", () => {
    for (const o of offsets()) {
      const { paper, warn } = at(o);
      for (const red of REDS) expect(ratio(luminanceOf(scaledHex(red, warn)), paper), `${red} at ${o}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keep the amber obstacle 3:1 on its dark ring and the ring 4:1 on the paper", () => {
    for (const o of offsets()) {
      const { paper, b } = at(o);
      const ring = luminanceOf(scaledHex(CHART.routeEdge, b));
      expect(ratio(luminanceOf(scaledHex(CHART.caution, b)), ring), `amber at ${o}`).toBeGreaterThanOrEqual(3);
      expect(ratio(ring, paper), `ring at ${o}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("never draw a warning brighter than the chart's paper", () => {
    for (const dim of [0, DEFAULT_DIM, DIM_MAX])
      for (const o of offsets()) {
        const { paper, warn } = at(o, dim);
        for (const red of REDS) expect(luminanceOf(scaledHex(red, warn)), `${red} at ${o}, ${dim}`).toBeLessThanOrEqual(paper);
      }
  });
});

describe("the map's words at night", () => {
  it("read 4.1:1 or more on their whole dark halo at the default Dimmer and Contrast, none brighter than the paper", () => {
    const { paper, words } = at(0);
    for (const day of Object.keys(MAP_LABEL.nightInk)) {
      const ink = ((labelInk(day) as unknown[])[2] as unknown[])[6] as string;
      const word = luminanceOf(scaledHex(ink, words));
      expect(ratio(word, luminanceOf(CHART.tag)), day).toBeGreaterThanOrEqual(4.1);
      expect(word, day).toBeLessThanOrEqual(paper * 1.05);
    }
  });

  it("read 4.5:1 or more on their halo across the whole Contrast range at the default Dimmer", () => {
    // Under the night's own contrast the paper darkens; the words' share
    // keeps to map-dim.word-floor there (the TFR's number 4.57:1 at -30%).
    for (const o of offsets()) {
      const { words } = at(o);
      for (const day of Object.keys(MAP_LABEL.nightInk)) {
        const ink = ((labelInk(day) as unknown[])[2] as unknown[])[6] as string;
        expect(ratio(luminanceOf(scaledHex(ink, words)), luminanceOf(CHART.tag)), `${day} at ${o}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("still dim with the Dimmer under the floor, none brighter than the paper at the night's contrast", () => {
    const { paper, words } = at(0, DIM_MAX);
    expect(words).toBeLessThan(0.75);
    for (const day of Object.keys(MAP_LABEL.nightInk)) {
      const ink = ((labelInk(day) as unknown[])[2] as unknown[])[6] as string;
      expect(luminanceOf(scaledHex(ink, words)), day).toBeLessThanOrEqual(paper * 1.05);
    }
  });
});
