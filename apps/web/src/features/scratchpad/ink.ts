import { getStroke } from "perfect-freehand";
import type { Stroke } from "./padStore";

/**
 * The scratchpad's ink: who may draw (palm rejection, as PencilKit's
 * `drawingPolicy` does it -- once an Apple Pencil has drawn, a finger or
 * a resting palm does not), and a stroke's outline, perfect-freehand's
 * (MIT, Steve Ruiz's; the stroke tldraw draws), pressure from a pen and
 * simulated from a finger's speed.
 */

/** Whether a pointer draws: a pen always; a finger or a mouse only until
 *  a pen has drawn on this page, and never a second finger at once (two
 *  fingers are a scroll or a pinch, not ink). */
export function draws(pointerType: string, penSeen: boolean, primary: boolean): boolean {
  if (pointerType === "pen") return true;
  if (!primary) return false;
  return !penSeen;
}

/** A pointer's pressure as the stroke takes it: a pen's own, else none
 *  known (0.5, the Pointer Events default a mouse button reports). */
export const pressureOf = (pointerType: string, pressure: number) => (pointerType === "pen" && pressure > 0 ? pressure : 0.5);

/** A stroke's outline at a page `width` pixels wide, as an SVG path. */
export function strokePath(stroke: Stroke, width: number, size = 3): string {
  const outline = getStroke(
    stroke.points.map(([x, y, p]) => [x * width, y * width, p]),
    { size, thinning: stroke.pen ? 0.6 : 0.5, simulatePressure: !stroke.pen, smoothing: 0.5, streamline: 0.5 },
  );
  if (outline.length < 2) return "";
  // Each outline point and the midpoint to the next, as quadratic
  // curves, closed: perfect-freehand's README's getSvgPathFromStroke.
  const n = (v: number) => v.toFixed(2);
  let d = `M ${n(outline[0]![0]!)} ${n(outline[0]![1]!)} Q`;
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    d += ` ${n(x0!)} ${n(y0!)} ${n((x0! + x1!) / 2)} ${n((y0! + y1!) / 2)}`;
  });
  return `${d} Z`;
}
