import type { Geo } from "../../geo";
import type { Declination } from "../../magnetic";
import { rulerWords, upright } from "./ruler";

// Where the ruler (RulerDrawing) is drawn on the screen, and its words.

/** The ruler's words clear of the fingertips at either end, in points. */
const FINGER_CLEAR = 36;
/** The band's least width, for its words to fit with the fingers close. */
const MIN_BAND = 220;

/** The ruler between `ends` on the screen: its words upright along it,
 *  read from whichever end is then on the left. */
type XY = { x: number; y: number };
export type Placed = ReturnType<typeof placed>;

export function placed(
  geo: Geo,
  at: (p: XY) => { lat: number; lon: number },
  [a, b]: readonly [XY, XY],
  declination: Declination | null,
  tasKt: number | null,
) {
  const { angleDeg, flipped } = upright(a, b);
  const [left, right] = flipped ? [b, a] : [a, b];
  const words = rulerWords(geo, at(left), at(right), declination, tasKt);
  const width = Math.max(MIN_BAND, Math.hypot(b.x - a.x, b.y - a.y) - 2 * FINGER_CLEAR);
  return { a, b, angleDeg, words, width, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}
