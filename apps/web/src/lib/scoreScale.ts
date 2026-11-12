import { rgbOf } from "./rgb";
import { CHART, SCORE } from "./tokens";

/**
 * How good a checkpoint is, as a colour: one ochre hue, pale to dark,
 * more ink for a better landmark. The planner's scores and the training
 * workspace's ratings are the same scale, so each step is one colour in
 * both views.
 *
 * Not green-to-red. The route map draws its airports in the FAA's
 * flight-category colours, and the old scale's best and worst steps
 * were VFR green and IFR red to the hex -- so "red" meant both
 * "instrument conditions at the field" and "a weak landmark" on one
 * screen. Ochre is no flight category's hue. The steps were checked as
 * an ordinal ramp (one hue, even lightness steps, the palest still 2.4:1
 * against the markers' white casing) and are at least 13.8 OKLab units
 * from every flight-category colour.
 */
export const SCORE_STEPS = [SCORE.step1, SCORE.step2, SCORE.step3, SCORE.step4, SCORE.step5] as const;

/** Score bands, on the rating scale's own steps (above) so a
 *  colour means one thing across both views. */
export function scoreColor(s: number): string {
  if (s >= 4.5) return SCORE_STEPS[4];
  if (s >= 4.0) return SCORE_STEPS[3];
  if (s >= 3.5) return SCORE_STEPS[2];
  if (s >= 3.0) return SCORE_STEPS[1];
  return SCORE_STEPS[0];
}

/** Text or a number drawn on a step: white where it reads, ink where
 *  the step is too pale for white (the two palest). */
export function inkOn(fill: string): string {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(fill);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  // Contrast against white is (1.05) / (L + 0.05); below 4.5:1, ink.
  return 1.05 / (luminance + 0.05) >= 4.5 ? CHART.casing : CHART.fixInk;
}
