import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import { rowPoint, type NavLogRow } from "./navLogRows";

/** The engine's route_jurisdiction: which of the route's points and legs
 *  lie outside the United States, and the Brief's one line for them. */
export type RouteJurisdiction = EngineAnswer<"route_jurisdiction">;

/** The last few routes' answers by their points, so the timeline, the
 *  nav log and the Brief, each drawn again as the sheet moves, ask the
 *  engine once a route: a leg is checked every 2 nm. */
const kept = new Map<string, RouteJurisdiction>();
const KEPT_MAX = 6;

/**
 * Whose rules the route's points and legs are under (the engine's
 * route_jurisdiction; the owner's pick of 2026-11-21, decision 0053):
 * every figure the planner works out is by the FAA's rules, and a US
 * figure read as a Canadian one is wrong without saying so. Warn, never
 * limit: the plan is made as before, and said to be by US rules. The
 * points are the nav log's rows', in order (rowPoint); none for no rows.
 */
export function routeJurisdiction(rows: NavLogRow[]): RouteJurisdiction | null {
  if (rows.length === 0) return null;
  const points = rows.map((row) => {
    const { lat, lon } = rowPoint(row);
    return { lat, lon };
  });
  const key = points.map((p) => `${p.lat},${p.lon}`).join(";");
  let answer = kept.get(key);
  if (!answer) {
    answer = callEngine("route_jurisdiction", { points });
    if (kept.size >= KEPT_MAX) kept.delete(kept.keys().next().value!);
    kept.set(key, answer);
  }
  return answer;
}

/** Each row's warning, "Canada: rules not checked — figures use US
 *  rules": its own point's, else the leg's that arrives at it (a leg
 *  between two US points can cross Ontario); null in the United States. */
export function rowCautions(rows: NavLogRow[]): (string | null)[] {
  const answer = routeJurisdiction(rows);
  return rows.map((_, at) => answer?.points[at]?.caution ?? (at > 0 ? (answer?.legs[at - 1]?.caution ?? null) : null));
}
