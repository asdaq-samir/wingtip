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

/** The rows the engine is asked about: the route's own points, its
 *  departure, stops and destination. The checkpoints and the tops of climb
 *  and descent lie on the legs between them, so the legs are the same. */
const isRoutePoint = (row: NavLogRow) => row.kind === "departure" || row.kind === "stop" || row.kind === "destination";

/**
 * Whose rules the route's points and legs are under (the engine's
 * route_jurisdiction; the owner's pick of 2026-11-21, decision 0053):
 * every figure the planner works out is by the FAA's rules, and a US
 * figure read as a Canadian one is wrong without saying so. Warn, never
 * limit: the plan is made as before, and said to be by US rules. The
 * points are the route's own rows' (isRoutePoint), named as the log names
 * them, so the engine's words say which field or leg; none for no rows.
 */
export function routeJurisdiction(rows: NavLogRow[]): RouteJurisdiction | null {
  const points = rows.filter(isRoutePoint).map((row) => rowPoint(row));
  if (points.length === 0) return null;
  const key = points.map((p) => `${p.name},${p.lat},${p.lon}`).join(";");
  let answer = kept.get(key);
  if (!answer) {
    answer = callEngine("route_jurisdiction", { points });
    if (kept.size >= KEPT_MAX) kept.delete(kept.keys().next().value!);
    kept.set(key, answer);
  }
  return answer;
}

/** A row's warnings, the engine's words: `at`, where the route's point at
 *  it lies outside the United States ("CYQT is in Canada (Ontario): …");
 *  `leaving`, where the leg from it on to the next point crosses a country
 *  neither end is in ("The leg to KBUF crosses Canada (Ontario): …"), said
 *  on that leg, never as the next field's. Both null on a row between. */
export interface RowCaution {
  at: string | null;
  leaving: string | null;
}

/** Each row's warnings (RowCaution), the nav log's rows in order. */
export function rowCautions(rows: NavLogRow[]): RowCaution[] {
  const answer = routeJurisdiction(rows);
  let point = -1;
  return rows.map((row) => {
    if (!isRoutePoint(row)) return { at: null, leaving: null };
    point += 1;
    return { at: answer?.points[point]?.caution ?? null, leaving: answer?.legs[point]?.caution ?? null };
  });
}
