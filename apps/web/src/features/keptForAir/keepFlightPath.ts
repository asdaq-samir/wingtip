import type { QueryClient } from "@tanstack/react-query";
import type { Course, WeatherLoop } from "../../lib/api/types";
import { CORRIDOR_NM, corridorTiles } from "../../lib/map/route/keepRoute";
import { routeProfileQuery } from "../../lib/queryClient";

/**
 * What the flight path reads in the air, kept with the route's answers
 * (keepRouteAnswers), which missed both (the offline audit's gap 6):
 *
 * - the route from the side (/api/route-profile): the ground under it and
 *   the Class B, C and D it passes through, which FPL's side view, the dry
 *   run and the printed nav log draw -- asked now, and the worker keeps it
 *   (planner-api);
 * - the newest radar picture over the route's corridor, the loop's tiles
 *   from the Iowa Environmental Mesonet, which the worker keeps as they
 *   pass (vite.config.ts, radar-frames): a kept loop was a frame list
 *   over a blank map. Within RADAR_MOST_BYTES and RADAR_MOST_TILES.
 */

/** The radar's zooms kept: a route's whole view to the mosaic's own
 *  kilometre (WeatherLoopGl's RADAR_MAX). */
const RADAR_ZOOMS = [6, 7, 8, 9, 10];
/** At most this many tiles and bytes of radar: one frame over a few
 *  hundred miles is well within them. */
const RADAR_MOST_TILES = 400;
const RADAR_MOST_BYTES = 20 * 1024 * 1024;
const CONCURRENCY = 6;

/** Keeps the route's side view; whether it could be had. */
export async function keepProfile(client: QueryClient, course: Course): Promise<boolean> {
  const stops = (course.stops ?? []).map((s) => s.ident);
  try {
    await client.fetchQuery({ ...routeProfileQuery(course.departure.ident, course.destination.ident, stops), staleTime: 0 });
    return true;
  } catch {
    return false;
  }
}

/** The tiles of a frame's template over the corridor, the nearest zooms
 *  first, so a cap leaves out the finest. */
export function radarTileUrls(template: string, line: [number, number][]): string[] {
  return corridorTiles(line, RADAR_ZOOMS, CORRIDOR_NM)
    .sort((a, b) => a.z - b.z)
    .slice(0, RADAR_MOST_TILES)
    .map((t) => template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y)));
}

/** Keeps the loop's newest radar picture over the route; whether any of
 *  it was kept, and its bytes. */
export async function keepRadar(loop: WeatherLoop, course: Course, signal?: AbortSignal): Promise<{ kept: boolean; bytes: number }> {
  const newest = [...loop.frames].reverse().find((f) => f.radar_tiles);
  if (!newest?.radar_tiles) return { kept: false, bytes: 0 };
  const urls = radarTileUrls(newest.radar_tiles, course.course_line as [number, number][]);
  let bytes = 0,
    kept = 0,
    next = 0;
  const worker = async () => {
    while (next < urls.length && bytes < RADAR_MOST_BYTES && !signal?.aborted) {
      const url = urls[next++]!;
      try {
        const res = await fetch(url, { signal, priority: "low" });
        if (!res.ok) continue;
        bytes += (await res.blob()).size;
        kept++;
      } catch {
        /* a tile missed is a gap in the picture, not a failure to keep */
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { kept: kept > 0, bytes };
}
