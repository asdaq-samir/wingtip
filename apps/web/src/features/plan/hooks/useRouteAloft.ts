import { useMemo } from "react";
import type { AloftPoint } from "../map/terrain/geometry";
import type { TerrainMode } from "../map/terrain/useTerrainView";
import { dryRunOf } from "../components/navlog/dryRun";
import type { NavLogRow } from "../components/navlog/rows";

/**
 * The route at the plan's altitudes, for the 3D map to draw in the air
 * (TerrainGl's AloftGl): the dry run's points (the engine's `dry_run`,
 * along the course line, the climbs, levels and 3:1 descents of the
 * plan's profile) without playing it. Only in 3D, as nothing else draws
 * it; null otherwise and before the legs are in.
 */
export function useRouteAloft(mode: TerrainMode, rows: NavLogRow[] | undefined, line: [number, number][] | null): AloftPoint[] | null {
  return useMemo(() => {
    if (mode !== "3d" || !rows || !line) return null;
    const run = dryRunOf(rows, 0, line);
    return run.points.length > 1 ? run.points.map((p) => ({ lat: p.lat, lon: p.lon, altFt: p.alt_ft ?? 0 })) : null;
  }, [mode, rows, line]);
}
