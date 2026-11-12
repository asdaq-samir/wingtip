import type { Layout } from "../gl/markLayers";
import type { GlPicture } from "../gl/useGlSymbols";
import { framed } from "../marks/markPictures";
import { CHART } from "../../tokens";

/** A way FPL's route line offers beside the route (its chips), as the map
 *  draws it: its line and the words on its chip. */
export interface RouteWay {
  key: string;
  path: [number, number][];
  /** Its time, "3 h 40 min". */
  label: string;
  /** Its name, said on its callout while it is the one shown, "Best Weather". */
  name?: string;
  /** Where along it its chip sits, a share of its length: given by the
   *  caller so it holds as the other ways come and go (else by place). */
  share?: number;
}

/** Where along each way its chip sits, a share of its length, one apiece. */
export const WAY_SHARES = [0.35, 0.6, 0.8];
/** The chip's fill: the line's magenta a step darker, white words at 13
 *  points on it 6:1 (WCAG 1.4.3 asks 4.5; the line's own #e600e6 is 3.8). */
const WAY_CHIP = CHART.courseChip;

/** The chip on a way's line: its time and, on the one shown, its name
 *  under it, as Maps marks the routes beside the one picked -- the one
 *  shown filled in the line's magenta, the others white with the time in
 *  magenta -- with a tail down to the line from its lower left, the
 *  tail's tip on the point. Stretched to its words (icon-text-fit), ten
 *  points either side and four above and under; WAY_CHIP_PLACE puts the
 *  words where the tail's tip falls on the point. */
export function wayChip(shown: boolean): GlPicture {
  const fill = shown ? WAY_CHIP : CHART.casing;
  return framed(
    `way-chip|${shown ? 1 : 0}`,
    () => `<rect width="48" height="24" rx="12" fill="${fill}"/><path d="M8 23.5L14 32L20 23.5Z" fill="${fill}"/>`,
    48,
    32,
    { inset: 12, x: [22, 34], y: [11.5, 12.5], content: [10, 4, 38, 20] },
  );
}
/** The words' ink on each chip. */
export const wayInk = (shown: boolean) => (shown ? CHART.casing : WAY_CHIP);
/** The words' bottom left 4 points left of the tip and 12 above it (the
 *  content's corner at 10, 20; the tip at 14, 32), in ems of 13 points. */
export const WAY_CHIP_PLACE: Layout = { "text-anchor": "bottom-left", "text-offset": [-4 / 13, -12 / 13] };

/** Where a way's chip sits: `share` of the way along it. */
export function wayAt(path: [number, number][], share: number): [number, number] {
  const legs = path.slice(1).map((b, i) => {
    const a = path[i]!;
    return Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180));
  });
  let left = legs.reduce((sum, d) => sum + d, 0) * share;
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i]! || i === legs.length - 1) {
      const a = path[i]!,
        b = path[i + 1]!,
        t = legs[i] ? Math.min(1, left / legs[i]!) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= legs[i]!;
  }
  return path[0]!;
}
