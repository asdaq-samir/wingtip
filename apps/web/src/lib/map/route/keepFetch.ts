import { api } from "../../api/client";
import type { Course } from "../../api/types";
import { diagramPicture, diagramRunwaysPicture } from "../../diagram";
import { courseFields } from "../../course";
import { tileUrl } from "../sources/tiles";
import { routeAnswersAsked } from "./routeAnswers";
import { corridorTiles, keepingAvailable, type KeepProgress } from "./keepRoute";

// Keep for the Air's fetching (keepRoute's keep), on a chunk of its own:
// the wait for the service worker, the route's answers, diagrams, stops
// and corridor tiles are asked only when a route is kept, so none of it
// is in a route link's first load (route-load.spec).

/** The fetches run a few at a time so the map itself stays responsive while they land. */
const CONCURRENCY = 6;

/** How long to wait for the service worker to be ready. The dev server
 *  registers none, and `ready` then never settles: "Keeping…" sat there
 *  for ever. */
export const WORKER_WAIT_MS = 5000;

class NoServiceWorker extends Error {
  constructor() {
    super("No service worker is holding this app here, so nothing would be kept. The dev server registers none.");
    this.name = "NoServiceWorker";
  }
}

async function workerReady(): Promise<boolean> {
  if (!keepingAvailable()) return false;
  return workerHolds(navigator.serviceWorker, WORKER_WAIT_MS);
}

/**
 * Whether a service worker holds this page, waited for up to `waitMs`:
 * active (`ready`) and the page's controller. `ready` comes as the worker
 * activates, a moment before it claims the page (vite.config.ts'
 * clientsClaim): a keep begun between the two asked the route's course
 * and nav log straight of the network, round a worker that never saw
 * them, and offline the route opened again sat at "Drawing Route…" with
 * no Nav Log (flight-critical.spec's "offline from the first ask" on
 * CI's iPad, run 45122610478, where the keep starts sooner after a first
 * load than on a phone held in the hand).
 */
export async function workerHolds(
  sw: Pick<ServiceWorkerContainer, "ready" | "controller" | "addEventListener" | "removeEventListener">,
  waitMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let claimed: (() => void) | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  const holds = sw.ready.then(
    () =>
      sw.controller !== null ||
      new Promise<true>((resolve) => {
        claimed = () => resolve(true);
        sw.addEventListener("controllerchange", claimed, { once: true });
      }),
  );
  try {
    return await Promise.race([holds, late]);
  } finally {
    clearTimeout(timer);
    if (claimed) sw.removeEventListener("controllerchange", claimed);
  }
}

/** The route's airports' diagrams and their runway crops, by their cards
 *  (cached by the worker too): none for a waypoint, a field with none, or
 *  a card that could not be had. A field may have a diagram and no crop. */
async function routeDiagrams(course: Course): Promise<string[]> {
  const idents = [...new Set(courseFields(course).map((a) => a.ident))];
  const cards = await Promise.allSettled(idents.map((ident) => api.airport(ident)));
  return cards.flatMap((card) =>
    card.status === "fulfilled" && card.value.airport_diagram_cycle
      ? [
          diagramPicture(card.value.ident, card.value.airport_diagram_cycle),
          // The runways' crop only where the planner says the cycle has
          // one: asked for anyway, it was a 404 on every keep (WEB-41).
          ...(card.value.airport_diagram_runways === false
            ? []
            : [diagramRunwaysPicture(card.value.ident, card.value.airport_diagram_cycle)]),
        ]
      : [],
  );
}

/** The route's Stops (api.stopsAlong, the same address the Stops card
 *  asks, so the worker has the one it reads offline) and, for each of its fields and the
 *  route's own airports, the field's services, its pictures' list and the
 *  pictures themselves: what the Stops card and a field's Info and
 *  pictures ask for, so the worker has them (airport-extras,
 *  airport-pictures). Its own fetches, the lists'; the rest as URLs to
 *  fetch with the tiles. None where the planner cannot be asked. */
export async function routeStopsKept(course: Course): Promise<string[]> {
  const own = courseFields(course).map((a) => a.ident);
  const stops = await api
    .stopsAlong(course.departure.ident, course.destination.ident, (course.stops ?? []).map((s) => s.ident).join(","))
    .catch(() => null);
  const idents = [...new Set([...own, ...(stops?.fields ?? []).map((f) => f.ident)])];
  const pictures = await Promise.allSettled(idents.map((ident) => api.airportPhotos(ident)));
  return idents.flatMap((ident, i) => {
    const found = pictures[i];
    const shown = found?.status === "fulfilled" ? [found.value.aerial_url, ...(found.value.photo ? [found.value.photo.url] : [])] : [];
    return [`/api/planner/airport/${encodeURIComponent(ident)}/services`, ...shown];
  });
}

/**
 * Fetches every corridor tile of `kind` at `zooms`, the route's
 * airports' diagrams and its stops' services and pictures, reporting progress; resolves with the final
 * count. A tile that fails (a 404 where the kind has no sheet, a
 * dropped connection) is counted and skipped.
 */
export async function keepRouteCharts(
  course: Course,
  kind: string,
  zooms: number[],
  onProgress: (p: KeepProgress) => void,
  signal?: AbortSignal,
): Promise<KeepProgress> {
  if (!(await workerReady())) throw new NoServiceWorker();
  // The route's own answers first -- its course, checkpoints, nav log and
  // briefing, as the page asked them (routeAnswers) -- each read to its
  // end so the worker keeps it whole: a kept route then plans offline.
  const ends = { dep: course.departure.ident, dest: course.destination.ident };
  await Promise.allSettled(routeAnswersAsked(ends).map((url) => fetch(url, { signal }).then((res) => res.arrayBuffer())));
  const urls = [
    ...(await routeDiagrams(course)),
    ...(await routeStopsKept(course)),
    ...corridorTiles(course.course_line as [number, number][], zooms).map((t) => tileUrl(course, kind, t.z, t.x, t.y)),
  ];
  const progress: KeepProgress = { done: 0, total: urls.length, failed: 0 };
  onProgress({ ...progress });
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++]!;
      try {
        const res = await fetch(url, { signal, priority: "low" });
        // A 404 for a runway crop is the field having none (the card draws
        // its sketch), not a failure to keep.
        if (!res.ok && !(res.status === 404 && url.includes("/runways/"))) progress.failed++;
      } catch {
        if (signal?.aborted) return;
        progress.failed++;
      }
      progress.done++;
      onProgress({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return progress;
}
