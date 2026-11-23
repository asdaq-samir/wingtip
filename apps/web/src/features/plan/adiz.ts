import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import { rowPoint, type NavLogRow } from "./navLogRows";

/** The engine's route_adiz: the Air Defense Identification Zones the
 *  route's points and legs meet, and the Brief's one line for them. */
export type RouteAdiz = EngineAnswer<"route_adiz">;

/** The last few routes' answers by their points, as routeJurisdiction
 *  keeps its own: a leg is checked every 2 nm. */
const kept = new Map<string, RouteAdiz>();
const KEPT_MAX = 6;

/**
 * The ADIZs the route meets (the engine's route_adiz; 14 CFR 99.41-99.49):
 * a flight into, within or out of one is asked for a flight plan, a
 * listening watch, its transponder and a report before it crosses (99.9,
 * 99.11, 99.13, 99.15), which the Brief says once. Warn, never limit. The
 * points are the nav log's rows', in order (rowPoint); none for no rows.
 */
export function routeAdiz(rows: NavLogRow[]): RouteAdiz | null {
  if (rows.length === 0) return null;
  const points = rows.map((row) => {
    const { lat, lon } = rowPoint(row);
    return { lat, lon };
  });
  const key = points.map((p) => `${p.lat},${p.lon}`).join(";");
  let answer = kept.get(key);
  if (!answer) {
    answer = callEngine("route_adiz", { points });
    if (kept.size >= KEPT_MAX) kept.delete(kept.keys().next().value!);
    kept.set(key, answer);
  }
  return answer;
}
