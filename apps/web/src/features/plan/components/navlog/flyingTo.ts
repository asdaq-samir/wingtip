import { useGeo, type Geo } from "../../../../lib/geo";
import { DRY_RUN, usePastFlight } from "../../map/pastFlight";
import { useOwnShip } from "../../../../lib/map/position/ownShip";
import { useFlying } from "../../../../lib/mapChrome";
import { dryRunRow, type DryRun } from "./dryRun";
import { isLegPoint, rowPoint, type NavLogRow } from "./rows";

/**
 * The row the airplane is flying to: the leg being flown is the one that
 * arrives there. FlyingHead's next checkpoint, and the Route Leg sheet's
 * "Active Leg" (RouteLegCard), from the one place.
 *
 * In a dry run it is the run's own (the shared engine's dry_run, through
 * dryRunRow). From the GPS, the first row not yet passed -- passed once own
 * ship has come within PASSED_NM of it, kept here.
 */

/** Within this of a checkpoint, own ship has passed it. */
const PASSED_NM = 1;
/** The rows own ship has passed, by key, from the GPS: kept across fixes
 *  and the rows' changes as legs come in, and let go with the position. */
const passed = new Set<string>();

/** The next checkpoint's row from `from`, skipping the tops of climb and
 *  descent; null past the last. */
function checkpointFrom(rows: NavLogRow[], from: number): number | null {
  for (let i = Math.max(1, from); i < rows.length; i++) if (!isLegPoint(rows[i]!)) return i;
  return null;
}

/** The dry run's next row at `t`, seconds into it. */
export function dryRunNext(run: DryRun, rows: NavLogRow[], t: number): number | null {
  return checkpointFrom(rows, dryRunRow(run, t));
}

/** Own ship's next row from the GPS fix, marking those it has passed. */
export function gpsNext(geo: Geo, rows: NavLogRow[], fix: { lat: number; lon: number }): number | null {
  let index = checkpointFrom(rows, 1);
  while (index !== null && (passed.has(rows[index]!.key) || geo.distanceNm(fix, rowPoint(rows[index]!)) < PASSED_NM)) {
    passed.add(rows[index]!.key);
    index = checkpointFrom(rows, index + 1);
  }
  return index;
}

/** The position let go: the rows passed are forgotten with it. */
export function forgetPassed(): void {
  passed.clear();
}

/** The key of the row being flown to while flying mode is on (the dry
 *  run's, else own ship's), or null on the ground. */
export function useFlyingTo(run: DryRun | null, rows: NavLogRow[]): string | null {
  const flying = useFlying((s) => s.flying);
  const dry = usePastFlight((s) => {
    if (!flying || !run || s.hex !== DRY_RUN || s.at === null) return null;
    const index = dryRunNext(run, rows, s.at);
    return index === null ? null : rows[index]!.key;
  });
  // How far the fix is from each row is the engine's (lib/geo): none
  // until its .wasm is there, as useAway waits.
  const geo = useGeo();
  const gps = useOwnShip((s) => {
    if (!flying || run || !geo || !s.enabled || !s.fix) return null;
    const index = gpsNext(geo, rows, s.fix);
    return index === null ? null : rows[index]!.key;
  });
  return dry ?? gps;
}
