import { callEngine } from "../../lib/engine/engine";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { DRY_RUN, usePastFlight } from "./pastFlight";
import { useOwnShip, type Fix } from "../../lib/map/position/ownShip";
import { useFlying } from "../../lib/mapChrome";
import { dryRunRow, type DryRun } from "./dryRun";
import { isLegPoint, rowPoint, type NavLogRow } from "./navLogRows";

/**
 * The row the airplane is flying to: the leg being flown is the one that
 * arrives there. FlyingHead's next checkpoint, and the Route Leg sheet's
 * "Active Leg" (RouteLegCard), from the one place.
 *
 * In a dry run it is the run's own (the shared engine's dry_run, through
 * dryRunRow). From the GPS it is the engine's in_flight, as the phones'
 * InFlight asks it: the first checkpoint whose place along the course
 * line is ahead of the airplane's, with its distance direct from the fix,
 * the time at the fix's ground speed and the arrival.
 */

/** The course line's points, [lat, lon], as the planner sends it. */
export type CourseLine = [number, number][] | null | undefined;

/** The next checkpoint's row from `from`, skipping the tops of climb and
 *  descent; null past the last. */
function checkpointFrom(rows: NavLogRow[], from: number): number | null {
  for (let i = Math.max(1, from); i < rows.length; i++) if (!isLegPoint(rows[i]!)) return i;
  return null;
}

/** The dry run's next row at `t`, seconds into it. */
export function dryRunNext(run: DryRun, t: number): number | null {
  return checkpointFrom(run.rows, dryRunRow(run, t));
}

/** Own ship's next checkpoint from the GPS fix: its row, the miles to it
 *  direct, the minutes at the fix's ground speed and the arrival in Unix
 *  seconds (null below flying speed, the engine's `underway`), and whether
 *  the airplane is flying the route (the engine's `on_route`: at flying
 *  speed and within its 3 nm of the line, the debrief's tolerance, ACS
 *  PA.VI.A.S5), as the phones' InFlight asks it. The tops of climb and
 *  descent are not asked about, so the engine's next is a checkpoint. Null
 *  with no line, or no checkpoint past the departure. */
export function gpsAhead(
  rows: NavLogRow[],
  line: CourseLine,
  fix: Pick<Fix, "lat" | "lon" | "headingDeg" | "speedKt" | "at">,
): { index: number; nm: number; min: number | null; at: number | null; onRoute: boolean } | null {
  if (!line || line.length < 2) return null;
  const checkpoints = rows.flatMap((row, i) => (isLegPoint(row) ? [] : [i]));
  const answer = callEngine("in_flight", {
    fix: { lat: fix.lat, lon: fix.lon, track_deg: fix.headingDeg, speed_kt: fix.speedKt },
    line,
    points: checkpoints.map((i) => rowPoint(rows[i]!)),
    now_s: fix.at / 1000,
  });
  const next = answer?.next;
  if (!next) return null;
  return { index: checkpoints[next.index]!, nm: next.distance_nm, min: next.ete_min, at: next.eta_s, onRoute: answer.on_route };
}

/** The key of the row being flown to while flying mode is on (the dry
 *  run's, else own ship's), or null on the ground. */
export function useFlyingTo(run: DryRun | null, rows: NavLogRow[], line: CourseLine): string | null {
  const flying = useFlying((s) => s.flying);
  const dry = usePastFlight((s) => {
    if (!flying || !run || s.hex !== DRY_RUN || s.at === null) return null;
    const index = dryRunNext(run, s.at);
    return index === null ? null : run.rows[index]!.key;
  });
  // The next checkpoint from the fix is the engine's (in_flight): none
  // until its .wasm is there.
  const engine = useEngineReady();
  const gps = useOwnShip((s) => {
    if (!flying || run || !engine || !s.enabled || !s.fix) return null;
    const next = gpsAhead(rows, line, s.fix);
    return next === null ? null : rows[next.index]!.key;
  });
  return dry ?? gps;
}
