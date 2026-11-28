import { useMemo } from "react";
import type { AloftPoint } from "./terrain/geometry";
import type { TerrainMode } from "./terrain/useTerrainView";
import { dryRunOf, legOf, type NavLogRow } from "../plan";

/**
 * The route at the plan's altitudes, for the 3D map to draw in the air
 * (TerrainGl's AloftGl): the dry run's points (the engine's `dry_run`,
 * along the course line, the climbs, levels and 3:1 descents of the
 * plan's profile) without playing it, each with the altitude of the nav
 * log's leg it is on, which the ground near the route is coloured against
 * (ClearanceGl). Only in 3D, as nothing else draws it; null otherwise and
 * before the legs are in.
 */
export function useRouteAloft(mode: TerrainMode, rows: NavLogRow[] | undefined, line: [number, number][] | null): AloftPoint[] | null {
  return useMemo(() => {
    if (mode !== "3d" || !rows || !line) return null;
    const run = dryRunOf(rows, 0, line);
    if (run.points.length < 2) return null;
    // The leg a point is on is the row the run reaches next (rowT, a time
    // a row): the leg that row ends.
    let row = 1;
    // A point with no height carries the last good one, and none before
    // the first is drawn: never at 0 ft.
    let last: number | null = null;
    return run.points.flatMap((p) => {
      while (row < run.rowT.length - 1 && p.t > run.rowT[row]!) row++;
      const altFt = p.alt_ft ?? last;
      if (altFt == null) return [];
      last = altFt;
      return [{ lat: p.lat, lon: p.lon, altFt, legFt: legOf(rows[row]!)?.altitude_ft ?? altFt }];
    });
  }, [mode, rows, line]);
}
