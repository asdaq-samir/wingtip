import { TAP } from "./layers/common";

/** A leg of the route, row to row of the nav log, for a tap on the course
 *  to find (routeLegs): keyed by the row it arrives at. */
export interface GlLeg {
  key: string;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
}

type Px = { x: number; y: number };

/** How far from the course a tap still picks a leg, px: a finger's half
 *  width, 22 either side of the line (a 44-point target, Apple's Human
 *  Interface Guidelines), as the chart's marks have (TAP.mark). */
export const LEG_REACH = TAP.mark;

/** Where a tap on the course stands among the map's taps: after every
 *  mark -- the route's airports and checkpoints, the chart's fields,
 *  navaids and fixes, which a tap on the line beside them still opens --
 *  and before the airspace's lines under it (TAP.rank.line). */
export const LEG_RANK = TAP.rank.line - 0.5;

/** The distance from `p` to the segment a-b, px. */
function toSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The leg nearest a tap on the screen: the legs' ends projected as the
 *  map is now, each leg the straight line between them. */
export function nearestLeg(legs: GlLeg[], tap: Px, project: (p: { lat: number; lon: number }) => Px): GlLeg | null {
  let best: GlLeg | null = null,
    bestPx = Infinity;
  for (const leg of legs) {
    const px = toSegment(tap, project(leg.from), project(leg.to));
    if (px < bestPx) {
      best = leg;
      bestPx = px;
    }
  }
  return best;
}
