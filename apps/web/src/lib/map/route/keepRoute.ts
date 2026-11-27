import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartLayer, Course } from "../../api/types";
import { flatNm, M_PER_NM } from "../../geo";
import { kindCycle } from "../sources/tiles";
import { tileOf, worldMetresAt } from "../tileMath";
import { coursePoints } from "../../course";
// The route's answers noted as the page asks them, from its first load
// (routeAnswers' planner middleware): imported here, on the route's own
// chunk, not with the keep's fetching (keepFetch), which comes at the keep
// and so missed what the page asked before it, a kept route then opening
// offline with no course (flight-critical.spec, "offline from the first ask").
import "./routeAnswers";

/**
 * The tiles a route needs in the air, fetched now so the service
 * worker holds them: every tile of the base chart within the corridor
 * either side of the course line, at every zoom from a whole-route
 * view down to the chart's own detail. The map asks for exactly these
 * URLs later (its raster sources take the same 256-pixel {z}/{x}/{y},
 * glStyle), and the worker (vite.config.ts, chart-tiles) answers
 * from its cache before the network, connection or none.
 *
 * Sized for a phone: a 300 nm route at zooms 8 to 12 is about a
 * thousand tiles, fifteen megabytes, or some forty-five as the 512-pixel
 * tiles a 2x or 3x screen draws (tileDensity), each about 2.7 times a
 * 256-pixel one's bytes (the Chicago sheet, 2026-11-06). The fetches run a few at a time
 * so the map itself stays responsive while they land.
 *
 * The route's airports' diagrams come with them (airport-diagrams in
 * the worker), a third of a megabyte each, so a card opened on the
 * ground at the other end shows its field's with no network. And the
 * stops along it, at the owner's yes to keeping them for the air
 * (2026-10-23): the map's Stops list, and for each of its fields and the
 * route's own their services, their pictures' list and their aerial and
 * photo from the ground (routeStopsKept), so the list and a field's Info
 * and pictures open over a field with no signal. And the route's own
 * answers, its course and nav log among them (routeAnswers), which the
 * page's first load asked before the worker held it.
 */
export const CORRIDOR_NM = 10;

export interface KeepProgress {
  done: number;
  total: number;
  failed: number;
}

/** Tile width in nautical miles at a latitude and zoom: the Web Mercator
 *  world's width shrunk by the parallel's cosine. */
function tileNm(lat: number, zoom: number): number {
  return worldMetresAt(lat) / M_PER_NM / 2 ** zoom;
}

/** The {z, x, y} of every tile within the corridor, per zoom. */
export function corridorTiles(line: [number, number][], zooms: number[], corridorNm = CORRIDOR_NM): { z: number; x: number; y: number }[] {
  const tiles = new Map<string, { z: number; x: number; y: number }>();
  for (const z of zooms) {
    const n = 2 ** z;
    for (let i = 1; i < line.length; i++) {
      const [lat0, lon0] = line[i - 1]!;
      const [lat1, lon1] = line[i]!;
      const width = tileNm((lat0 + lat1) / 2, z);
      const reach = Math.ceil(corridorNm / width);
      // Samples every half a tile along the segment, a ring of tiles
      // `reach` deep around each -- the union is the corridor.
      const segmentNm = flatNm(lat1 - lat0, lon1 - lon0, (lat0 + lat1) / 2);
      const steps = Math.max(1, Math.ceil(segmentNm / (width / 2)));
      for (let s = 0; s <= steps; s++) {
        const lat = lat0 + ((lat1 - lat0) * s) / steps;
        const lon = lon0 + ((lon1 - lon0) * s) / steps;
        const { x: cx, y: cy } = tileOf(lat, lon, z);
        for (let x = cx - reach; x <= cx + reach; x++) {
          for (let y = Math.max(0, cy - reach); y <= Math.min(n - 1, cy + reach); y++) {
            const wrapped = ((x % n) + n) % n;
            tiles.set(`${z}/${wrapped}/${y}`, { z, x: wrapped, y });
          }
        }
      }
    }
  }
  return [...tiles.values()];
}

/** Whether a service worker can hold this app, which is what makes
 *  kept tiles come back without a network. */
export function keepingAvailable(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && window.isSecureContext;
}

/**
 * The one keep in progress, or the last one's outcome, held by the page
 * rather than by what started it: that lived in the pilot console's
 * Guide tab, and closing the console or changing tabs unmounted it and
 * cancelled the download, silently, and reopening it had lost where it
 * had got to. Which download it is (`key`) is the route, the chart, the
 * edition and the revision -- the tile URLs it fetches.
 */
type KeepJob =
  | { status: "idle" }
  | { status: "keeping"; key: string; progress: KeepProgress | null }
  | { status: "kept"; key: string; progress: KeepProgress }
  | { status: "failed"; key: string; detail: string };

export const useKeepJob = create<KeepJob>(() => ({ status: "idle" }));

/** How long a keep counts as kept: well inside the sixty days the
 *  worker holds a tile (vite.config.ts, chart-tiles). */
const KEPT_FOR_MS = 30 * 24 * 3600 * 1000;

/**
 * The keeps that finished, by key and when, remembered per browser: with
 * Keep for the Air on, a route opened again -- a reload, a saved
 * flight -- is not downloaded again while its tiles are still held.
 */
export const useKeptCharts = create<{ kept: Record<string, number> }>()(persist(() => ({ kept: {} }), { name: "wingtip.kept-charts" }));

export function keptAlready(key: string, now = Date.now()): boolean {
  const at = useKeptCharts.getState().kept[key];
  return at !== undefined && now - at < KEPT_FOR_MS;
}

function remember(key: string, now = Date.now()) {
  useKeptCharts.setState((s) => ({
    kept: Object.fromEntries([...Object.entries(s.kept).filter(([, at]) => now - at < KEPT_FOR_MS), [key, now]]),
  }));
}

export function keepKey(course: Course, kind: string): string {
  const route = coursePoints(course)
    .map((a) => a.ident)
    .join("->");
  const { cycle, revision } = kindCycle(course, kind);
  return `${route}/${kind}/${cycle}/${revision}`;
}

/** The zooms kept: from a whole-route view (8) down to the chart's own detail. */
export function keptZooms(layer: ChartLayer): number[] {
  return Array.from({ length: layer.max_zoom - 8 + 1 }, (_, i) => 8 + i).filter((z) => z >= layer.min_zoom);
}

let current: AbortController | null = null;

/** Keeps `layer`'s tiles of the route, cancelling any keep before it.
 *  Only the latest keep writes the job: an earlier one finishing late
 *  cannot overwrite it. */
export async function keep(course: Course, layer: ChartLayer): Promise<void> {
  current?.abort();
  const mine = new AbortController();
  current = mine;
  const key = keepKey(course, layer.kind);
  const write = (job: KeepJob) => {
    if (current === mine) useKeepJob.setState(job, true);
  };
  write({ status: "keeping", key, progress: null });
  try {
    // The fetching on a chunk of its own (keepFetch), asked for at the
    // keep: none of it is a route link's first load (route-load.spec).
    const { keepRouteCharts } = await import("./keepFetch");
    const progress = await keepRouteCharts(
      course,
      layer.kind,
      keptZooms(layer),
      (p) => write({ status: "keeping", key, progress: p }),
      mine.signal,
    );
    if (mine.signal.aborted) return;
    if (progress.failed < progress.total) remember(key);
    write({ status: "kept", key, progress });
  } catch (err) {
    write({ status: "failed", key, detail: err instanceof Error ? err.message : String(err) });
  } finally {
    if (current === mine) current = null;
  }
}

/** The keep in progress stopped, and nothing said of it: the setting
 *  turned off. */
export function stopKeeping(): void {
  if (!current) return;
  current.abort();
  current = null;
  useKeepJob.setState({ status: "idle" }, true);
}
