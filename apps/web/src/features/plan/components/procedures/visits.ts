import { sameField } from "../../../../lib/procedures";

/** The place among the typed points of a point's `n`th visit (0 the
 *  first), or -1: a fix along an airway is no typed point. The departure,
 *  a field's own step, is never one of these rows. A fix flown twice (out
 *  and back over VPBNG) is two typed points, and each visit's menu works
 *  on its own (the audit's WEB-2). */
export function nthTyped(routePoints: readonly string[], ident: string, n: number): number {
  let left = n;
  for (let j = 1; j < routePoints.length; j++) {
    if (!sameField(routePoints[j]!, ident)) continue;
    if (left === 0) return j;
    left--;
  }
  return -1;
}
